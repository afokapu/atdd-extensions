"""Conformance suite for the W5 architecture vertical slices (contract_version 1.1.0).

These are REAL (not skipped) tests for the seven architecture/dead-code/duplication/
composition detectors owned by convex.extension.coder and realized by
convex.workspace.runtime implementations:

  * coder.convex.dead-code-reachability    — a module unreachable from a graph root.
  * coder.convex.design-foundations        — a feature dir missing its domain foundation.
  * coder.convex.design-hierarchy-import   — an import violating inward dependency direction.
  * coder.convex.design-orphan-export      — an export with no consumer and no API entry.
  * coder.convex.duplication-no-intra-layer — a helper duplicated across same-layer siblings.
  * coder.convex.composition-root          — wiring/instantiation outside a composition root.
  * coder.convex.composition-consumer      — a consumer constructing its own dependency.

They mirror the patterns in test_coder_slices.py / test_provider_contract.py: discovery
returns each detector as a contract-compatible implementation targeting this workspace, and
a run produces RAW v1.1 structured violations through the env + JSON-report seam (clean
fixture -> 0, dirty fixture -> exactly 1). Run-health (exit 0) is NOT a verdict — a dirty
scan still exits 0 / passed=True. Requires `node` on PATH.
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

# One row per W5 node: (rule_id, implementation dir). Each dir holds detect.mjs and
# fixtures/{clean,dirty}. Every dirty fixture is authored to yield exactly one violation.
_NODES = [
    ("coder.convex.dead-code-reachability", "convex_dead_code_reachability"),
    ("coder.convex.design-foundations", "convex_design_foundations"),
    ("coder.convex.design-hierarchy-import", "convex_design_hierarchy_import"),
    ("coder.convex.design-orphan-export", "convex_design_orphan_export"),
    ("coder.convex.duplication-no-intra-layer", "convex_duplication_no_intra_layer"),
    ("coder.convex.composition-root", "convex_composition_root"),
    ("coder.convex.composition-consumer", "convex_composition_consumer"),
]

_V11_KEYS = {"rule_id", "file", "line", "col", "evidence", "source_line"}


def _detector(node_dir: str) -> Path:
    return _IMPLS / node_dir / "detect.mjs"


def _fixture(node_dir: str, kind: str) -> Path:
    return _IMPLS / node_dir / "fixtures" / kind


# --- discovery --------------------------------------------------------------
def test_discover_includes_all_w5_nodes() -> None:
    impls = discover_mod.discover_implementations(_IMPLS)
    ids = {i.implementation_id for i in impls}
    for rule_id, _ in _NODES:
        assert rule_id in ids, f"discovery missing {rule_id}"
    for impl in impls:
        assert impl.targets_workspace == "convex.workspace.runtime"


# --- clean fixtures: zero violations ----------------------------------------
@requires_node
@pytest.mark.parametrize("rule_id,node_dir", _NODES)
def test_clean_yields_no_violations(rule_id: str, node_dir: str) -> None:
    res = run_mod.run_implementation(
        rule_id, _detector(node_dir), scan_roots=[str(_fixture(node_dir, "clean"))], exclude_globs=[]
    )
    assert res.ran
    assert res.structured is True
    assert res.violations == [], f"{rule_id} flagged a clean fixture: {res.violations}"


# --- dirty fixtures: exactly one RAW v1.1 violation -------------------------
@requires_node
@pytest.mark.parametrize("rule_id,node_dir", _NODES)
def test_dirty_yields_one_raw_v11_violation(rule_id: str, node_dir: str) -> None:
    res = run_mod.run_implementation(
        rule_id, _detector(node_dir), scan_roots=[str(_fixture(node_dir, "dirty"))], exclude_globs=[]
    )
    assert res.structured is True
    assert len(res.violations) == 1, f"{rule_id} expected 1 violation, got {res.violations}"
    v = res.violations[0]
    assert set(v) >= _V11_KEYS
    assert v["rule_id"] == rule_id


# --- RAW channel: a dirty scan is still run-health OK (exit 0) ---------------
@requires_node
@pytest.mark.parametrize("rule_id,node_dir", _NODES)
def test_dirty_emits_raw_not_disposition(rule_id: str, node_dir: str) -> None:
    # run-health (exit 0) is NOT a verdict: a dirty scan still exits 0 / passed=True.
    res = run_mod.run_implementation(
        rule_id, _detector(node_dir), scan_roots=[str(_fixture(node_dir, "dirty"))], exclude_globs=[]
    )
    assert res.passed is True
    assert res.exit_code == 0
    assert res.violations  # the strict verdict is the downstream consumer's job
