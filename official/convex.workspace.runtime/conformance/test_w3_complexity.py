"""Conformance suite for the Worker W3 complexity tier (contract_version 1.1.0).

Five atomic per-function complexity detectors owned by convex.extension.coder
and realized by convex.workspace.runtime implementations, each the Convex sibling of a
Core coder.refactor.complexity-* rule:

  * coder.convex.complexity-cyclomatic  — cyclomatic count per function   > 10
  * coder.convex.complexity-length      — function body lines of code      > 50
  * coder.convex.complexity-nesting     — max control-block nesting depth  > 4
  * coder.convex.complexity-cognitive   — SonarQube cognitive score        > 15
  * coder.convex.complexity-params      — declared parameter count        >= 6

They mirror the patterns in test_coder_slices.py: discovery returns each detector
as a contract-compatible implementation targeting this workspace, and a run produces
RAW v1.1 structured violations through the env + JSON-report seam (clean fixture →
0, dirty fixture → exactly 1, located at the offending function's header line).
Run-health (exit 0) is NOT a verdict — a dirty scan still exits 0 / passed=True.
Each detector also has its convention node authored in convex.extension.coder.
Requires `node` on PATH.
"""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

import pytest
import yaml

_WS = Path(__file__).resolve().parent.parent  # convex.workspace.runtime/
sys.path.insert(0, str(_WS / "adapter"))

import discover as discover_mod  # noqa: E402
import run as run_mod  # noqa: E402

_IMPLS = _WS / "implementations"
_CONVENTIONS = _WS.parent / "convex.extension.coder" / "conventions"

requires_node = pytest.mark.skipif(shutil.which("node") is None, reason="node not on PATH")

# (impl_id, impl_dir, dirty source filename, expected severity) per W3 node.
_NODES = [
    ("coder.convex.complexity-cyclomatic", "convex_complexity_cyclomatic", "classify.ts", 3),
    ("coder.convex.complexity-length", "convex_complexity_length", "report.ts", 2),
    ("coder.convex.complexity-nesting", "convex_complexity_nesting", "walk.ts", 3),
    ("coder.convex.complexity-cognitive", "convex_complexity_cognitive", "aggregate.ts", 3),
    ("coder.convex.complexity-params", "convex_complexity_params", "ledger.ts", 2),
]
_IDS = [n[0] for n in _NODES]


def _detector(impl_dir: str) -> Path:
    return _IMPLS / impl_dir / "detect.mjs"


def _clean(impl_dir: str) -> Path:
    return _IMPLS / impl_dir / "fixtures" / "clean"


def _dirty(impl_dir: str) -> Path:
    return _IMPLS / impl_dir / "fixtures" / "dirty"


# --- discovery --------------------------------------------------------------
def test_discover_includes_all_five_complexity_nodes() -> None:
    impls = discover_mod.discover_implementations(_IMPLS)
    ids = {i.implementation_id for i in impls}
    for impl_id in _IDS:
        assert impl_id in ids, f"{impl_id} not discovered"
    by_id = {i.implementation_id: i for i in impls}
    for impl_id in _IDS:
        assert by_id[impl_id].targets_workspace == "convex.workspace.runtime"
        assert by_id[impl_id].contract_version == "1.1.0"


# --- clean fixtures: zero violations ----------------------------------------
@requires_node
@pytest.mark.parametrize("impl_id, impl_dir, _dirty_file, _sev", _NODES, ids=_IDS)
def test_clean_fixture_yields_no_violations(impl_id, impl_dir, _dirty_file, _sev) -> None:
    res = run_mod.run_implementation(
        impl_id, _detector(impl_dir), scan_roots=[str(_clean(impl_dir))], exclude_globs=[]
    )
    assert res.ran
    assert res.structured is True
    assert res.violations == [], f"{impl_id} flagged the clean fixture: {res.violations}"


# --- dirty fixtures: exactly one RAW v1.1 violation -------------------------
@requires_node
@pytest.mark.parametrize("impl_id, impl_dir, dirty_file, _sev", _NODES, ids=_IDS)
def test_dirty_fixture_yields_one_raw_v11_violation(impl_id, impl_dir, dirty_file, _sev) -> None:
    res = run_mod.run_implementation(
        impl_id, _detector(impl_dir), scan_roots=[str(_dirty(impl_dir))], exclude_globs=[]
    )
    assert res.structured is True
    assert len(res.violations) == 1, f"{impl_id}: {res.violations}"
    v = res.violations[0]
    assert set(v) >= {"rule_id", "file", "line", "col", "evidence", "source_line"}
    assert v["rule_id"] == impl_id
    assert v["file"].endswith(dirty_file)
    assert isinstance(v["line"], int) and v["line"] >= 1


# --- run-health is not a verdict --------------------------------------------
@requires_node
@pytest.mark.parametrize("impl_id, impl_dir, _dirty_file, _sev", _NODES, ids=_IDS)
def test_dirty_emits_raw_not_disposition(impl_id, impl_dir, _dirty_file, _sev) -> None:
    # run-health (exit 0) is NOT a verdict: a dirty scan still exits 0 / passed=True.
    res = run_mod.run_implementation(
        impl_id, _detector(impl_dir), scan_roots=[str(_dirty(impl_dir))], exclude_globs=[]
    )
    assert res.passed is True
    assert res.exit_code == 0
    assert res.violations  # the strict verdict is the downstream consumer's job


# --- generated/test exclusion holds -----------------------------------------
@requires_node
def test_excludes_generated_and_test_files(tmp_path) -> None:
    # A dirty function placed under _generated/ or in a *.test.ts file must be
    # skipped by the traversal, so the scan reports zero violations.
    impl_id, impl_dir, dirty_file, _sev = _NODES[0]
    dirty_src = (_dirty(impl_dir) / dirty_file).read_text()
    gen_dir = tmp_path / "_generated"
    gen_dir.mkdir()
    (gen_dir / "api.ts").write_text(dirty_src)
    (tmp_path / "classify.test.ts").write_text(dirty_src)
    res = run_mod.run_implementation(
        impl_id, _detector(impl_dir), scan_roots=[str(tmp_path)], exclude_globs=[]
    )
    assert res.structured is True
    assert res.violations == []


# --- convention nodes exist with the mirrored severity/disposition ----------
@pytest.mark.parametrize("impl_id, _impl_dir, _dirty_file, sev", _NODES, ids=_IDS)
def test_convention_node_authored_with_expected_metadata(impl_id, _impl_dir, _dirty_file, sev) -> None:
    path = _CONVENTIONS / f"{impl_id}.convention.yaml"
    assert path.is_file(), f"missing convention for {impl_id}"
    doc = yaml.safe_load(path.read_text())
    assert doc["rule_id"] == impl_id
    assert doc["kind"] == "rule"
    assert doc["status"] == "active"
    assert str(doc["schema_version"]) == "1.1.0"
    assert doc["metadata"]["severity"] == sev
    assert doc["metadata"]["disposition"] == "strict"
    assert doc["implementation"]["ref"] == impl_id
    assert doc["content"]["normative_text"].strip()
    assert doc["terms"], f"{impl_id} convention has no terms"
