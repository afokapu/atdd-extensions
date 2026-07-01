"""WT conformance — frontend TESTER surface (journey/E2E · train↔E2E coverage ·
presentation-smoke · a11y/visual).

Scoped to the implementations WT ADDED to frontend.workspace.runtime (add-only). For
each: the manifest passes the enforced implementation-schema, every emitted rule_id's
convention node `yaml.safe_load`s and matches, and the detector fires on each dirty
fixture but NOT on the paired clean one (RAW v1.1 channel). Handles both FAMILY impls
(alias subdirs keyed by checks/_map.json — one case per member) and SINGLETONs (one
case, fixtures/dirty vs fixtures/clean). Mirrors the workspace test_families.py contract
but touches only WT's own files.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest
import yaml

_WS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_WS / "adapter"))
import run as run_mod  # noqa: E402

_ROOT = _WS.parent  # official/
_EXT = _ROOT / "frontend.extension.vite-tester" / "conventions"
_IMPL_DIRS = _WS / "implementations"

# WT's own implementations. Each convention node is
# frontend.extension.vite-tester/conventions/{rule_id}.convention.yaml
WT_IMPLS = [
    "vite_journey_test_detector",
    "vite_train_e2e_coverage",
    "vite_presentation_smoke_coverage",
    "vite_a11y_visual_harness",
]

# Only assert over impls present on disk, so the file is green after each per-group
# commit (impls land group-by-group).
_PRESENT = [name for name in WT_IMPLS if (_IMPL_DIRS / name).is_dir()]


def _manifest(impl_name: str) -> dict:
    return yaml.safe_load((_IMPL_DIRS / impl_name / "atdd.implementation.yaml").read_text())


def _cases():
    """Yield (impl_name, alias_or_None, rule_id) — one per family member / singleton rule."""
    out = []
    for name in _PRESENT:
        d = _IMPL_DIRS / name
        mapf = d / "checks" / "_map.json"
        if mapf.is_file():  # FAMILY
            for alias, rid in json.loads(mapf.read_text()).items():
                out.append((name, alias, rid))
        else:  # SINGLETON
            for rid in _manifest(name)["emits_rule_ids"]:
                out.append((name, None, rid))
    return out


_CASES = _cases()


def _emitted(impl_name: str, root: Path) -> set[str]:
    d = _IMPL_DIRS / impl_name
    r = run_mod.run_implementation(d.name, d / "detect.mjs", scan_roots=[str(root)], exclude_globs=[])
    assert r.ran and r.structured, f"{d.name} did not run/emit a structured report"
    return {v["rule_id"] for v in r.violations}


@pytest.mark.parametrize("impl_name", _PRESENT)
def test_manifest_schema(impl_name):
    m = _manifest(impl_name)
    assert m["kind"] == "implementation"
    assert m["subtype"] == "validator"
    assert m["contract_version"] == "1.1.0"
    assert m["targets_workspace"] == "frontend.workspace.runtime"
    assert m["entrypoint"] and m["report"]
    emits = m["emits_rule_ids"]
    assert emits
    assert m["realizes_convention"] in emits  # primary ∈ emits_rule_ids


@pytest.mark.parametrize("impl_name,alias,rid", _CASES, ids=[f"{n}::{rid}" for n, a, rid in _CASES])
def test_convention_node_loads(impl_name, alias, rid):
    node = yaml.safe_load((_EXT / f"{rid}.convention.yaml").read_text())
    assert node["rule_id"] == rid
    assert node["schema_version"] == "1.1.0"
    assert node["kind"] == "rule"
    assert node["implementation"]["ref"] == impl_name  # convention points at its realization


@pytest.mark.parametrize("impl_name,alias,rid", _CASES, ids=[f"{n}::{rid}" for n, a, rid in _CASES])
def test_fires_on_dirty_not_clean(impl_name, alias, rid):
    d = _IMPL_DIRS / impl_name
    dirty = d / "fixtures" / "dirty" / alias if alias else d / "fixtures" / "dirty"
    clean = d / "fixtures" / "clean" / alias if alias else d / "fixtures" / "clean"
    assert rid in _emitted(impl_name, dirty), f"{rid} not emitted on its dirty fixture"
    if clean.is_dir():
        assert rid not in _emitted(impl_name, clean), f"{rid} falsely emitted on its clean fixture"


def test_all_declared_rule_ids_have_convention_nodes():
    """Every emitted rule_id across WT's impls has a schema-1.1.0 convention node."""
    for name in _PRESENT:
        for rid in _manifest(name)["emits_rule_ids"]:
            node_path = _EXT / f"{rid}.convention.yaml"
            assert node_path.is_file(), f"missing convention node for {rid}"
