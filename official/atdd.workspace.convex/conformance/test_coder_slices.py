"""Conformance suite for the convex-coder vertical slices (contract_version 1.1.0).

These are REAL (not skipped) tests for the existence-style detectors owned by
atdd.extension.convex-coder and realized by atdd.workspace.convex implementations:

  * coder.convex.schema-at-root       — a convex root must have schema.ts at it.

They mirror the patterns in test_provider_contract.py: discovery returns each
detector as a contract-compatible implementation targeting this workspace, and a
run produces RAW v1.1 structured violations through the env + JSON-report seam
(clean fixture → 0, dirty fixture → exactly 1). Run-health (exit 0) is NOT a
verdict — a dirty scan still exits 0 / passed=True. Requires `node` on PATH.
"""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

import pytest

_WS = Path(__file__).resolve().parent.parent  # atdd.workspace.convex/
sys.path.insert(0, str(_WS / "adapter"))

import discover as discover_mod  # noqa: E402
import run as run_mod  # noqa: E402

_IMPLS = _WS / "implementations"

# --- schema-at-root slice ---------------------------------------------------
_SCHEMA_DIR = _IMPLS / "convex_schema_at_root"
_SCHEMA_DETECTOR = _SCHEMA_DIR / "detect.mjs"
_SCHEMA_CLEAN = _SCHEMA_DIR / "fixtures" / "clean"
_SCHEMA_DIRTY = _SCHEMA_DIR / "fixtures" / "dirty"
_SCHEMA_ID = "coder.convex.schema-at-root"

requires_node = pytest.mark.skipif(shutil.which("node") is None, reason="node not on PATH")


# --- discovery --------------------------------------------------------------
def test_discover_includes_schema_at_root_slice() -> None:
    impls = discover_mod.discover_implementations(_IMPLS)
    ids = {i.implementation_id for i in impls}
    assert _SCHEMA_ID in ids
    for impl in impls:
        assert impl.targets_workspace == "atdd.workspace.convex"


# --- schema-at-root ---------------------------------------------------------
@requires_node
def test_schema_clean_yields_no_violations() -> None:
    res = run_mod.run_implementation(_SCHEMA_ID, _SCHEMA_DETECTOR, scan_roots=[str(_SCHEMA_CLEAN)], exclude_globs=[])
    assert res.ran
    assert res.structured is True
    assert res.violations == []


@requires_node
def test_schema_dirty_yields_one_raw_v11_violation() -> None:
    res = run_mod.run_implementation(_SCHEMA_ID, _SCHEMA_DETECTOR, scan_roots=[str(_SCHEMA_DIRTY)], exclude_globs=[])
    assert res.structured is True
    assert len(res.violations) == 1
    v = res.violations[0]
    assert set(v) >= {"rule_id", "file", "line", "col", "evidence", "source_line"}
    assert v["rule_id"] == _SCHEMA_ID
    assert v["file"].endswith("schema.ts")


@requires_node
def test_schema_emits_raw_not_disposition() -> None:
    # run-health (exit 0) is NOT a verdict: a dirty scan still exits 0 / passed=True.
    res = run_mod.run_implementation(_SCHEMA_ID, _SCHEMA_DETECTOR, scan_roots=[str(_SCHEMA_DIRTY)], exclude_globs=[])
    assert res.passed is True
    assert res.exit_code == 0
    assert res.violations  # the strict verdict is the downstream consumer's job
