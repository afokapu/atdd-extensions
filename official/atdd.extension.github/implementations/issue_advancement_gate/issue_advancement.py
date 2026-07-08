"""Implementation of github.issue.auto-phase-on-merge — the issue-advancement gate.

Pure decision: a PR that auto-closes its OWN linked ATDD issue (via
Closes/Fixes/Resolves #N or the closingIssuesReferences field) must leave that
issue at a phase where the lifecycle is delivered — REFACTOR or COMPLETE, with
SMOKE as the advance-in-progress boundary. If the delivering (own) PR auto-closes
an issue that is still OPEN and stuck at an early phase (INIT/PLANNED/RED/GREEN),
the ATDD lifecycle was skipped: GitHub's auto-close fires before the phases ran
(the #256 stale-issue incident, where a PR merges but its issue never advanced).
Realizes the core single-step-advance-on-delivery expectation on the GitHub
platform.

Scope (mirrors core #1296's `_current_pr_number` logic): the gate is BLOCKING
only for the *own* PR — the PR currently under evaluation. Cross-PR observations
are advisory; the caller decides own-vs-cross and passes `is_own_pr`. This
function returns no blocking violation for a cross-PR fact set.

No GitHub API — the caller supplies every fact: whether the PR merged, whether it
is the own PR, whether it auto-closes an issue, and that issue's phase label +
open/closed state. Own-vs-cross determination and closing-reference parsing stay
outside (the runtime wagon's job), keeping this deterministic and testable.
"""
from __future__ import annotations

RULE_ID = "github.issue.auto-phase-on-merge"

# Early phases: a delivering PR's auto-close here is premature — closing the
# issue skips the remaining lifecycle.
_ADVANCEMENT_BLOCKED = frozenset({"INIT", "PLANNED", "RED", "GREEN"})
# Delivered-enough phases: auto-close is legitimate. SMOKE is the
# advance-in-progress boundary (auto-phase advances SMOKE->REFACTOR on merge) and
# is treated as satisfied, not blocking.
_ADVANCEMENT_OK = frozenset({"SMOKE", "REFACTOR", "COMPLETE"})
# Escape phases — the standard 6-phase advancement does not apply.
_OUT_OF_SCOPE = frozenset({"BLOCKED", "OBSOLETE"})

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
    pr_ref: str = "PR",
) -> list[dict]:
    """Return a violation iff the own PR auto-closes an open, un-advanced issue.

    Empty list == clean. At most one violation is returned.
    """
    # A PR that closes no issue can never advance one prematurely.
    if not auto_closes_issue:
        return []
    # Cross-PR is advisory only (core #1296 own-PR scoping) — never blocking here.
    if not is_own_pr:
        return []
    # Already closed: GitHub's auto-close ran; nothing left to gate (terminal-safe).
    if _normalize(issue_state) in _CLOSED_STATES:
        return []

    phase = _normalize(issue_phase)
    merged_desc = "merged" if pr_merged else "open"

    if phase in _ADVANCEMENT_OK or phase in _OUT_OF_SCOPE:
        return []

    if phase in _ADVANCEMENT_BLOCKED:
        return [
            {
                "rule_id": RULE_ID,
                "location": pr_ref,
                "evidence": (
                    f"{pr_ref} ({merged_desc}) auto-closes an ATDD issue still at "
                    f"atdd:{phase}; the linked issue must advance to REFACTOR/"
                    f"COMPLETE before its delivering PR closes it"
                ),
            }
        ]

    # Unknown / missing phase label — fail closed (treat as blocking) rather than
    # silently allow a premature auto-close.
    return [
        {
            "rule_id": RULE_ID,
            "location": pr_ref,
            "evidence": (
                f"{pr_ref} ({merged_desc}) auto-closes an issue with unrecognized "
                f"phase {issue_phase!r}"
            ),
        }
    ]
