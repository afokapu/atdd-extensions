"""Real behavior tests for the github.pr.merge-blocks-on-pre-smoke-close implementation."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

import merge_gate as check  # noqa: E402


def test_non_autoclosing_pr_is_never_blocked() -> None:
    assert check.check_merge_gate(False, "RED") == []


@pytest.mark.parametrize("phase", ["INIT", "PLANNED", "RED", "GREEN"])
def test_pre_smoke_phases_block(phase: str) -> None:
    v = check.check_merge_gate(True, phase, pr_ref="PR#11")
    assert len(v) == 1
    assert v[0]["rule_id"] == check.RULE_ID
    assert v[0]["location"] == "PR#11"


@pytest.mark.parametrize("phase", ["SMOKE", "REFACTOR", "COMPLETE"])
def test_smoke_and_after_allow(phase: str) -> None:
    assert check.check_merge_gate(True, phase) == []


@pytest.mark.parametrize("phase", ["BLOCKED", "OBSOLETE"])
def test_out_of_scope_phases_do_not_apply(phase: str) -> None:
    assert check.check_merge_gate(True, phase) == []


def test_label_prefix_and_case_are_normalized() -> None:
    assert len(check.check_merge_gate(True, "atdd:red")) == 1
    assert check.check_merge_gate(True, "atdd:REFACTOR") == []


def test_unknown_phase_fails_closed() -> None:
    assert len(check.check_merge_gate(True, "FROBNICATE")) == 1
