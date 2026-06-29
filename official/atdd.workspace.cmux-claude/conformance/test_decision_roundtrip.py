"""Decision-channel round-trip conformance for atdd.workspace.cmux-claude.

The generic suite (``test_runtime_contract.py``) proves the feed + session mechanics.
This drives the ``DecisionChannelAdapter`` end-to-end over a REAL on-disk command-feed
and REAL agent sessions (an injected echo process stands in for the cmux pane, per the
provider's ``command_injectable`` contract) — proving the provider satisfies the core
``atdd.coach.decision_channel`` contract: surface the full payload, SELECT+SUBMIT a
reply so the worker advances (only on a valid option — the #1009 silent-success footgun
is refused), and escalate durably.

CROSS-REPO CONTRACT: the payload field names below ARE the contract with core's
``DecisionRequest`` / ``DecisionReply``. The provider does not import core; it carries
exactly these fields. Keep in sync.

STATUS: hermetic conformance (injected echo worker + on-disk feed). The real LIVE smoke
replaces the echo deliverer with the cmux-pane option-select + submit keystroke against
a live Claude worker — same adapter, same assertions.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "adapter"))

import decision_channel as dc  # noqa: E402
import feed as feed_mod  # noqa: E402
import session as session_mod  # noqa: E402

# A trivial worker: echo the delivered reply, so "delivered cleanly" == "advanced".
# WIRE: production replaces this with the cmux+claude launch argv (select + submit).
_ECHO_WORKER = [
    sys.executable,
    "-c",
    "import sys;sys.stdout.write('ADVANCED:'+sys.stdin.read())",
]

_PERMISSION = {
    "request_id": "req-1",
    "kind": "permissionRequest",
    "tool": "Bash",
    "tool_input": {"command": "git push", "description": "push branch"},
    "agent_id": "workstream-7",
    "options": [{"label": "Yes"}, {"label": "No"}],
}
_QUESTION = {
    "request_id": "req-2",
    "kind": "question",
    "tool": "AskUserQuestion",
    "tool_input": {},
    "agent_id": "workstream-7",
    "options": [{"label": "Blue"}, {"label": "Green"}],
    "prompt": "Which color?",
    "multi_select": False,
}
_DECISION_FIELDS = {"request_id", "kind", "tool", "tool_input", "agent_id", "options"}


def _deliver(prompt: str) -> bool:
    """Deliver a reply into a worker session; True == the worker advanced."""
    return session_mod.open_session(_ECHO_WORKER, prompt=prompt).delivered


def _adapter(tmp_path):
    feed = feed_mod.CommandFeed(tmp_path / "decisions.jsonl")
    feed.append(_PERMISSION)
    feed.append(_QUESTION)
    return dc.DecisionChannelAdapter(feed, deliver=_deliver), feed


# ── surface ───────────────────────────────────────────────────────────────────


def test_surface_pending_yields_full_payload(tmp_path):
    adapter, _ = _adapter(tmp_path)
    pending = adapter.surface_pending()
    assert {d["request_id"] for d in pending} == {"req-1", "req-2"}
    for d in pending:
        assert _DECISION_FIELDS <= set(d)
    q = next(d for d in pending if d["kind"] == "question")
    assert q["prompt"] == "Which color?"


# ── deliver_reply: SELECT + SUBMIT advances; footgun refused ────────────────────


def test_valid_reply_selects_submits_and_resolves(tmp_path):
    adapter, _ = _adapter(tmp_path)
    result = adapter.deliver_reply("req-1", ["Yes"])
    assert result["advanced"] is True
    # the decision is resolved — no longer surfaced
    assert "req-1" not in {d["request_id"] for d in adapter.surface_pending()}


def test_non_matching_selection_does_not_advance(tmp_path):
    """The #1009/C009 footgun: a label that matches no option must NOT report success."""
    adapter, _ = _adapter(tmp_path)
    result = adapter.deliver_reply("req-2", ["Purple"])  # not an option
    assert result["advanced"] is False
    # decision stays pending — the worker was not falsely advanced
    assert "req-2" in {d["request_id"] for d in adapter.surface_pending()}


def test_empty_selection_does_not_advance(tmp_path):
    adapter, _ = _adapter(tmp_path)
    assert adapter.deliver_reply("req-1", [])["advanced"] is False


# ── escalate: durable ───────────────────────────────────────────────────────────


def test_escalation_is_durable_and_unsurfaces(tmp_path):
    adapter, feed = _adapter(tmp_path)
    escalated = adapter.escalate("req-2", reason="dangerous: unmediated")
    assert escalated["durable"] is True
    assert "req-2" not in {d["request_id"] for d in adapter.surface_pending()}
    # survives a restart (new feed handle over the same file)
    reopened = dc.DecisionChannelAdapter(
        feed_mod.CommandFeed(feed._path if hasattr(feed, "_path") else tmp_path / "decisions.jsonl"),
        deliver=_deliver,
    )
    seen = [m.payload for m in feed_mod.CommandFeed(tmp_path / "decisions.jsonl").poll(0)]
    assert any(p.get("status") == "escalated" and p.get("request_id") == "req-2" for p in seen)
    assert "req-2" not in {d["request_id"] for d in reopened.surface_pending()}
