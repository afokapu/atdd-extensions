"""Implementation of github.pr.merge-blocks-on-pre-smoke-close.

Pure decision: an open PR that auto-closes an ATDD issue (via Closes/Fixes/
Resolves #N or the closingIssuesReferences field) must reference an issue whose
phase is SMOKE, REFACTOR, or COMPLETE. A PR auto-closing an issue still at RED or
GREEN (or INIT/PLANNED) would fire GitHub's auto-close before the lifecycle is
satisfied (the #681 substrate-asymmetry incident). Realizes the core node
coach.lifecycle.no-terminal-before-lifecycle-satisfied on the GitHub platform.

No GitHub API — the caller supplies whether the PR auto-closes an issue and that
issue's current phase label.
"""
from __future__ import annotations

RULE_ID = "github.pr.merge-blocks-on-pre-smoke-close"

# Auto-close is blocked while the linked issue is pre-SMOKE.
_MERGE_BLOCKED = frozenset({"INIT", "PLANNED", "RED", "GREEN"})
_MERGE_ALLOWED = frozenset({"SMOKE", "REFACTOR", "COMPLETE"})
# BLOCKED / OBSOLETE are out of scope — the gate does not apply.
_OUT_OF_SCOPE = frozenset({"BLOCKED", "OBSOLETE"})


def _normalize(phase: str) -> str:
    return phase.strip().removeprefix("atdd:").upper()


def check_merge_gate(
    auto_closes_issue: bool, issue_phase: str, *, pr_ref: str = "PR"
) -> list[dict]:
    """Return a violation iff a PR auto-closes an issue still in a blocked phase."""
    if not auto_closes_issue:
        return []
    phase = _normalize(issue_phase)
    if phase in _OUT_OF_SCOPE or phase in _MERGE_ALLOWED:
        return []
    if phase in _MERGE_BLOCKED:
        return [
            {
                "rule_id": RULE_ID,
                "location": pr_ref,
                "evidence": (
                    f"{pr_ref} auto-closes an ATDD issue still at atdd:{phase}; "
                    "the issue must reach SMOKE+REFACTOR before merge"
                ),
            }
        ]
    # Unknown phase label — fail closed (treat as blocked) rather than silently allow.
    return [
        {
            "rule_id": RULE_ID,
            "location": pr_ref,
            "evidence": f"{pr_ref} auto-closes an issue with unrecognized phase {issue_phase!r}",
        }
    ]
