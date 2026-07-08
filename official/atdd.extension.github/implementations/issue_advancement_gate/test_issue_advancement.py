"""Real behavior tests for the github.issue.auto-phase-on-merge implementation
(the post-merge issue-advancement gate).

Mirrors the sibling ``pr_merge_gate`` suite: a table-driven pytest over the pure
decision function, importing the module directly (no GitHub API, no I/O). Each
case supplies a full fact set and asserts the returned violation list.

Rule under test: a PR that auto-closes its OWN linked ATDD issue must leave that
issue advanced (REFACTOR/COMPLETE, with SMOKE as the advance-in-progress
boundary). An own PR that auto-closes an OPEN issue still at INIT/PLANNED/RED/
GREEN skipped the lifecycle (the #256 stale-issue pattern) -> one violation.
Cross-PR is advisory (never blocking here). Unknown/missing phase fails closed.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

import issue_advancement as check  # noqa: E402


def _facts(**overrides) -> dict:
    """A blocking baseline fact set; override one axis per case."""
    base = dict(
        pr_merged=True,
        is_own_pr=True,
        auto_closes_issue=True,
        issue_phase="RED",
        issue_state="OPEN",
        pr_ref="PR#40",
    )
    base.update(overrides)
    return base


# --- RED cases: premature auto-close of an early-phase own issue -------------- #


@pytest.mark.parametrize("phase", ["INIT", "PLANNED", "RED", "GREEN"])
def test_early_phase_own_autoclose_blocks(phase: str) -> None:
    v = check.check_issue_advancement(**_facts(issue_phase=phase))
    assert len(v) == 1
    assert v[0]["rule_id"] == check.RULE_ID
    assert v[0]["location"] == "PR#40"


def test_unknown_phase_fails_closed() -> None:
    v = check.check_issue_advancement(**_facts(issue_phase="FROBNICATE"))
    assert len(v) == 1
    assert v[0]["rule_id"] == check.RULE_ID


def test_none_phase_fails_closed() -> None:
    v = check.check_issue_advancement(**_facts(issue_phase=None))
    assert len(v) == 1


def test_label_prefix_and_case_are_normalized_to_block() -> None:
    assert len(check.check_issue_advancement(**_facts(issue_phase="atdd:red"))) == 1


# --- GREEN / clean cases ----------------------------------------------------- #


@pytest.mark.parametrize("phase", ["REFACTOR", "COMPLETE"])
def test_advanced_phases_are_clean(phase: str) -> None:
    assert check.check_issue_advancement(**_facts(issue_phase=phase)) == []


def test_smoke_is_clean() -> None:
    # SMOKE is the advance-in-progress boundary (auto-phase advances
    # SMOKE->REFACTOR on merge); it is treated as satisfied, not blocking.
    assert check.check_issue_advancement(**_facts(issue_phase="SMOKE")) == []


def test_advanced_prefix_and_case_are_normalized_to_clean() -> None:
    assert check.check_issue_advancement(**_facts(issue_phase="atdd:REFACTOR")) == []


@pytest.mark.parametrize("phase", ["BLOCKED", "OBSOLETE"])
def test_escape_phases_are_out_of_scope(phase: str) -> None:
    assert check.check_issue_advancement(**_facts(issue_phase=phase)) == []


def test_non_autoclosing_pr_is_never_blocked() -> None:
    # Even at RED, a PR that closes no issue cannot advance one prematurely.
    assert check.check_issue_advancement(**_facts(auto_closes_issue=False)) == []


def test_closed_issue_is_clean() -> None:
    # GitHub's auto-close already ran; nothing left to gate (terminal-safe).
    assert check.check_issue_advancement(**_facts(issue_state="CLOSED")) == []
    assert check.check_issue_advancement(**_facts(issue_state="closed")) == []


def test_cross_pr_is_advisory_not_blocking() -> None:
    # core #1296: BLOCKING is scoped to the own PR; cross-PR is advisory only.
    assert check.check_issue_advancement(**_facts(is_own_pr=False)) == []


def test_decision_is_merge_agnostic() -> None:
    # pr_merged annotates evidence but does not change the decision: the gate
    # blocks the pre-merge (delivering) and detects the post-merge (stale) case
    # on the same criteria.
    merged = check.check_issue_advancement(**_facts(pr_merged=True))
    open_pr = check.check_issue_advancement(**_facts(pr_merged=False))
    assert len(merged) == 1 and len(open_pr) == 1
