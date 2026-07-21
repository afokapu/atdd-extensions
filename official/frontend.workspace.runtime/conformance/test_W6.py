"""W6 conformance — Frontend boundaries + train mirror.

Self-contained checks for the three W6 FAMILY validators and their convention
nodes (mirrors of coder/conventions/frontend.convention.yaml):

  vite_route_train_wagon_coverage  — route -> train -> wagon coverage (3 rules)
  vite_no_stub_presentation        — stub-body presentation detection (6 rules)
  vite_boundaries_fe               — frontend 4-layer boundaries (2 rules)

Beyond the generic family contract (each rule fires on its dirty fixture and not
its clean one), this file pins the two W6-specific guarantees:
  * the no-stub family emits ZERO violations for the NOSTUB-020 negative case
    (a guarded null paired with a sibling meaningful-JSX return), and
  * every emitting rule_id has a schema-loadable convention node whose alias is
    declared, while the negative node exists but is NOT emitted by any detector.
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

_IMPL_ROOT = _WS / "implementations"
_CONV_DIR = (
    _WS.parent / "frontend.extension.coder.vite" / "conventions"
)

W6_IMPLS = [
    "vite_route_train_wagon_coverage",
    "vite_no_stub_presentation",
    "vite_boundaries_fe",
]

# rule_id -> (alias, severity) expected in the mirrored convention nodes.
EXPECTED_EMITTING = {
    "coder.vite.route-trainid-not-registered": "BOUNDARIES-ROUTE-COVERAGE-001",
    "coder.vite.route-resolved-train-lists-wagon": "BOUNDARIES-ROUTE-COVERAGE-002",
    "coder.vite.route-trainid-expression-not-static": "BOUNDARIES-ROUTE-COVERAGE-003",
    "coder.vite.presentation-nostub-arrow-literal": "PRESENTATION-NOSTUB-001",
    "coder.vite.presentation-nostub-fn-return": "PRESENTATION-NOSTUB-002",
    "coder.vite.presentation-nostub-empty-fragment": "PRESENTATION-NOSTUB-003",
    "coder.vite.presentation-nostub-empty-element": "PRESENTATION-NOSTUB-004",
    "coder.vite.presentation-nostub-unconditional": "PRESENTATION-NOSTUB-005",
    "coder.vite.presentation-nostub-allowlist-migration": "PRESENTATION-NOSTUB-010",
    "coder.vite.boundaries-fe-layers": "BOUNDARIES-FE-LAYERS-001",
    "coder.vite.boundaries-fe-imports": "BOUNDARIES-FE-IMPORTS-001",
}
NEGATIVE_RULE_ID = "coder.vite.presentation-nostub-guarded-negative"


def _emitted(impl_dir: Path, root: Path) -> set[str]:
    r = run_mod.run_implementation(
        impl_dir.name, impl_dir / "detect.mjs", scan_roots=[str(root)], exclude_globs=[]
    )
    assert r.ran and r.structured, f"{impl_dir.name} did not run/emit a structured report"
    return {v["rule_id"] for v in r.violations}


def _cases():
    out = []
    for name in W6_IMPLS:
        d = _IMPL_ROOT / name
        mapping = json.loads((d / "checks" / "_map.json").read_text())
        for alias, rid in mapping.items():
            out.append((d, alias, rid))
    return out


_CASES = _cases()


def test_all_w6_impls_present_and_schema_valid():
    for name in W6_IMPLS:
        d = _IMPL_ROOT / name
        assert (d / "detect.mjs").is_file(), f"{name} missing detect.mjs"
        man = yaml.safe_load((d / "atdd.implementation.yaml").read_text())
        assert man["kind"] == "implementation" and man["subtype"] == "validator"
        assert man["targets_workspace"] == "frontend.workspace.runtime"
        assert man["contract_version"] == "1.1.0"
        assert man["emits_rule_ids"], f"{name} declares no emits_rule_ids"
        assert man["realizes_convention"] in man["emits_rule_ids"]


@pytest.mark.parametrize(
    "impl,alias,rid", _CASES, ids=[f"{d.name}::{rid}" for d, a, rid in _CASES]
)
def test_rule_fires_on_dirty_not_clean(impl, alias, rid):
    dirty = impl / "fixtures" / "dirty" / alias
    clean = impl / "fixtures" / "clean" / alias
    assert dirty.is_dir(), f"missing dirty fixture for {rid}"
    assert rid in _emitted(impl, dirty), f"{rid} not emitted on its dirty fixture"
    if clean.is_dir():
        assert rid not in _emitted(impl, clean), f"{rid} falsely emitted on its clean fixture"


def test_families_emit_full_declared_set_over_combined_dirty():
    for name in W6_IMPLS:
        d = _IMPL_ROOT / name
        decl = set(yaml.safe_load((d / "atdd.implementation.yaml").read_text())["emits_rule_ids"])
        got = _emitted(d, d / "fixtures" / "dirty")
        assert decl <= got, f"{name} missing {sorted(decl - got)} over combined dirty fixtures"


def test_nostub_negative_guarded_null_emits_nothing():
    """NOSTUB-020: a guarded `return null` with a sibling meaningful-JSX return MUST
    NOT be flagged. The clean/nostub-fn-return fixture contains GuardedPanel.tsx."""
    d = _IMPL_ROOT / "vite_no_stub_presentation"
    clean = d / "fixtures" / "clean" / "nostub-fn-return"
    guarded = clean / "apps/game/src/shared/presentation/GuardedPanel.tsx"
    assert guarded.is_file(), "guarded-null negative fixture missing"
    assert _emitted(d, clean) == set(), "no-stub family flagged a guarded-null component (NOSTUB-020 violated)"


def test_every_emitting_rule_has_a_convention_node():
    declared = set()
    for name in W6_IMPLS:
        declared |= set(
            yaml.safe_load((_IMPL_ROOT / name / "atdd.implementation.yaml").read_text())["emits_rule_ids"]
        )
    assert declared == set(EXPECTED_EMITTING), (
        f"emitted set drift: {sorted(declared ^ set(EXPECTED_EMITTING))}"
    )
    for rid, alias in EXPECTED_EMITTING.items():
        node = _CONV_DIR / f"{rid}.convention.yaml"
        assert node.is_file(), f"missing convention node for {rid}"
        doc = yaml.safe_load(node.read_text())
        assert doc["rule_id"] == rid
        assert alias in doc["metadata"]["aliases"], f"{rid} missing alias {alias}"
        assert doc["content"]["normative_text"] and doc["content"]["fix_hint"]


def test_negative_node_exists_but_is_not_emitted():
    node = _CONV_DIR / f"{NEGATIVE_RULE_ID}.convention.yaml"
    assert node.is_file(), "negative NOSTUB-020 convention node missing"
    doc = yaml.safe_load(node.read_text())
    assert "PRESENTATION-NOSTUB-020" in doc["metadata"]["aliases"]
    # The negative rule is a guarantee, never a positive emission.
    for name in W6_IMPLS:
        emits = yaml.safe_load((_IMPL_ROOT / name / "atdd.implementation.yaml").read_text())["emits_rule_ids"]
        assert NEGATIVE_RULE_ID not in emits, "negative rule must not be an emitted rule_id"
