"""W11 conformance — Tester: security + telemetry + test-isolation mirror.

Self-contained, add-only. Validates ONLY the four W11 agnostic builds (leaving the
shared test_families.py untouched):

  * convex_test_security_detector   (FAMILY)  tester.convex.security-auth
                                              tester.convex.security-input
  * convex_test_telemetry_emit      (single)  tester.convex.telemetry-emit
  * convex_test_isolation_patterns  (single)  tester.convex.test-isolation-no-polluting-patterns

For every emitted rule_id: the detector fires on its dirty fixture and stays silent
on its clean one. Manifests satisfy the enforced implementation schema; each convention
node yaml.safe_loads and declares the matching rule_id and validator ref.
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

_IMPLS_DIR = _WS / "implementations"
_CONV_DIR = _WS.parent / "convex.extension.tester" / "conventions"

# The exact W11 build set (add-only; scoped so this file never asserts over siblings).
_W11_IMPLS = [
    "convex_test_security_detector",
    "convex_test_telemetry_emit",
    "convex_test_isolation_patterns",
]
_W11_RULE_IDS = {
    "tester.convex.security-auth",
    "tester.convex.security-input",
    "tester.convex.telemetry-emit",
    "tester.convex.test-isolation-no-polluting-patterns",
}

# Enforced implementation-schema fields (implementation.yaml).
_REQUIRED_MANIFEST_KEYS = (
    "schema_version", "kind", "subtype", "targets_workspace", "contract_version",
    "entrypoint", "report", "emits_rule_ids", "realizes_convention",
)


def _manifest(impl: str) -> dict:
    return yaml.safe_load((_IMPLS_DIR / impl / "atdd.implementation.yaml").read_text())


# (impl, alias|None, rule_id) — one case per emitted rule (family members carry an alias).
def _cases() -> list[tuple[Path, str | None, str]]:
    out: list[tuple[Path, str | None, str]] = []
    for impl in _W11_IMPLS:
        d = _IMPLS_DIR / impl
        mapf = d / "checks" / "_map.json"
        if mapf.is_file():  # FAMILY: (alias-subdir, rule_id) per member
            for alias, rid in json.loads(mapf.read_text()).items():
                out.append((d, alias, rid))
        else:  # SINGLETON
            for rid in _manifest(impl)["emits_rule_ids"]:
                out.append((d, None, rid))
    return out


_CASES = _cases()


def _emitted(impl: Path, root: Path) -> set[str]:
    r = run_mod.run_implementation(
        impl.name, impl / "detect.mjs", scan_roots=[str(root)], exclude_globs=[]
    )
    assert r.ran and r.structured, f"{impl.name} did not run/emit a structured report"
    return {v["rule_id"] for v in r.violations}


def test_w11_covers_exactly_the_declared_rule_ids():
    got = {rid for _, _, rid in _CASES}
    assert got == _W11_RULE_IDS, f"W11 rule-id set drift: {got ^ _W11_RULE_IDS}"


@pytest.mark.parametrize("impl,alias,rid", _CASES, ids=[f"{d.name}::{rid}" for d, a, rid in _CASES])
def test_rule_fires_on_dirty_not_clean(impl, alias, rid):
    dirty = impl / "fixtures" / "dirty" / alias if alias else impl / "fixtures" / "dirty"
    clean = impl / "fixtures" / "clean" / alias if alias else impl / "fixtures" / "clean"
    assert dirty.is_dir(), f"{impl.name}: missing dirty fixture dir {dirty}"
    assert rid in _emitted(impl, dirty), f"{rid} not emitted on its dirty fixture"
    assert clean.is_dir(), f"{impl.name}: missing clean fixture dir {clean}"
    assert rid not in _emitted(impl, clean), f"{rid} falsely emitted on its clean fixture"


def test_family_emits_full_declared_set_over_combined_dirty():
    d = _IMPLS_DIR / "convex_test_security_detector"
    decl = set(_manifest(d.name)["emits_rule_ids"])
    got = _emitted(d, d / "fixtures" / "dirty")
    assert decl <= got, f"{d.name} missing {sorted(decl - got)} over combined dirty fixtures"


@pytest.mark.parametrize("impl", _W11_IMPLS)
def test_manifest_conforms_to_implementation_schema(impl):
    m = _manifest(impl)
    for k in _REQUIRED_MANIFEST_KEYS:
        assert m.get(k) not in (None, "", []), f"{impl}: manifest missing '{k}'"
    assert m["kind"] == "implementation" and m["subtype"] == "validator"
    assert m["contract_version"] == "1.1.0"
    assert m["targets_workspace"] == "convex.workspace.runtime"
    emits = m["emits_rule_ids"]
    assert isinstance(emits, list) and emits, f"{impl}: emits_rule_ids must be non-empty"
    assert m["realizes_convention"] in emits, f"{impl}: primary not in emits_rule_ids"
    assert (_IMPLS_DIR / impl / m["entrypoint"]).is_file(), f"{impl}: entrypoint missing"


@pytest.mark.parametrize("rid", sorted(_W11_RULE_IDS))
def test_convention_node_loads_and_binds(rid):
    """Every W11 convention node yaml.safe_loads and binds to a real detector ref."""
    path = _CONV_DIR / f"{rid}.convention.yaml"
    assert path.is_file(), f"missing convention node {path.name}"
    node = yaml.safe_load(path.read_text())
    assert node["rule_id"] == rid
    assert node["schema_version"] == "1.1.0"
    assert node["kind"] == "rule"
    ref = node["implementation"]["ref"]
    impl_dir = _IMPLS_DIR / ref
    assert impl_dir.is_dir(), f"{rid}: implementation ref '{ref}' not found"
    assert rid in _manifest(ref)["emits_rule_ids"], f"{rid}: not emitted by its impl '{ref}'"
    # Content fidelity: statement + normative_text + fix_hint present and non-trivial.
    assert len(node["statement"]) > 80
    for field in ("summary", "normative_text", "fix_hint"):
        assert node["content"][field].strip(), f"{rid}: content.{field} empty"
