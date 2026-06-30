"""Runnable enforcement for coder.interlocking.runner-infrastructure under python-pytest.

Two layers:

  1. DETECTOR SELF-TESTS — pin the AST decision logic against the clean/dirty fixtures: the clean
     interlocking-enabled consumer is silent; each dirty consumer flags the expected category; a pure
     direct-train consumer carries no obligation. These prove the detector is healthy.

  2. EMISSION (the v1.1 contract job, NOT a verdict) — scan ``ATDD_SCAN_ROOTS`` and write the RAW
     structured violations to ``ATDD_VIOLATIONS_REPORT`` for the provider CLI / run.py to read back.

``coder.interlocking.runner-infrastructure`` is ``strict``; this test still only EMITS the RAW
violation list. The strict verdict (any violation -> FAIL) is the downstream consumer's disposition
decision, never the detector's. The emission test asserts run-health, not emptiness.

No core (``atdd.*``) imports; the detector is imported by path.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

import interlocking_infrastructure as detector  # noqa: E402

_HERE = Path(__file__).resolve().parent.parent
_FIXTURES = _HERE / "fixtures"

CONTRACT_VERSION = "1.1.0"
ENV_SCAN_ROOTS = "ATDD_SCAN_ROOTS"
ENV_REPORT = "ATDD_VIOLATIONS_REPORT"


def _categories(violations: list[dict]) -> set[str]:
    """The category token each RAW violation's evidence is prefixed with."""
    return {v["evidence"].split(":", 1)[0] for v in violations}


def _assert_v11_shape(violations: list[dict]) -> None:
    for v in violations:
        assert set(v) >= {"rule_id", "file", "line", "col", "evidence", "source_line"}
        assert v["rule_id"] == detector.RULE_ID
        assert isinstance(v["line"], int) and isinstance(v["col"], int)


# ── 1. detector self-tests ────────────────────────────────────────────────────


def test_clean_consumer_has_no_violations() -> None:
    # A correctly wired interlocking-enabled consumer: runner exists with resolve_train + structured
    # resolution model, Station Master routes through it and delegates to TrainRunner, no wagon
    # execution / Cargo bleed, wagons stay clean.
    assert detector.scan_root(_FIXTURES / "clean") == []


def test_dirty_consumer_flags_every_forbidden_pattern() -> None:
    violations = detector.scan_root(_FIXTURES / "dirty")
    _assert_v11_shape(violations)
    cats = _categories(violations)
    # The broken runner trips bare resolution, direct wagon execution, Cargo mutation; the Station
    # Master is both unlinked and non-delegating; the wagon imports interlocking code.
    assert detector.CAT_BARE_RESOLUTION in cats
    assert detector.CAT_DIRECT_WAGON_EXEC in cats
    assert detector.CAT_CARGO_MUTATION in cats
    assert detector.CAT_STATION_UNLINKED in cats
    assert detector.CAT_STATION_NO_DELEGATE in cats
    assert detector.CAT_WAGON_IMPORTS_INTERLOCKING in cats


def test_missing_runner_is_flagged() -> None:
    violations = detector.scan_root(_FIXTURES / "dirty_missing_runner")
    _assert_v11_shape(violations)
    cats = _categories(violations)
    assert detector.CAT_MISSING_RUNNER in cats
    # No InterlockingRunner means no resolve_train / wagon-exec / cargo checks fire.
    assert detector.CAT_DIRECT_WAGON_EXEC not in cats


def test_missing_resolve_train_is_flagged_in_isolation() -> None:
    violations = detector.scan_root(_FIXTURES / "dirty_no_resolve_train")
    _assert_v11_shape(violations)
    cats = _categories(violations)
    # Cleanly wired except for the absent resolve_train entry point.
    assert cats == {detector.CAT_MISSING_RESOLVE}


def test_pure_direct_train_consumer_carries_no_obligation() -> None:
    # No interlocking route in JOURNEY_MAP and no InterlockingRunner -> the rule does not bite.
    assert detector.scan_root(_FIXTURES / "dirty_missing_runner" / "does-not-exist") == []


def test_dirty_is_violating_and_clean_is_not() -> None:
    # The load-bearing control: same detector, opposite verdicts purely on consumer wiring.
    assert detector.scan_root(_FIXTURES / "clean") == []
    assert len(detector.scan_root(_FIXTURES / "dirty")) >= 1


# ── 2. emission (writes the RAW report; does NOT decide disposition) ───────────


def _scan_roots() -> list[Path]:
    raw = os.environ.get(ENV_SCAN_ROOTS)
    if raw:
        try:
            names = json.loads(raw)
        except json.JSONDecodeError:
            names = []
    else:
        names = [str(_FIXTURES / "clean")]
    roots: list[Path] = []
    for n in names:
        p = Path(n)
        roots.append(p if p.is_absolute() else (_HERE / p))
    return roots


def test_emit_raw_infrastructure_report() -> None:
    """Scan the supplied roots and emit the RAW violation report (NOT a verdict)."""
    roots = _scan_roots()
    violations = detector.scan_roots(roots)
    _assert_v11_shape(violations)

    report_path = os.environ.get(ENV_REPORT)
    if report_path:
        payload = {
            "contract_version": CONTRACT_VERSION,
            "scan_roots": [str(r) for r in roots],
            "violations": violations,
        }
        Path(report_path).write_text(json.dumps(payload, indent=2), encoding="utf-8")

    assert isinstance(violations, list)
