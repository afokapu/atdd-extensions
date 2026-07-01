"""W7 conformance — vite_design_hierarchy_detector (design-system hierarchy gap fill).

Add-only, scoped to THIS worker's new FAMILY validator so it never collides with
the shared test_families.py. Proves the family contract for the three agnostic
gap rules W7 mirrored (tokens-pure / dependency-flow / wagons-import):

  * the manifest is schema-1.1.0 valid and its emits_rule_ids match checks/_map.json,
  * each member fires its own rule_id on its dirty fixture and NOT on its clean one,
  * scanned over all members' dirty fixtures at once, the family emits every declared
    rule_id (one-run-many-rules), and stays silent over the combined clean tree.
"""
from __future__ import annotations
import json, sys
from pathlib import Path
import pytest, yaml

_WS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_WS / "adapter"))
import run as run_mod  # noqa: E402

_IMPL = _WS / "implementations" / "vite_design_hierarchy_detector"
_MANIFEST = yaml.safe_load((_IMPL / "atdd.implementation.yaml").read_text())
_MAP = json.loads((_IMPL / "checks" / "_map.json").read_text())
_CASES = list(_MAP.items())  # (alias-subdir, rule_id)


def _emitted(root: Path) -> set[str]:
    r = run_mod.run_implementation(
        _IMPL.name, _IMPL / "detect.mjs", scan_roots=[str(root)], exclude_globs=[]
    )
    assert r.ran and r.structured, f"{_IMPL.name} did not run/emit a structured report"
    return {v["rule_id"] for v in r.violations}


def test_manifest_is_schema_1_1_0_validator_family():
    assert str(_MANIFEST["schema_version"]) == "1.1.0"
    assert _MANIFEST["kind"] == "implementation"
    assert _MANIFEST["subtype"] == "validator"
    assert str(_MANIFEST["contract_version"]) == "1.1.0"
    assert _MANIFEST["targets_workspace"] == "frontend.workspace.runtime"
    assert _MANIFEST["entrypoint"] == "detect.mjs"
    assert _MANIFEST["report"] == "detect.mjs"
    emits = _MANIFEST["emits_rule_ids"]
    assert emits, "emits_rule_ids must be non-empty"
    assert _MANIFEST["realizes_convention"] in emits, "primary must be in emits_rule_ids"
    # emits_rule_ids is exactly the family map's rule_ids
    assert set(emits) == set(_MAP.values())


@pytest.mark.parametrize("alias,rid", _CASES, ids=[rid for _a, rid in _CASES])
def test_rule_fires_on_dirty_not_clean(alias, rid):
    assert rid in _emitted(_IMPL / "fixtures" / "dirty" / alias), \
        f"{rid} not emitted on its dirty fixture"
    assert rid not in _emitted(_IMPL / "fixtures" / "clean" / alias), \
        f"{rid} falsely emitted on its clean fixture"


def test_family_emits_full_declared_set_over_combined_dirty():
    decl = set(_MANIFEST["emits_rule_ids"])
    got = _emitted(_IMPL / "fixtures" / "dirty")
    assert decl <= got, f"missing {sorted(decl - got)} over combined dirty fixtures"


def test_family_silent_over_combined_clean():
    assert _emitted(_IMPL / "fixtures" / "clean") == set(), \
        "family emitted violations over the combined clean tree"
