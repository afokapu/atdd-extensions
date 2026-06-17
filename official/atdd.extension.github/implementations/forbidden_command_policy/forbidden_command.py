"""Implementation of github.command.forbidden-gh-patterns.

Pure command-policy classifier: the GitHub subset of the forbidden-commands
registry. `gh issue create` and `gh pr create` bypass the atdd label-scoped
validators and are hard-blocked; `gh pr` polling loops (busy-waiting on CI) are
blocked too. Operates on a command string — no shell, no execution.
"""
from __future__ import annotations

import re

RULE_ID = "github.command.forbidden-gh-patterns"

# (pattern, policy-id) — ATDD-FORBID-GH-* / ATDD-LOOP-GH-PR-POLL.
_FORBIDDEN = (
    (re.compile(r"\bgh\s+issue\s+create\b"), "ATDD-FORBID-GH-ISSUE-CREATE"),
    (re.compile(r"\bgh\s+pr\s+create\b"), "ATDD-FORBID-GH-PR-CREATE"),
    (re.compile(r"\bwhile\b.*\bgh\s+pr\s+(checks|view)\b"), "ATDD-LOOP-GH-PR-POLL"),
)


def classify_command(command: str, *, location: str = "command") -> list[dict]:
    """Return a violation for each forbidden GitHub pattern the command matches."""
    text = " ".join((command or "").split())  # normalize whitespace
    violations: list[dict] = []
    for pattern, policy_id in _FORBIDDEN:
        if pattern.search(text):
            violations.append(
                {
                    "rule_id": RULE_ID,
                    "location": location,
                    "evidence": f"{policy_id}: forbidden command pattern {pattern.pattern!r}",
                }
            )
    return violations
