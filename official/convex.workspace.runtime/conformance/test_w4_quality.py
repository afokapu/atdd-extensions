"""Conformance suite for the W4 quality/maintainability tier (contract_version 1.1.0).

REAL (not skipped) tests for the five atomic quality detectors owned by
convex.extension.coder and realized by convex.workspace.runtime implementations:

  * coder.convex.quality-comments     — comment debt (commented-out code / debt density).
  * coder.convex.quality-duplication  — duplicated token-window blocks (file or layer).
  * coder.convex.quality-file-length  — file line count over the 500-line threshold.
  * coder.convex.quality-mi           — approximate maintainability index below 20.
  * coder.convex.quality-naming       — function/type/constant naming convention.

They mirror the patterns in test_provider_contract.py / test_coder_slices.py:
discovery returns each detector as a contract-compatible implementation targeting
this workspace, and a run produces RAW v1.1 structured violations through the env +
JSON-report seam (clean fixture -> 0, dirty fixture -> the expected count). Run-health
(exit 0) is NOT a verdict — a dirty scan still exits 0 / passed=True. Requires `node`
on PATH.
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


# Each node: (rule_id, impl-dir, expected dirty violation count).
_NODES = {
    "comments": ("coder.convex.quality-comments", "convex_quality_comments", 2),
    "duplication": ("coder.convex.quality-duplication", "convex_quality_duplication", 3),
    "file_length": ("coder.convex.quality-file-length", "convex_quality_file_length", 1),
    "mi": ("coder.convex.quality-mi", "convex_quality_mi", 1),
    "naming": ("coder.convex.quality-naming", "convex_quality_naming", 5),
}


def _paths(dirname: str) -> tuple[Path, Path, Path]:
    base = _IMPLS / dirname
    return base / "detect.mjs", base / "fixtures" / "clean", base / "fixtures" / "dirty"


# --- discovery --------------------------------------------------------------
def test_discover_includes_all_w4_quality_nodes() -> None:
    impls = discover_mod.discover_implementations(_IMPLS)
    ids = {i.implementation_id for i in impls}
    for rule_id, _dirname, _n in _NODES.values():
        assert rule_id in ids, f"{rule_id} not discovered"
    for impl in impls:
        assert impl.targets_workspace == "convex.workspace.runtime"


# --- clean -> 0 violations (every node) -------------------------------------
@requires_node
@pytest.mark.parametrize("key", list(_NODES))
def test_clean_fixture_yields_no_violations(key: str) -> None:
    rule_id, dirname, _n = _NODES[key]
    detector, clean, _dirty = _paths(dirname)
    res = run_mod.run_implementation(rule_id, detector, scan_roots=[str(clean)], exclude_globs=[])
    assert res.ran
    assert res.structured is True
    assert res.violations == []


# --- dirty -> expected RAW v1.1 violation count (every node) -----------------
@requires_node
@pytest.mark.parametrize("key", list(_NODES))
def test_dirty_fixture_yields_expected_raw_v11_violations(key: str) -> None:
    rule_id, dirname, expected = _NODES[key]
    detector, _clean, dirty = _paths(dirname)
    res = run_mod.run_implementation(rule_id, detector, scan_roots=[str(dirty)], exclude_globs=[])
    assert res.structured is True
    assert len(res.violations) == expected
    for v in res.violations:
        assert set(v) >= {"rule_id", "file", "line", "col", "evidence", "source_line"}
        assert v["rule_id"] == rule_id


# --- run-health is not a verdict (every node) -------------------------------
@requires_node
@pytest.mark.parametrize("key", list(_NODES))
def test_dirty_emits_raw_not_disposition(key: str) -> None:
    # run-health (exit 0) is NOT a verdict: a dirty scan still exits 0 / passed=True.
    rule_id, dirname, _n = _NODES[key]
    detector, _clean, dirty = _paths(dirname)
    res = run_mod.run_implementation(rule_id, detector, scan_roots=[str(dirty)], exclude_globs=[])
    assert res.passed is True
    assert res.exit_code == 0
    assert res.violations  # the strict verdict is the downstream consumer's job


# --- _generated / test files are skipped (spot-check via naming detector) ----
@requires_node
def test_generated_and_tests_are_skipped(tmp_path: Path) -> None:
    # A mis-cased constant inside _generated/ and inside a *.test.ts must NOT be flagged.
    rule_id, dirname, _n = _NODES["naming"]
    detector, _clean, _dirty = _paths(dirname)
    gen = tmp_path / "_generated"
    gen.mkdir()
    (gen / "api.ts").write_text("const bad_const = 5;\n", encoding="utf-8")
    (tmp_path / "thing.test.ts").write_text("const other_const = 9;\n", encoding="utf-8")
    res = run_mod.run_implementation(rule_id, detector, scan_roots=[str(tmp_path)], exclude_globs=[])
    assert res.structured is True
    assert res.violations == []
