"""W4 conformance — Convex commons layering family (convex_commons_layering_detector).

Proves the mirror is real: the manifest passes the enforced implementation-schema,
and every declared rule_id fires on the dirty fixture but not the clean one — the
one-run-many-rules family contract. Self-contained; drives the workspace adapter."""
from __future__ import annotations
import sys
from pathlib import Path
import pytest, yaml

_WS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_WS / "adapter"))
import run as run_mod  # noqa: E402

_IMPL = _WS / "implementations" / "convex_commons_layering_detector"
_MANIFEST = yaml.safe_load((_IMPL / "atdd.implementation.yaml").read_text())
_RIDS = _MANIFEST["emits_rule_ids"]


def _emitted(root: Path) -> set[str]:
    r = run_mod.run_implementation(
        _IMPL.name, _IMPL / "detect.mjs", scan_roots=[str(root)], exclude_globs=[]
    )
    assert r.ran and r.structured, f"{_IMPL.name} did not run/emit a structured report"
    return {v["rule_id"] for v in r.violations}


def test_manifest_conforms_to_implementation_schema():
    m = _MANIFEST
    assert m["kind"] == "implementation"
    assert m["subtype"] == "validator"
    assert m["targets_workspace"] == "convex.workspace.runtime"
    assert m["contract_version"] == "1.1.0"
    assert (_IMPL / m["entrypoint"]).is_file()
    assert (_IMPL / m["report"]).is_file()
    assert _RIDS, "emits_rule_ids must be non-empty"
    assert m["realizes_convention"] in _RIDS, "primary convention must be in emits_rule_ids"


def test_every_rule_realized_by_a_convention_node():
    conv_dir = _WS.parent / "convex.extension.coder.base" / "conventions"
    for rid in _RIDS:
        node = conv_dir / f"{rid}.convention.yaml"
        assert node.is_file(), f"missing convention node for {rid}"
        assert yaml.safe_load(node.read_text())["rule_id"] == rid


@pytest.mark.parametrize("rid", _RIDS)
def test_rule_fires_on_dirty_not_clean(rid):
    assert rid in _emitted(_IMPL / "fixtures" / "dirty"), f"{rid} not emitted on dirty fixture"
    assert rid not in _emitted(_IMPL / "fixtures" / "clean"), f"{rid} falsely emitted on clean fixture"


def test_family_emits_full_declared_set_over_dirty():
    got = _emitted(_IMPL / "fixtures" / "dirty")
    assert set(_RIDS) <= got, f"missing {sorted(set(_RIDS) - got)} over dirty fixtures"
