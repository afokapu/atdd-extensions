"""Real behavior tests for the github.pr.mass-delete-guard implementation."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import mass_delete as check  # noqa: E402


def test_under_thresholds_passes() -> None:
    assert check.check_mass_delete(50, 500) == []


def test_over_file_threshold_without_hatch_violates() -> None:
    v = check.check_mass_delete(101, 0, pr_ref="PR#9")
    assert len(v) == 1
    assert v[0]["rule_id"] == check.RULE_ID
    assert v[0]["location"] == "PR#9"


def test_over_line_threshold_without_hatch_violates() -> None:
    assert len(check.check_mass_delete(1, 10_001)) == 1


def test_title_prefix_escape_hatch_clears() -> None:
    assert check.check_mass_delete(200, 50_000, title="chore(decom): retire legacy module") == []
    assert check.check_mass_delete(200, 50_000, title="refactor(remove): drop dead path") == []


def test_commit_token_escape_hatch_clears() -> None:
    assert (
        check.check_mass_delete(
            200, 50_000, commit_bodies=["body line\n[mass-delete-approved]\n"]
        )
        == []
    )


def test_threshold_is_strict_greater_than() -> None:
    # exactly at the boundary does NOT exceed
    assert check.check_mass_delete(100, 10_000) == []
