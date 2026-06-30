"""Family-aware conformance: every convention rule_id is realized by a detector,
and fires on its dirty fixture but not its clean one. Validator FAMILIES emit
multiple rule_ids from one run (Core pattern); singletons emit one. Drop-in for
either workspace (resolves relative to its own adapter/implementations)."""
from __future__ import annotations
import json, sys
from pathlib import Path
import pytest, yaml

_WS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_WS / "adapter"))
import run as run_mod  # noqa: E402

_IMPLS = sorted(p for p in (_WS / "implementations").iterdir() if (p / "atdd.implementation.yaml").is_file())

_CASES = []
for _d in _IMPLS:
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
    """Each FAMILY, scanned over ALL its members' dirty fixtures at once, emits every
    rule_id it declares — proving the one-run-many-rules family contract."""
    for d in _IMPLS:
        if not (d / "checks" / "_map.json").is_file():
            continue
        decl = set(yaml.safe_load((d / "atdd.implementation.yaml").read_text())["emits_rule_ids"])
        got = _emitted(d, d / "fixtures" / "dirty")
        assert decl <= got, f"{d.name} missing {sorted(decl - got)} over combined dirty fixtures"
