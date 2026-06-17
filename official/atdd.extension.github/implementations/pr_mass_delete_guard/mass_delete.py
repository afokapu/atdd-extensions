"""Implementation of github.pr.mass-delete-guard.

Pure decision: a PR that deletes **>100 files OR >10,000 lines** must carry an
approved decommission escape hatch, else it violates. Guards against accidental
mass deletion (e.g. a worktree with core.bare=true). No GitHub API — the caller
supplies the deletion counts, PR title, and commit message bodies.

Escape hatches (either satisfies):
  * a PR title beginning with `chore(decom`, `refactor(remove`, or `chore(archive`
  * any commit body containing the exact token `[mass-delete-approved]`
"""
from __future__ import annotations

RULE_ID = "github.pr.mass-delete-guard"

FILE_THRESHOLD = 100
LINE_THRESHOLD = 10_000

_TITLE_PREFIXES = ("chore(decom", "refactor(remove", "chore(archive")
_APPROVAL_TOKEN = "[mass-delete-approved]"


def _exceeds(deleted_files: int, deleted_lines: int) -> bool:
    return deleted_files > FILE_THRESHOLD or deleted_lines > LINE_THRESHOLD


def _has_escape_hatch(title: str, commit_bodies: list[str]) -> bool:
    if title.strip().startswith(_TITLE_PREFIXES):
        return True
    return any(_APPROVAL_TOKEN in (body or "") for body in commit_bodies)


def check_mass_delete(
    deleted_files: int,
    deleted_lines: int,
    *,
    title: str = "",
    commit_bodies: list[str] | None = None,
    pr_ref: str = "PR",
) -> list[dict]:
    """Return a violation iff the PR exceeds a threshold without an escape hatch."""
    commit_bodies = commit_bodies or []
    if not _exceeds(deleted_files, deleted_lines):
        return []
    if _has_escape_hatch(title, commit_bodies):
        return []
    return [
        {
            "rule_id": RULE_ID,
            "location": pr_ref,
            "evidence": (
                f"PR deletes {deleted_files} files / {deleted_lines} lines "
                f"(>{FILE_THRESHOLD} files or >{LINE_THRESHOLD} lines) "
                "without an approved decommission escape hatch"
            ),
        }
    ]
