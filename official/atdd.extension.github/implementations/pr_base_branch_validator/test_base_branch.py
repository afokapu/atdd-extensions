"""Real behavior tests for the github.pr.base-must-be-default-branch implementation.

The python-pytest provider discovers this directory's atdd.implementation.yaml
and runs this suite; green means the implementation is healthy.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import base_branch as check  # noqa: E402


def test_base_equals_default_passes() -> None:
    assert check.check_base_branch("main", "main") == []


def test_base_not_default_violates() -> None:
    violations = check.check_base_branch("feat/x", "main", pr_ref="PR#7")
    assert len(violations) == 1
    v = violations[0]
    assert v["rule_id"] == check.RULE_ID
    assert v["location"] == "PR#7"
    assert "default branch" in v["evidence"]


def test_non_main_default_is_honored() -> None:
    # A repo whose default branch is not 'main' still passes when base matches.
    assert check.check_base_branch("trunk", "trunk") == []
    assert len(check.check_base_branch("main", "trunk")) == 1
