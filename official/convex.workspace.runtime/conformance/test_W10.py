"""W10 conformance (tester: smoke + red + routing).

Scoped to the three implementations W10 added to convex.workspace.runtime:
  * convex_smoke_fidelity_detector  (FAMILY → 2 rule_ids; presentation-coverage relocated to vite-tester)
  * convex_red_fails_first          (SINGLETON)
  * convex_routing_path             (SINGLETON)

Each convention rule_id must be realized by a detector that FIRES on its dirty
fixture and is SILENT on its clean one; every FAMILY, scanned over all its members'
dirty fixtures at once, must emit its full declared set (the one-run-many-rules
family contract). Add-only, self-contained — does not touch the shared
test_families.py. Resolves the adapter relative to its own workspace."""
from __future__ import annotations
import json, sys
from pathlib import Path
import pytest, yaml

_WS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_WS / "adapter"))
import run as run_mod  # noqa: E402

_W10_IMPLS = [
    "convex_smoke_fidelity_detector",
    "convex_red_fails_first",
    "convex_routing_path",
]
_IMPLS = [_WS / "implementations" / n for n in _W10_IMPLS]

_CASES = []
for _d in _IMPLS:
    assert (_d / "atdd.implementation.yaml").is_file(), f"missing manifest: {_d}"
    _decl = yaml.safe_load((_d / "atdd.implementation.yaml").read_text()).get("emits_rule_ids", [])
    _mapf = _d / "checks" / "_map.json"
    if _mapf.is_file():            # FAMILY: one (alias-subdir, rule_id) case per member
        for _alias, _rid in json.loads(_mapf.read_text()).items():
            _CASES.append((_d, _alias, _rid))
    else:                          # SINGLETON
        for _rid in _decl:
            _CASES.append((_d, None, _rid))


def _emitted(impl, root):
    r = run_mod.run_implementation(impl.name, impl / "detect.mjs", scan_roots=[str(root)], exclude_globs=[])
    assert r.ran and r.structured, f"{impl.name} did not run/emit a structured report"
    return {v["rule_id"] for v in r.violations}


@pytest.mark.parametrize("impl,alias,rid", _CASES, ids=[f"{d.name}::{rid}" for d, a, rid in _CASES])
def test_rule_fires_on_dirty_not_clean(impl, alias, rid):
    dirty = impl / "fixtures" / "dirty" / alias if alias else impl / "fixtures" / "dirty"
    clean = impl / "fixtures" / "clean" / alias if alias else impl / "fixtures" / "clean"
    assert rid in _emitted(impl, dirty), f"{rid} not emitted on its dirty fixture"
    if clean.is_dir():
        assert rid not in _emitted(impl, clean), f"{rid} falsely emitted on its clean fixture"


def test_family_detectors_emit_full_declared_set():
    """The smoke FAMILY, scanned over ALL its members' dirty fixtures at once, emits
    every rule_id it declares."""
    for d in _IMPLS:
        if not (d / "checks" / "_map.json").is_file():
            continue
        decl = set(yaml.safe_load((d / "atdd.implementation.yaml").read_text())["emits_rule_ids"])
        got = _emitted(d, d / "fixtures" / "dirty")
        assert decl <= got, f"{d.name} missing {sorted(decl - got)} over combined dirty fixtures"


def test_manifest_realizes_convention_in_emits():
    """Enforced implementation-schema invariant: realizes_convention is present and
    is a member of emits_rule_ids for every W10 implementation."""
    for d in _IMPLS:
        m = yaml.safe_load((d / "atdd.implementation.yaml").read_text())
        assert m["realizes_convention"] in m["emits_rule_ids"], d.name
