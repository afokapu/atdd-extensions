"""Conformance suite for Worker W2 — data-access + logging + perf nodes
(contract_version 1.1.0).

These are REAL (not skipped) tests for the four detectors owned by
convex.extension.coder and realized by convex.workspace.runtime implementations:

  * coder.convex.nplus1-db-in-loop     — ctx.db.get/query inside a loop/callback (strict).
  * coder.convex.logging-structured    — server log call with a bare interpolated
                                         string instead of a structured payload (suppress-and-clean).
  * coder.convex.logging-silent-swallow — catch block that neither logs nor rethrows
                                         (suppress-and-clean).
  * coder.convex.performance-perf      — advisory perf smells: await in a loop, or a
                                         full-table .collect() without an index (documentation-only).

They mirror the patterns in test_coder_slices.py / test_provider_contract.py:
discovery returns each detector as a contract-compatible implementation targeting
this workspace, and a run produces RAW v1.1 structured violations through the env +
JSON-report seam (clean fixture → 0, dirty fixture → >= 1). Run-health (exit 0) is
NOT a verdict — a dirty scan still exits 0 / passed=True. Requires `node` on PATH.
"""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

import pytest

_WS = Path(__file__).resolve().parent.parent  # convex.workspace.runtime/
sys.path.insert(0, str(_WS / "adapter"))

import discover as discover_mod  # noqa: E402
import run as run_mod  # noqa: E402

_IMPLS = _WS / "implementations"

requires_node = pytest.mark.skipif(shutil.which("node") is None, reason="node not on PATH")

_REQUIRED_KEYS = {"rule_id", "file", "line", "col", "evidence", "source_line"}


def _impl(dir_name):
    d = _IMPLS / dir_name
    return d / "detect.mjs", d / "fixtures" / "clean", d / "fixtures" / "dirty"


# --- nplus1-db-in-loop ------------------------------------------------------
_N1_DET, _N1_CLEAN, _N1_DIRTY = _impl("convex_nplus1_db_in_loop")
_N1_ID = "coder.convex.nplus1-db-in-loop"


def test_discover_includes_nplus1() -> None:
    impls = discover_mod.discover_implementations(_IMPLS)
    ids = {i.implementation_id for i in impls}
    assert _N1_ID in ids
    for impl in impls:
        assert impl.targets_workspace == "convex.workspace.runtime"


@requires_node
def test_nplus1_clean_yields_no_violations() -> None:
    res = run_mod.run_implementation(_N1_ID, _N1_DET, scan_roots=[str(_N1_CLEAN)], exclude_globs=[])
    assert res.ran
    assert res.structured is True
    assert res.violations == []


@requires_node
def test_nplus1_dirty_yields_raw_v11_violations() -> None:
    res = run_mod.run_implementation(_N1_ID, _N1_DET, scan_roots=[str(_N1_DIRTY)], exclude_globs=[])
    assert res.structured is True
    assert len(res.violations) == 2  # ctx.db.get in for-loop + ctx.db.query in .map()
    for v in res.violations:
        assert set(v) >= _REQUIRED_KEYS
        assert v["rule_id"] == _N1_ID
        assert v["file"].endswith("standings.ts")


@requires_node
def test_nplus1_emits_raw_not_disposition() -> None:
    # run-health (exit 0) is NOT a verdict: a dirty scan still exits 0 / passed=True.
    res = run_mod.run_implementation(_N1_ID, _N1_DET, scan_roots=[str(_N1_DIRTY)], exclude_globs=[])
    assert res.passed is True
    assert res.exit_code == 0
    assert res.violations  # the strict verdict is the downstream consumer's job


# --- logging-structured -----------------------------------------------------
_N2_DET, _N2_CLEAN, _N2_DIRTY = _impl("convex_logging_structured")
_N2_ID = "coder.convex.logging-structured"


def test_discover_includes_logging_structured() -> None:
    ids = {i.implementation_id for i in discover_mod.discover_implementations(_IMPLS)}
    assert _N2_ID in ids


@requires_node
def test_logging_structured_clean_yields_no_violations() -> None:
    res = run_mod.run_implementation(_N2_ID, _N2_DET, scan_roots=[str(_N2_CLEAN)], exclude_globs=[])
    assert res.ran
    assert res.structured is True
    assert res.violations == []


@requires_node
def test_logging_structured_dirty_yields_raw_v11_violations() -> None:
    res = run_mod.run_implementation(_N2_ID, _N2_DET, scan_roots=[str(_N2_DIRTY)], exclude_globs=[])
    assert res.structured is True
    assert len(res.violations) == 2  # template interpolation + string concatenation
    for v in res.violations:
        assert set(v) >= _REQUIRED_KEYS
        assert v["rule_id"] == _N2_ID
        assert v["file"].endswith("audit.ts")


@requires_node
def test_logging_structured_emits_raw_not_disposition() -> None:
    res = run_mod.run_implementation(_N2_ID, _N2_DET, scan_roots=[str(_N2_DIRTY)], exclude_globs=[])
    assert res.passed is True
    assert res.exit_code == 0
    assert res.violations  # the suppress-and-clean verdict is the downstream consumer's job


# --- logging-silent-swallow -------------------------------------------------
_N3_DET, _N3_CLEAN, _N3_DIRTY = _impl("convex_logging_silent_swallow")
_N3_ID = "coder.convex.logging-silent-swallow"


def test_discover_includes_logging_silent_swallow() -> None:
    ids = {i.implementation_id for i in discover_mod.discover_implementations(_IMPLS)}
    assert _N3_ID in ids


@requires_node
def test_silent_swallow_clean_yields_no_violations() -> None:
    res = run_mod.run_implementation(_N3_ID, _N3_DET, scan_roots=[str(_N3_CLEAN)], exclude_globs=[])
    assert res.ran
    assert res.structured is True
    assert res.violations == []


@requires_node
def test_silent_swallow_dirty_yields_raw_v11_violations() -> None:
    res = run_mod.run_implementation(_N3_ID, _N3_DET, scan_roots=[str(_N3_DIRTY)], exclude_globs=[])
    assert res.structured is True
    assert len(res.violations) == 2  # empty catch + returning catch
    for v in res.violations:
        assert set(v) >= _REQUIRED_KEYS
        assert v["rule_id"] == _N3_ID
        assert v["file"].endswith("payout.ts")


@requires_node
def test_silent_swallow_emits_raw_not_disposition() -> None:
    res = run_mod.run_implementation(_N3_ID, _N3_DET, scan_roots=[str(_N3_DIRTY)], exclude_globs=[])
    assert res.passed is True
    assert res.exit_code == 0
    assert res.violations


# --- performance-perf (advisory / documentation-only) -----------------------
_N4_DET, _N4_CLEAN, _N4_DIRTY = _impl("convex_performance_perf")
_N4_ID = "coder.convex.performance-perf"


def test_discover_includes_performance_perf() -> None:
    ids = {i.implementation_id for i in discover_mod.discover_implementations(_IMPLS)}
    assert _N4_ID in ids


def test_discover_includes_all_four_w2_nodes() -> None:
    # End-state guard: all four W2 nodes are discovered as contract-compatible.
    ids = {i.implementation_id for i in discover_mod.discover_implementations(_IMPLS)}
    assert {_N1_ID, _N2_ID, _N3_ID, _N4_ID} <= ids


@requires_node
def test_performance_perf_clean_yields_no_violations() -> None:
    res = run_mod.run_implementation(_N4_ID, _N4_DET, scan_roots=[str(_N4_CLEAN)], exclude_globs=[])
    assert res.ran
    assert res.structured is True
    assert res.violations == []


@requires_node
def test_performance_perf_dirty_yields_raw_v11_violations() -> None:
    res = run_mod.run_implementation(_N4_ID, _N4_DET, scan_roots=[str(_N4_DIRTY)], exclude_globs=[])
    assert res.structured is True
    assert len(res.violations) == 2  # await-in-loop + full-table .collect()
    evidences = " ".join(v["evidence"] for v in res.violations)
    assert "await inside a loop" in evidences
    assert "full-table scan" in evidences
    for v in res.violations:
        assert set(v) >= _REQUIRED_KEYS
        assert v["rule_id"] == _N4_ID
        assert v["file"].endswith("leaderboard.ts")


@requires_node
def test_performance_perf_emits_raw_not_disposition() -> None:
    # documentation-only disposition: the detector still emits RAW smells; exit 0.
    res = run_mod.run_implementation(_N4_ID, _N4_DET, scan_roots=[str(_N4_DIRTY)], exclude_globs=[])
    assert res.passed is True
    assert res.exit_code == 0
    assert res.violations
