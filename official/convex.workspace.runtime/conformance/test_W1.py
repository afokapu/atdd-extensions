"""W1 interlocking-mirror conformance (add-only, worker-owned).

Proves the three Convex/TS interlocking detectors this worker built realize the ten agnostic
core interlocking obligations at full fidelity:

  * convex_interlocking_infrastructure — FAMILY, 5 coder rules (runner/resolution/station/delegate/cargo)
  * convex_interlocking_binding        — SINGLETON, 1 coder rule, all 5 binding directions + schema drift
  * convex_interlocking_coverage       — FAMILY, 4 tester rules (route/runner/smoke/trace)

For every rule: it FIRES on its dirty fixture and NOT on its clean fixture (RAW v1.1 channel). The
binding singleton additionally fires on each per-direction dirty fixture. Every emitted rule_id has a
schema-1.1.0 convention node, and every manifest passes the enforced implementation-schema shape.

Runs through the real convex.workspace.runtime provider adapter (adapter/run.py), the same seam
production uses. Never edits shared conformance files.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest
import yaml

_WS = Path(__file__).resolve().parent.parent
_ROOT = _WS.parent.parent  # repo root (…/official/<ws> -> repo)
sys.path.insert(0, str(_WS / "adapter"))
import run as run_mod  # noqa: E402

_IMPLS = _WS / "implementations"
_CODER_CONV = _ROOT / "official" / "convex.extension.coder" / "conventions"
_TESTER_CONV = _ROOT / "official" / "convex.extension.tester" / "conventions"

_INFRA = _IMPLS / "convex_interlocking_infrastructure"
_BINDING = _IMPLS / "convex_interlocking_binding"
_COVERAGE = _IMPLS / "convex_interlocking_coverage"

_INFRA_RULES = {
    "interlocking_runner_exists": "coder.convex.interlocking-runner-exists",
    "interlocking_resolution_model": "coder.convex.interlocking-resolution-model-exists",
    "interlocking_station_routing": "coder.convex.station-master-interlocking-routing",
    "interlocking_delegates": "coder.convex.interlocking-delegates-to-trainrunner",
    "interlocking_no_cargo": "coder.convex.interlocking-does-not-carry-cargo",
}
_COVERAGE_RULES = {
    "interlocking_route_coverage": "tester.convex.interlocking-route-coverage",
    "interlocking_production_runner": "tester.convex.interlocking-production-runner-used",
    "interlocking_smoke_coverage": "tester.convex.interlocking-smoke-coverage-for-station-master",
    "interlocking_trace_binds": "tester.convex.interlocking-trace-binds-declared-route",
}
_BINDING_RULE = "coder.convex.interlocking-bilateral-binding"
# per-direction fixtures the binding singleton must fire on (evidence direction token in parens).
_BINDING_DIRECTIONS = {
    "dirty": "declaration_to_runtime",
    "dirty_runtime_hidden": "runtime_to_declaration",
    "dirty_station_missing": "station_to_declaration",
    "dirty_unreachable": "declaration_to_station",
    "dirty_trace": "trace_to_declaration",
    "dirty_parallel_field": "parallel_reachability_field",
}


def _run(impl: Path, root: Path) -> list[dict]:
    r = run_mod.run_implementation(impl.name, impl / "detect.mjs", scan_roots=[str(root)], exclude_globs=[])
    assert r.ran and r.structured, f"{impl.name} did not run/emit a structured report over {root}"
    return r.violations


def _emitted(impl: Path, root: Path) -> set[str]:
    return {v["rule_id"] for v in _run(impl, root)}


# ── family rule-fires-on-dirty-not-clean ─────────────────────────────────────

@pytest.mark.parametrize("alias,rid", sorted(_INFRA_RULES.items()), ids=list(_INFRA_RULES))
def test_infrastructure_rule_fires(alias, rid):
    assert rid in _emitted(_INFRA, _INFRA / "fixtures" / "dirty" / alias), f"{rid} not emitted on its dirty fixture"
    assert rid not in _emitted(_INFRA, _INFRA / "fixtures" / "clean" / alias), f"{rid} falsely emitted on clean"


@pytest.mark.parametrize("alias,rid", sorted(_COVERAGE_RULES.items()), ids=list(_COVERAGE_RULES))
def test_coverage_rule_fires(alias, rid):
    assert rid in _emitted(_COVERAGE, _COVERAGE / "fixtures" / "dirty" / alias), f"{rid} not emitted on its dirty fixture"
    assert rid not in _emitted(_COVERAGE, _COVERAGE / "fixtures" / "clean" / alias), f"{rid} falsely emitted on clean"


def test_family_combined_dirty_emits_full_set():
    got = _emitted(_INFRA, _INFRA / "fixtures" / "dirty")
    assert set(_INFRA_RULES.values()) <= got, f"infra missing {set(_INFRA_RULES.values()) - got}"
    got = _emitted(_COVERAGE, _COVERAGE / "fixtures" / "dirty")
    assert set(_COVERAGE_RULES.values()) <= got, f"coverage missing {set(_COVERAGE_RULES.values()) - got}"


# ── binding singleton: clean silent, every direction fires ───────────────────

def test_binding_clean_is_silent():
    assert _BINDING_RULE not in _emitted(_BINDING, _BINDING / "fixtures" / "clean")


@pytest.mark.parametrize("subdir,direction", sorted(_BINDING_DIRECTIONS.items()), ids=list(_BINDING_DIRECTIONS))
def test_binding_direction_fires(subdir, direction):
    viols = _run(_BINDING, _BINDING / "fixtures" / subdir)
    rids = {v["rule_id"] for v in viols}
    assert _BINDING_RULE in rids, f"{_BINDING_RULE} not emitted on {subdir}"
    dirs = {v["evidence"].split(":")[0] for v in viols}
    assert direction in dirs, f"expected direction {direction} in {sorted(dirs)} for {subdir}"


# ── grounding: no false positives on a real consumer with no interlocking ────

_FRG = Path("/Users/alecfokapu/Github/frg-app/main/apps/game")


@pytest.mark.skipif(not _FRG.is_dir(), reason="frg-app not present")
@pytest.mark.parametrize("impl", [_INFRA, _BINDING, _COVERAGE], ids=lambda p: p.name)
def test_no_false_positive_on_frg_app(impl):
    assert _emitted(impl, _FRG) == set(), f"{impl.name} false-fired on frg-app (no interlocking there)"


# ── every emitted rule_id has a schema-1.1.0 convention node ──────────────────

def _node_rule_ids(conv_dir: Path) -> dict[str, dict]:
    out = {}
    for f in conv_dir.glob("*.convention.yaml"):
        d = yaml.safe_load(f.read_text())
        out[d["rule_id"]] = d
    return out


def test_every_emitted_rule_has_a_node():
    coder = _node_rule_ids(_CODER_CONV)
    tester = _node_rule_ids(_TESTER_CONV)
    all_nodes = {**coder, **tester}
    emitted = set(_INFRA_RULES.values()) | {_BINDING_RULE} | set(_COVERAGE_RULES.values())
    for rid in emitted:
        assert rid in all_nodes, f"emitted rule_id {rid} has no convention node"
        node = all_nodes[rid]
        assert node["schema_version"] == "1.1.0", f"{rid} node is not schema 1.1.0"
        assert node["kind"] == "rule" and node["status"] == "active"
        for key in ("statement", "content", "metadata"):
            assert key in node, f"{rid} node missing {key}"


# ── manifests pass the enforced implementation-schema shape ───────────────────

@pytest.mark.parametrize("impl", [_INFRA, _BINDING, _COVERAGE], ids=lambda p: p.name)
def test_manifest_conforms(impl):
    m = yaml.safe_load((impl / "atdd.implementation.yaml").read_text())
    assert m["schema_version"] == "1.1.0"
    assert m["kind"] == "implementation"
    assert m["subtype"] == "validator"
    assert m["targets_workspace"] == "convex.workspace.runtime"
    assert str(m["contract_version"]) == "1.1.0"
    assert m["entrypoint"] == "detect.mjs" and m["report"] == "detect.mjs"
    emits = m["emits_rule_ids"]
    assert isinstance(emits, list) and emits, "emits_rule_ids must be a non-empty list"
    assert m["realizes_convention"] in emits, "realizes_convention (primary) must be in emits_rule_ids"
    assert (impl / "detect.mjs").is_file()
