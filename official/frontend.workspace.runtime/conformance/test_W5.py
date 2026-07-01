"""W5 GREEN / URN-traceability conformance (add-only, worker-scoped) — frontend.

Scoped to W5's own new frontend implementation, the Vite GREEN traceability FAMILY
(`vite_green_traceability_detector`). For every declared rule_id: it must FIRE on its
dirty fixture and stay SILENT on its clean one; and the FAMILY, scanned over its whole
dirty tree at once, must emit its full declared set. Mirrors the shared
test_families.py logic but pinned to W5's dir so it neither depends on nor edits the
wave-wide file."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest
import yaml

_WS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_WS / "adapter"))
import run as run_mod  # noqa: E402

_W5_IMPLS = ["vite_green_traceability_detector"]
_IMPLS = [_WS / "implementations" / n for n in _W5_IMPLS]

_CASES = []
for _d in _IMPLS:
    _decl = yaml.safe_load((_d / "atdd.implementation.yaml").read_text()).get("emits_rule_ids", [])
    _mapf = _d / "checks" / "_map.json"
    if _mapf.is_file():  # FAMILY
        for _alias, _rid in json.loads(_mapf.read_text()).items():
            _CASES.append((_d, _alias, _rid))
    else:  # SINGLETON
        for _rid in _decl:
            _CASES.append((_d, None, _rid))


def _emitted(impl: Path, root: Path) -> set[str]:
    r = run_mod.run_implementation(
        impl.name, impl / "detect.mjs", scan_roots=[str(root)], exclude_globs=[]
    )
    assert r.ran and r.structured, f"{impl.name} did not run/emit a structured report"
    return {v["rule_id"] for v in r.violations}


def test_w5_impls_discovered():
    for d in _IMPLS:
        assert (d / "atdd.implementation.yaml").is_file(), f"missing manifest for {d.name}"
    assert _CASES, "no W5 rule cases discovered"


@pytest.mark.parametrize("impl,alias,rid", _CASES, ids=[f"{d.name}::{rid}" for d, a, rid in _CASES])
def test_rule_fires_on_dirty_not_clean(impl, alias, rid):
    dirty = impl / "fixtures" / "dirty" / alias if alias else impl / "fixtures" / "dirty"
    clean = impl / "fixtures" / "clean" / alias if alias else impl / "fixtures" / "clean"
    assert rid in _emitted(impl, dirty), f"{rid} not emitted on its dirty fixture"
    if clean.is_dir():
        assert rid not in _emitted(impl, clean), f"{rid} falsely emitted on its clean fixture"


def test_family_emits_full_declared_set():
    for d in _IMPLS:
        if not (d / "checks" / "_map.json").is_file():
            continue
        decl = set(yaml.safe_load((d / "atdd.implementation.yaml").read_text())["emits_rule_ids"])
        got = _emitted(d, d / "fixtures" / "dirty")
        assert decl <= got, f"{d.name} missing {sorted(decl - got)} over combined dirty fixtures"
