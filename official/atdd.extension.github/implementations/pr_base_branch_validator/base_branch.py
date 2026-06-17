"""Implementation of github.pr.base-must-be-default-branch.

Pure decision: every PR must target the repo's default branch. Platform-local
guard against merging onto a sibling/non-default base (the deleted-base
orphaning incident). No GitHub API — the caller supplies the PR base ref and the
repo default branch; this returns violations in the ATDD violation-output
contract (``rule_id`` + ``location``).
"""
from __future__ import annotations

RULE_ID = "github.pr.base-must-be-default-branch"


def check_base_branch(base_ref: str, default_branch: str, *, pr_ref: str = "PR") -> list[dict]:
    """Return a violation iff ``base_ref`` is not the repo ``default_branch``."""
    if base_ref == default_branch:
        return []
    return [
        {
            "rule_id": RULE_ID,
            "location": pr_ref,
            "evidence": f"PR base {base_ref!r} is not the repo default branch {default_branch!r}",
        }
    ]
