"""GitHub State-Store sync provider + inbox ingester (ext#40 Phase 2, Deliverable B).

Realizes ``github.state.sync-store-from-issues`` — the GitHub-platform half of the
provider-agnostic sync seam core ships in ``afokapu/atdd#1364``. Core drives
providers registered by name and knows nothing of GitHub; THIS module is the
GitHub provider. Two directions, both provider-specific and living HERE (never in
core):

- **ingest (remote→local)** — poll ``gh issue list --json number,title,state,labels``,
  map each issue to a canonical inbox event, and ``store.sync.enqueue_inbox("github", …)``.
  Core's ``apply_inbox`` (already shipped) drains those events onto local object
  state. This closes the ingest gap (nothing filled the inbox before).
- **push (local→remote)** — the relocated ``GitHubSyncProvider.push`` (create_issue /
  add_label / comment), returning a ``PushOutcome`` ref for core to record.

Separation discipline (the 4.0.0 core/extension split — see release_worker.py):
this module **never imports** ``atdd``. It duck-types the store's shipped surface
(``store.sync.enqueue_inbox``, ``store.external_refs.resolve``) and conforms
*structurally* to core's ``atdd.state.sync_engine.SyncProvider`` Protocol
(``name`` + ``push`` + the optional ``ingest(store)`` hook core added in #1364).
``gh`` access is injectable so tests never shell out; at runtime the real store
and a real ``gh`` client are supplied by the extension runner.
"""
from __future__ import annotations

import json
import logging
import subprocess
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Sequence

_log = logging.getLogger(__name__)

# --------------------------------------------------------------------------- #
# Contract constants — MUST mirror core (atdd.state.sync_engine) by VALUE, not
# import (that decoupling IS the separation; the conformance test pins them).
# --------------------------------------------------------------------------- #
#: the outbox/inbox routing key this provider claims (core's DEFAULT_PROVIDER).
DEFAULT_PROVIDER = "github"
#: core's canonical inbox event kinds (atdd.state.sync_engine).
EVENT_EXTERNAL_STATE = "external_state"        # remote phase → set local object state
EVENT_EXTERNAL_IMPORTED = "external_imported"  # remote item imported → upsert + link ref
#: external_ref.ref_kind for a GitHub issue.
ISSUE_REF_KIND = "issue"
#: the marker label every atdd-tracked issue carries.
ATDD_ISSUE_LABEL = "atdd-issue"
#: phase labels are ``atdd:<PHASE>``.
PHASE_LABEL_PREFIX = "atdd:"
#: terminal local state applied when a tracked issue is closed on GitHub.
CLOSED_STATE = "COMPLETE"


@dataclass(frozen=True)
class PushOutcome:
    """An external ref for core's drain engine to record (mirror of core's type)."""

    object_uid: Optional[str] = None
    ref_kind: Optional[str] = None
    ref_value: Optional[str] = None
    ref_data: Dict[str, Any] = field(default_factory=dict)

    @property
    def records_ref(self) -> bool:
        return bool(self.object_uid and self.ref_kind and self.ref_value)


# --------------------------------------------------------------------------- #
# GitHub client — the only place that shells to ``gh``; faked in tests.
# --------------------------------------------------------------------------- #
def _run_gh(args: Sequence[str]) -> str:
    proc = subprocess.run(["gh", *args], capture_output=True, text=True, check=True)
    return proc.stdout


class GitHubClient:
    """Minimal ``gh`` operations for push + poll-ingest (real; subbed in tests)."""

    def create_issue(self, title: str, body: str, labels: Sequence[str]) -> str:
        args = ["issue", "create", "--title", title, "--body", body]
        for label in labels:
            args += ["--label", label]
        url = _run_gh(args)
        return url.rstrip("/").rsplit("/", 1)[-1]

    def add_label(self, issue_number: str, label: str) -> None:
        _run_gh(["issue", "edit", str(issue_number), "--add-label", label])

    def add_comment(self, issue_number: str, body: str) -> None:
        _run_gh(["issue", "comment", str(issue_number), "--body", body])

    def list_issues(self, *, label: str = ATDD_ISSUE_LABEL, state: str = "all",
                    limit: int = 200) -> List[Dict[str, Any]]:
        """Poll issues (reuses reconcile()'s fetch shape: number,title,state,labels)."""
        out = _run_gh(["issue", "list", "--label", label, "--state", state,
                       "--limit", str(limit), "--json", "number,title,state,labels"])
        return json.loads(out or "[]")


# --------------------------------------------------------------------------- #
# Pure mapper — gh issue dict → canonical inbox event (no I/O, table-testable).
# --------------------------------------------------------------------------- #
def phase_from_labels(labels: Optional[Sequence[Any]]) -> Optional[str]:
    """Extract the ``atdd:<PHASE>`` phase from a gh issue's labels, or None."""
    for lbl in labels or []:
        name = lbl.get("name", "") if isinstance(lbl, dict) else str(lbl)
        if name.startswith(PHASE_LABEL_PREFIX) and name != ATDD_ISSUE_LABEL:
            return name[len(PHASE_LABEL_PREFIX):].upper()
    return None


def map_issue_to_event(issue: Dict[str, Any], *, known_ref: bool) -> Optional[Dict[str, Any]]:
    """Map one gh issue dict to a canonical inbox event (or None → nothing to sync).

    - **closed** issue → ``EVENT_EXTERNAL_STATE`` with the terminal ``CLOSED_STATE``;
    - **known** (a local external_ref already exists) + a phase label →
      ``EVENT_EXTERNAL_STATE`` carrying that phase;
    - **new/missing** (no local ref) → ``EVENT_EXTERNAL_IMPORTED`` (core upserts the
      work_item and links the ref);
    - known but no phase label and open → ``None`` (nothing changed).

    ``known_ref`` is supplied by :func:`ingest_issues` after a store lookup so this
    mapper stays pure and unit-testable.
    """
    number = issue.get("number")
    if number is None:
        return None
    ref_value = str(number)
    gh_state = (issue.get("state") or "").lower()
    phase = phase_from_labels(issue.get("labels"))

    if gh_state == "closed":
        return {"kind": EVENT_EXTERNAL_STATE, "ref_kind": ISSUE_REF_KIND,
                "ref_value": ref_value, "state": CLOSED_STATE}
    if known_ref:
        if phase is None:
            return None
        return {"kind": EVENT_EXTERNAL_STATE, "ref_kind": ISSUE_REF_KIND,
                "ref_value": ref_value, "state": phase}
    return {"kind": EVENT_EXTERNAL_IMPORTED, "ref_kind": ISSUE_REF_KIND,
            "ref_value": ref_value, "uid": f"{DEFAULT_PROVIDER}-{ISSUE_REF_KIND}-{ref_value}",
            "state": phase, "data": {"title": issue.get("title", "")}}


# --------------------------------------------------------------------------- #
# Ingester — poll → map → enqueue_inbox (the remote→local fill; core drains).
# --------------------------------------------------------------------------- #
@dataclass
class IngestResult:
    fetched: int = 0
    enqueued: int = 0
    skipped: int = 0
    errors: List[str] = field(default_factory=list)


def ingest_issues(store: Any, *, client: Optional[GitHubClient] = None,
                  provider: str = DEFAULT_PROVIDER,
                  label: str = ATDD_ISSUE_LABEL) -> IngestResult:
    """Poll GitHub issues and enqueue a canonical inbox event for each.

    Idempotency + import/state routing is decided per issue by whether a local
    ``external_ref`` already resolves. Enqueue only — draining is core's
    ``apply_inbox`` (provider-agnostic). One malformed issue is isolated so a
    single bad row never aborts the poll.
    """
    client = client or GitHubClient()
    result = IngestResult()
    for issue in client.list_issues(label=label):
        result.fetched += 1
        try:
            number = issue.get("number")
            known = number is not None and store.external_refs.resolve(
                provider, ISSUE_REF_KIND, str(number)) is not None
            event = map_issue_to_event(issue, known_ref=known)
            if event is None:
                result.skipped += 1
                continue
            store.sync.enqueue_inbox(provider, event)
            result.enqueued += 1
        except Exception as exc:  # noqa: BLE001 — per-issue isolation
            result.errors.append(f"issue#{issue.get('number')}: {exc}")
            _log.warning("github ingest failed for issue",
                         extra={"issue": issue.get("number"), "error": str(exc)})
    return result


# --------------------------------------------------------------------------- #
# SyncProvider — relocated push (from core) + the ingest hook (#1364 contract).
# --------------------------------------------------------------------------- #
class GitHubSyncProvider:
    """A core-compatible ``SyncProvider`` for GitHub (push + ingest).

    Structurally conforms to ``atdd.state.sync_engine.SyncProvider``:
    ``name`` + ``push(operation, payload) -> Optional[PushOutcome]`` + the optional
    ``ingest(store)`` hook. Core's ``push_outbox``/``ingest_inbox`` drive it via the
    registry seam without core importing this module.
    """

    def __init__(self, client: Optional[GitHubClient] = None, *,
                 provider: str = DEFAULT_PROVIDER) -> None:
        self.name = provider
        self._client = client or GitHubClient()

    def push(self, operation: str, payload: Dict[str, Any]) -> Optional[PushOutcome]:
        if operation == "create_issue":
            number = self._client.create_issue(
                payload.get("title", ""), payload.get("body", ""),
                payload.get("labels", []) or [])
            return PushOutcome(object_uid=payload.get("object_uid"), ref_kind=ISSUE_REF_KIND,
                               ref_value=str(number), ref_data={"source": "outbox-create"})
        if operation == "add_label":
            self._client.add_label(str(payload.get("issue_number") or payload["ref_value"]),
                                   payload["label"])
            return None
        if operation == "comment":
            self._client.add_comment(str(payload.get("issue_number") or payload["ref_value"]),
                                     payload.get("body", ""))
            return None
        raise ValueError(f"unknown github outbox operation: {operation!r}")

    def ingest(self, store: Any) -> None:
        """Fill the inbox from GitHub (remote→local); invoked by core's ingest_inbox."""
        ingest_issues(store, client=self._client, provider=self.name)


def provider_factory() -> GitHubSyncProvider:
    """Registration/entry-point factory: ``() -> GitHubSyncProvider``."""
    return GitHubSyncProvider()


def register(register_provider: Callable[[str, Callable[[], Any]], None]) -> None:
    """Register this provider into core's seam (called by the extension runner).

    The runner is the composition root: it imports core's
    ``atdd.state.providers.register_provider`` AND this module, then calls this.
    Core never imports this module (extension→obligation, never core→provider).
    """
    register_provider(DEFAULT_PROVIDER, provider_factory)
