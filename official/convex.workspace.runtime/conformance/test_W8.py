"""W8 conformance — Convex coder gap fill (security/sql-injection).

Scoped to the implementations W8 ADDED to convex.workspace.runtime (add-only). For
each: the manifest passes the enforced implementation-schema, its convention node
`yaml.safe_load`s, and the detector fires on its dirty fixture but NOT on its clean
one (RAW v1.1 channel). Mirrors the workspace test_families.py contract but touches
only W8's own files.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest
import yaml

_WS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_WS / "adapter"))
import run as run_mod  # noqa: E402

# implementation dir -> (rule_id, convention node path relative to official/)
_ROOT = _WS.parent  # official/
W8_IMPLS = {
    "convex_security_sql_injection": (
        "coder.convex.security-sql-injection",
        "convex.extension.coder/conventions/coder.convex.security-sql-injection.convention.yaml",
    ),
}

_IMPL_DIRS = _WS / "implementations"


def _emitted(impl_dir: Path, root: Path) -> set[str]:
    r = run_mod.run_implementation(
        impl_dir.name, impl_dir / "detect.mjs", scan_roots=[str(root)], exclude_globs=[]
    )
    assert r.ran and r.structured, f"{impl_dir.name} did not run/emit a structured report"
    return {v["rule_id"] for v in r.violations}


@pytest.mark.parametrize("impl_name,rid,node_rel", [(k, v[0], v[1]) for k, v in W8_IMPLS.items()])
def test_manifest_schema(impl_name, rid, node_rel):
    m = yaml.safe_load((_IMPL_DIRS / impl_name / "atdd.implementation.yaml").read_text())
    assert m["kind"] == "implementation"
    assert m["subtype"] == "validator"
    assert m["contract_version"] == "1.1.0"
    assert m["targets_workspace"] == "convex.workspace.runtime"
    assert m["entrypoint"] and m["report"]
    emits = m["emits_rule_ids"]
    assert emits and rid in emits
    assert m["realizes_convention"] in emits  # primary ∈ emits_rule_ids


@pytest.mark.parametrize("impl_name,rid,node_rel", [(k, v[0], v[1]) for k, v in W8_IMPLS.items()])
def test_convention_node_loads(impl_name, rid, node_rel):
    node = yaml.safe_load((_ROOT / node_rel).read_text())
    assert node["rule_id"] == rid
    assert node["schema_version"] == "1.1.0"
    assert node["kind"] == "rule"


@pytest.mark.parametrize("impl_name,rid,node_rel", [(k, v[0], v[1]) for k, v in W8_IMPLS.items()])
def test_fires_on_dirty_not_clean(impl_name, rid, node_rel):
    d = _IMPL_DIRS / impl_name
    assert rid in _emitted(d, d / "fixtures" / "dirty"), f"{rid} not emitted on its dirty fixture"
    clean = d / "fixtures" / "clean"
    if clean.is_dir():
        assert rid not in _emitted(d, clean), f"{rid} falsely emitted on its clean fixture"
