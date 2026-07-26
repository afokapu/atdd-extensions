"""W2 mirror conformance — the Train (composition root + journey tests) slice.

Self-contained proof that every W2-authored convex implementation runs under the
provider and that each realized rule_id fires on its dirty fixture but not its clean
one. Validator FAMILIES emit multiple rule_ids from one run (alias subdir per member,
via checks/_map.json); the singleton emits one. Add-only: this file references ONLY the
three implementations W2 built, so it stays green independently of other workers.
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

# The coder train family W2 authored (add-only allow-list). The tester journey +
# train-coverage detectors were relocated to frontend.extension.tester.vite
# (frontend Playwright/journey concerns); see docs/mirror-classification/WT.md.
_W2_IMPLS = [
    "convex_train_composition_detector",   # coder train family (3 rule_ids)
]

_EXPECTED_RULE_IDS = {
    "coder.convex.train-is-a-production",
    "coder.convex.train-wagons-communicate-via-cargo",
    "coder.convex.train-yaml-source-of-truth",
}


def _impl_dir(name: str) -> Path:
    return _WS / "implementations" / name


def _cases():
    cases = []
    for name in _W2_IMPLS:
        d = _impl_dir(name)
        decl = yaml.safe_load((d / "atdd.implementation.yaml").read_text()).get("emits_rule_ids", [])
        mapf = d / "checks" / "_map.json"
        if mapf.is_file():  # FAMILY: one (alias-subdir, rule_id) case per member
            for alias, rid in json.loads(mapf.read_text()).items():
                cases.append((d, alias, rid))
        else:               # SINGLETON
            for rid in decl:
                cases.append((d, None, rid))
    return cases


_CASES = _cases()


def _emitted(impl: Path, root: Path) -> set[str]:
    r = run_mod.run_implementation(
        impl.name, impl / "detect.mjs", scan_roots=[str(root)], exclude_globs=[]
    )
    assert r.ran and r.structured, f"{impl.name} did not run/emit a structured report"
    return {v["rule_id"] for v in r.violations}


def test_all_w2_impls_present():
    for name in _W2_IMPLS:
        assert (_impl_dir(name) / "atdd.implementation.yaml").is_file(), f"missing impl {name}"
        assert (_impl_dir(name) / "detect.mjs").is_file(), f"missing detect.mjs for {name}"


def test_declared_rule_ids_match_expected():
    got: set[str] = set()
    for name in _W2_IMPLS:
        decl = yaml.safe_load((_impl_dir(name) / "atdd.implementation.yaml").read_text())["emits_rule_ids"]
        got.update(decl)
    assert got == _EXPECTED_RULE_IDS, f"declared set drift: {got ^ _EXPECTED_RULE_IDS}"


@pytest.mark.parametrize("impl,alias,rid", _CASES, ids=[f"{d.name}::{rid}" for d, a, rid in _CASES])
def test_rule_fires_on_dirty_not_clean(impl: Path, alias, rid: str):
    dirty = impl / "fixtures" / "dirty" / alias if alias else impl / "fixtures" / "dirty"
    clean = impl / "fixtures" / "clean" / alias if alias else impl / "fixtures" / "clean"
    assert dirty.is_dir(), f"missing dirty fixture for {rid}"
    assert rid in _emitted(impl, dirty), f"{rid} not emitted on its dirty fixture"
    if clean.is_dir():
        assert rid not in _emitted(impl, clean), f"{rid} falsely emitted on its clean fixture"


def test_families_emit_full_declared_set():
    """Each FAMILY, scanned over ALL its members' dirty fixtures at once, emits every
    rule_id it declares — the one-run-many-rules family contract."""
    for name in _W2_IMPLS:
        d = _impl_dir(name)
        if not (d / "checks" / "_map.json").is_file():
            continue
        decl = set(yaml.safe_load((d / "atdd.implementation.yaml").read_text())["emits_rule_ids"])
        got = _emitted(d, d / "fixtures" / "dirty")
        assert decl <= got, f"{name} missing {sorted(decl - got)} over combined dirty fixtures"
