"""Implementation of github.issue.auto-phase-on-merge — the issue-advancement gate.

Faithful migration of core's SPEC-COACH-PRGATE-0003
(``src/atdd/coach/validators/test_issue_advancement.py``,
``scan_issue_advancement`` / ``_STALE_PHASES``) into a PURE decision core on the
GitHub platform. No GitHub API, no I/O — the caller supplies every fact.

Rule (mirrors the core validator exactly): a MERGED PR that auto-closes its OWN
linked ATDD issue must not leave that issue still OPEN and stuck at an early
phase. "Early" is exactly ``{INIT, PLANNED}`` (core ``_STALE_PHASES``) — a merged
PR whose linked issue is still at INIT/PLANNED means the lifecycle was skipped
(the #256 stale-issue incident). Every other phase (RED, GREEN, SMOKE, REFACTOR,
and the terminal COMPLETE/OBSOLETE) counts as advanced → clean.

Deliberate fail-OPEN semantics, faithful to core:
  * unknown / missing phase label → NO violation (core: ``if phase is None:
    continue``; an unrecognized phase simply isn't in ``_STALE_PHASES``). This
    avoids false positives on an unresolvable phase.
  * closed issue → clean (core skips ``issue_state == "CLOSED"`` — GitHub's
    auto-close already handled it).
  * terminal COMPLETE/OBSOLETE → clean (never re-advanced).
  * non-lifecycle issue (tracking/meta/epic/parent) → clean (core
    ``_issue_is_non_lifecycle`` skip). The caller supplies ``non_lifecycle``.

Scope (core #1296's ``_current_pr_number`` logic): BLOCKING only for the *own*
PR under evaluation; cross-PR observations are advisory — the caller decides
own-vs-cross and passes ``is_own_pr``. ``pr_merged`` is a hard precondition: the
core validator only ever scans merged PRs (post-merge stale detection), so an
unmerged PR is never gated here.
"""
from __future__ import annotations

RULE_ID = "github.issue.auto-phase-on-merge"

# Core _STALE_PHASES: a merged PR whose linked issue is still here skipped the
# lifecycle. Everything else (RED/GREEN/SMOKE/REFACTOR + terminal + unknown) is
# treated as advanced / out-of-scope → clean (fail-open).
_STALE_PHASES = frozenset({"INIT", "PLANNED"})

_CLOSED_STATES = frozenset({"CLOSED"})


def _normalize(value: str | None) -> str:
    if value is None:
        return ""
    return value.strip().removeprefix("atdd:").upper()


def check_issue_advancement(
    *,
    pr_merged: bool,
    is_own_pr: bool,
    auto_closes_issue: bool,
    issue_phase: str | None,
    issue_state: str | None,
    non_lifecycle: bool = False,
    pr_ref: str = "PR",
) -> list[dict]:
    """Return a violation iff a merged own PR left an open INIT/PLANNED issue.

    Empty list == clean. At most one violation is returned.
    """
    # Post-merge stale detection only: the core validator scans merged PRs.
    if not pr_merged:
        return []
    # A PR that closes no issue can never leave one stale via auto-close.
    if not auto_closes_issue:
        return []
    # Cross-PR is advisory only (core #1296 own-PR scoping) — never blocking here.
    if not is_own_pr:
        return []
    # Already closed: GitHub's auto-close ran; nothing to gate (core CLOSED skip).
    if _normalize(issue_state) in _CLOSED_STATES:
        return []
    # Non-lifecycle issue (tracking/meta/epic/parent) — advancement is the
    # cumulative state of children, not a single label transition (core skip).
    if non_lifecycle:
        return []

    phase = _normalize(issue_phase)
    # Fail-OPEN on an unresolvable/unknown phase (core: phase is None → skip; an
    # unrecognized phase is simply not in _STALE_PHASES). No false positives.
    if phase not in _STALE_PHASES:
        return []

    return [
        {
            "rule_id": RULE_ID,
            "location": pr_ref,
            "evidence": (
                f"{pr_ref} merged but auto-closes an ATDD issue still at "
                f"atdd:{phase}; a merged PR's linked issue must have advanced past "
                f"INIT/PLANNED (lifecycle skipped — SPEC-COACH-PRGATE-0003)"
            ),
        }
    ]
