"""Real behavior tests for the github.issue.auto-phase-on-merge implementation
(the issue-advancement gate — a faithful migration of core SPEC-COACH-PRGATE-0003).

Mirrors the sibling ``pr_merge_gate`` suite: a table-driven pytest over the pure
decision function, importing the module directly (no GitHub API, no I/O).

Rule under test (core ``_STALE_PHASES``): a MERGED PR that auto-closes its OWN
linked ATDD issue must not leave that issue OPEN and stuck at INIT/PLANNED. Only
``{INIT, PLANNED}`` block; every other phase (RED/GREEN/SMOKE/REFACTOR/terminal)
is advanced → clean. Fail-OPEN on unknown/None phase. Closed / terminal /
non-lifecycle issues are skipped. Cross-PR is advisory. ``pr_merged`` is a hard
precondition (post-merge stale detection only).
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

import issue_advancement as check  # noqa: E402


def _facts(**overrides) -> dict:
    """A blocking baseline fact set (merged own PR, open INIT issue)."""
    base = dict(
        pr_merged=True,
        is_own_pr=True,
        auto_closes_issue=True,
        issue_phase="INIT",
        issue_state="OPEN",
        non_lifecycle=False,
        pr_ref="PR#40",
    )
    base.update(overrides)
    return base


# --- RED cases: merged own PR left an open INIT/PLANNED issue ----------------- #


@pytest.mark.parametrize("phase", ["INIT", "PLANNED"])
def test_stale_phase_own_autoclose_blocks(phase: str) -> None:
    v = check.check_issue_advancement(**_facts(issue_phase=phase))
    assert len(v) == 1
    assert v[0]["rule_id"] == check.RULE_ID
    assert v[0]["location"] == "PR#40"


def test_stale_phase_prefix_and_case_are_normalized_to_block() -> None:
    assert len(check.check_issue_advancement(**_facts(issue_phase="atdd:init"))) == 1


# --- GREEN / clean cases ----------------------------------------------------- #


@pytest.mark.parametrize("phase", ["RED", "GREEN", "SMOKE", "REFACTOR", "COMPLETE"])
def test_advanced_phases_are_clean(phase: str) -> None:
    # Only INIT/PLANNED are stale; RED/GREEN/SMOKE/REFACTOR/terminal are advanced.
    assert check.check_issue_advancement(**_facts(issue_phase=phase)) == []


@pytest.mark.parametrize("phase", ["COMPLETE", "OBSOLETE"])
def test_terminal_phases_are_clean(phase: str) -> None:
    assert check.check_issue_advancement(**_facts(issue_phase=phase)) == []


def test_unknown_phase_is_clean_fail_open() -> None:
    # Fail-OPEN: an unrecognized phase isn't in _STALE_PHASES → no violation.
    assert check.check_issue_advancement(**_facts(issue_phase="FROBNICATE")) == []


def test_none_phase_is_clean_fail_open() -> None:
    # Core: `if phase is None: continue` — deliberately no false positive.
    assert check.check_issue_advancement(**_facts(issue_phase=None)) == []


def test_advanced_prefix_and_case_are_normalized_to_clean() -> None:
    assert check.check_issue_advancement(**_facts(issue_phase="atdd:REFACTOR")) == []


def test_non_autoclosing_pr_is_never_blocked() -> None:
    # Even at INIT, a PR that closes no issue cannot leave one stale.
    assert check.check_issue_advancement(**_facts(auto_closes_issue=False)) == []


def test_closed_issue_is_clean() -> None:
    # GitHub's auto-close already ran; core skips CLOSED issues.
    assert check.check_issue_advancement(**_facts(issue_state="CLOSED")) == []
    assert check.check_issue_advancement(**_facts(issue_state="closed")) == []


def test_non_lifecycle_issue_is_skipped() -> None:
    # Tracking/meta/epic/parent issues advance by children, not a label swap
    # (core _issue_is_non_lifecycle skip) — clean even at INIT.
    assert check.check_issue_advancement(**_facts(non_lifecycle=True)) == []


def test_cross_pr_is_advisory_not_blocking() -> None:
    # core #1296: BLOCKING is scoped to the own PR; cross-PR is advisory only.
    assert check.check_issue_advancement(**_facts(is_own_pr=False)) == []


def test_unmerged_pr_is_not_gated() -> None:
    # Hard precondition: core scans merged PRs only (post-merge stale detection).
    assert check.check_issue_advancement(**_facts(pr_merged=False)) == []
