"""Real behavior tests for the github.command.forbidden-gh-patterns implementation."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import forbidden_command as check  # noqa: E402


def test_gh_issue_create_is_blocked() -> None:
    v = check.classify_command("gh issue create --title x")
    assert len(v) == 1
    assert v[0]["rule_id"] == check.RULE_ID
    assert "ATDD-FORBID-GH-ISSUE-CREATE" in v[0]["evidence"]


def test_gh_pr_create_is_blocked() -> None:
    v = check.classify_command("gh pr create --fill")
    assert any("ATDD-FORBID-GH-PR-CREATE" in x["evidence"] for x in v)


def test_pr_poll_loop_is_blocked() -> None:
    v = check.classify_command("while true; do gh pr checks 5; sleep 5; done")
    assert any("ATDD-LOOP-GH-PR-POLL" in x["evidence"] for x in v)


def test_extra_whitespace_does_not_evade() -> None:
    assert len(check.classify_command("gh   issue    create")) == 1


def test_allowed_gh_commands_pass() -> None:
    assert check.classify_command("gh pr view 5") == []
    assert check.classify_command("gh issue view 5") == []
    assert check.classify_command("gh api repos/:owner/:repo/issues/5") == []
