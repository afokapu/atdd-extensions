"""Implementation of github.shim.gh-issue-create-blocked.

The decision core of the PATH shim (`.atdd/bin/gh`) that hard-blocks
`gh issue create` for any worktree shell process — the L3 enforcement layer that
catches the command even when it bypasses the command-policy classifier. Unlike
forbidden_command_policy (which scans a command STRING), this operates on the
exec **argv** the shim receives, so quoting/whitespace tricks cannot evade it.

A non-zero ``exit_code`` is what the real shim returns to the calling shell; the
violation is the audit record.
"""
from __future__ import annotations

RULE_ID = "github.shim.gh-issue-create-blocked"
BLOCK_EXIT_CODE = 1

# argv subcommands the shim refuses (after argv[0] == "gh").
_BLOCKED_SUBCOMMANDS = (("issue", "create"),)


def _contains_subsequence(argv: list[str], needle: tuple[str, ...]) -> bool:
    # Contiguous match anywhere in argv[1:]. Grammar-agnostic: a value-taking
    # global flag (e.g. `--repo o/r`) cannot push the subcommand out of view, and
    # quoting/whitespace cannot fuse the two tokens (they are separate argv items).
    rest = argv[1:]
    n = len(needle)
    return any(tuple(rest[i : i + n]) == needle for i in range(len(rest) - n + 1))


def shim_decision(argv: list[str]) -> dict:
    """Return {blocked, exit_code, violations} for the argv the shim received."""
    for blocked in _BLOCKED_SUBCOMMANDS:
        if _contains_subsequence(argv, blocked):
            return {
                "blocked": True,
                "exit_code": BLOCK_EXIT_CODE,
                "violations": [
                    {
                        "rule_id": RULE_ID,
                        "location": "gh-shim",
                        "evidence": f"blocked `gh {' '.join(blocked)}` — use `atdd issue <slug>`",
                    }
                ],
            }
    return {"blocked": False, "exit_code": 0, "violations": []}
