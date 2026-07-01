"""W3 (backend architecture) conformance — self-contained, add-only.

Proves the two W3 FAMILY validators mirror core coder's backend + DTO obligations:
  * convex_backend_layout_detector -> coder.convex.backend-{layer-catalog,suffix-matches,dependency-edges}
  * convex_dto_detector            -> coder.convex.dto-{placement,purity,mapper}

For each member: the rule fires on its own dirty fixture and NOT on its clean one;
each family, scanned over all its members' dirty fixtures at once, emits its full
declared rule set (the one-run-many-rules family contract). Every W3 convention node
`yaml.safe_load`s and binds to its family implementation. Mirrors the drop-in pattern
of test_families.py but scoped to the W3 slice so it stands alone."""
from __future__ import annotations
import json
import sys
from pathlib import Path

import pytest
import yaml

_WS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_WS / "adapter"))
import run as run_mod  # noqa: E402

_W3_IMPLS = ["convex_backend_layout_detector", "convex_dto_detector"]
_W3_RULE_IDS = {
    "coder.convex.backend-layer-catalog",
    "coder.convex.backend-suffix-matches",
    "coder.convex.backend-dependency-edges",
    "coder.convex.dto-placement",
    "coder.convex.dto-purity",
    "coder.convex.dto-mapper",
}
# W3 convention nodes live in the sibling convex.extension.coder package.
_NODES_DIR = _WS.parent / "convex.extension.coder" / "conventions"

# (impl_dir, alias-subdir, rule_id) — one case per family member.
_CASES = []
for _name in _W3_IMPLS:
    _d = _WS / "implementations" / _name
    _mapf = _d / "checks" / "_map.json"
    assert _mapf.is_file(), f"{_name} is expected to be a FAMILY (checks/_map.json)"
    for _alias, _rid in json.loads(_mapf.read_text()).items():
        _CASES.append((_d, _alias, _rid))


def _emitted(impl: Path, root: Path) -> set[str]:
    r = run_mod.run_implementation(
        impl.name, impl / "detect.mjs", scan_roots=[str(root)], exclude_globs=[]
    )
    assert r.ran and r.structured, f"{impl.name} did not run/emit a structured report"
    return {v["rule_id"] for v in r.violations}


@pytest.mark.parametrize(
    "impl,alias,rid", _CASES, ids=[f"{d.name}::{rid}" for d, a, rid in _CASES]
)
def test_rule_fires_on_dirty_not_clean(impl, alias, rid):
    dirty = impl / "fixtures" / "dirty" / alias
    clean = impl / "fixtures" / "clean" / alias
    assert dirty.is_dir(), f"missing dirty fixture for {rid}"
    assert rid in _emitted(impl, dirty), f"{rid} not emitted on its dirty fixture"
    assert clean.is_dir(), f"missing clean fixture for {rid}"
    assert rid not in _emitted(impl, clean), f"{rid} falsely emitted on its clean fixture"


def test_families_emit_full_declared_set_over_combined_dirty():
    for _name in _W3_IMPLS:
        d = _WS / "implementations" / _name
        decl = set(yaml.safe_load((d / "atdd.implementation.yaml").read_text())["emits_rule_ids"])
        got = _emitted(d, d / "fixtures" / "dirty")
        assert decl <= got, f"{_name} missing {sorted(decl - got)} over combined dirty fixtures"


def test_family_manifests_are_schema_valid():
    for _name in _W3_IMPLS:
        m = yaml.safe_load((_WS / "implementations" / _name / "atdd.implementation.yaml").read_text())
        assert m["schema_version"] == "1.1.0"
        assert m["kind"] == "implementation" and m["subtype"] == "validator"
        assert m["targets_workspace"] == "convex.workspace.runtime"
        assert m["contract_version"] == "1.1.0"
        assert m["entrypoint"] == "detect.mjs" and m["report"] == "detect.mjs"
        emits = m["emits_rule_ids"]
        assert emits, f"{_name} emits_rule_ids must be non-empty"
        assert m["realizes_convention"] in emits, f"{_name} primary not in emits_rule_ids"


def test_w3_nodes_load_and_bind_to_their_family():
    # map rule_id -> declaring family implementation_id
    rid_to_family = {}
    for _name in _W3_IMPLS:
        m = yaml.safe_load((_WS / "implementations" / _name / "atdd.implementation.yaml").read_text())
        for rid in m["emits_rule_ids"]:
            rid_to_family[rid] = m["implementation_id"]

    seen = set()
    for rid in _W3_RULE_IDS:
        node = _NODES_DIR / f"{rid}.convention.yaml"
        assert node.is_file(), f"missing convention node for {rid}"
        doc = yaml.safe_load(node.read_text())  # must parse
        assert doc["schema_version"] == "1.1.0"
        assert doc["rule_id"] == rid
        assert doc["kind"] == "rule" and doc["status"] == "active"
        assert doc["implementation"]["type"] == "validator"
        assert doc["implementation"]["ref"] == rid_to_family[rid], f"{rid} ref must bind to its family"
        assert doc["content"]["normative_text"].strip()
        assert doc["metadata"]["aliases"], f"{rid} must carry its core alias"
        seen.add(rid)
    assert seen == _W3_RULE_IDS
