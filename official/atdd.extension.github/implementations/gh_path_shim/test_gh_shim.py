"""Real behavior tests for the github.shim.gh-issue-create-blocked implementation."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import gh_shim as check  # noqa: E402


def test_gh_issue_create_is_blocked_nonzero_exit() -> None:
    d = check.shim_decision(["gh", "issue", "create", "--title", "x"])
    assert d["blocked"] is True
    assert d["exit_code"] == check.BLOCK_EXIT_CODE
    assert d["violations"][0]["rule_id"] == check.RULE_ID


def test_leading_global_flags_do_not_evade() -> None:
    d = check.shim_decision(["gh", "--repo", "o/r", "issue", "create"])
    assert d["blocked"] is True


def test_other_gh_subcommands_pass_through() -> None:
    for argv in (["gh", "issue", "view", "5"], ["gh", "pr", "view", "5"], ["gh", "issue", "list"]):
        d = check.shim_decision(argv)
        assert d["blocked"] is False
        assert d["exit_code"] == 0
        assert d["violations"] == []
