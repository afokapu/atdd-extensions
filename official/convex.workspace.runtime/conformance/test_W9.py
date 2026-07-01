"""W9 conformance — tester acceptance+coverage mirror.

The only AGNOSTIC-CONSUMER rule in W9's slice is
``tester.acceptance-violation.live-smoke-acceptance-must-execute``, mirrored for the
Convex/Vitest stack as ``tester.convex.live-smoke-no-self-skip`` (see
docs/mirror-classification/W9.md — the other 12 rules are SUBSTRATE-SPEC /
PLANNER-OWNED and documented why-not, not mirrored).

This file proves the built detector: it fires on its dirty fixtures (a live-smoke
Vitest test that self-skips) and stays silent on its clean fixtures (a live-smoke
test that runs-or-fails, and an ordinary unit test that legitimately ``it.skip``s).
Self-contained: resolves the adapter + implementation relative to this workspace."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest
import yaml

_WS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_WS / "adapter"))
import run as run_mod  # noqa: E402

RULE_ID = "tester.convex.live-smoke-no-self-skip"
_IMPL = _WS / "implementations" / "convex_test_live_smoke_no_self_skip"
_NODE = (
    _WS.parent
    / "convex.extension.tester"
    / "conventions"
    / "tester.convex.live-smoke-no-self-skip.convention.yaml"
)


def _emit(root: Path):
    r = run_mod.run_implementation(
        _IMPL.name, _IMPL / "detect.mjs", scan_roots=[str(root)], exclude_globs=[]
    )
    assert r.ran and r.structured, f"detector did not run/emit structured report: {r.stdout}"
    return r.violations


def test_convention_node_loads_and_is_wellformed():
    node = yaml.safe_load(_NODE.read_text())
    assert node["schema_version"] == "1.1.0" or node["schema_version"] == 1.1
    assert node["rule_id"] == RULE_ID
    assert node["kind"] == "rule"
    assert node["metadata"]["disposition"] == "strict"
    for section in ("statement", "content", "terms"):
        assert node.get(section), f"node missing {section}"


def test_implementation_manifest_conforms():
    man = yaml.safe_load((_IMPL / "atdd.implementation.yaml").read_text())
    assert man["kind"] == "implementation"
    assert man["subtype"] == "validator"
    assert man["targets_workspace"] == "convex.workspace.runtime"
    assert str(man["contract_version"]) == "1.1.0"
    assert man["entrypoint"] == "detect.mjs"
    assert man["report"] == "detect.mjs"
    emits = man["emits_rule_ids"]
    assert emits and RULE_ID in emits
    assert man["realizes_convention"] in emits


def test_fires_on_dirty_fixtures():
    v = _emit(_IMPL / "fixtures" / "dirty")
    rids = {x["rule_id"] for x in v}
    assert RULE_ID in rids, f"expected {RULE_ID} on dirty fixtures, got {rids}"
    # both dirty files must be implicated (basename-classified + header-classified)
    hit_files = {Path(x["file"]).name for x in v if x["rule_id"] == RULE_ID}
    assert any(f.endswith(".smoke.test.ts") for f in hit_files), hit_files
    assert "live-submit.test.ts" in hit_files, hit_files
    # every violation is a well-formed v1.1 record
    for x in v:
        for k in ("rule_id", "file", "line", "col", "evidence", "source_line"):
            assert k in x, f"violation missing {k}: {x}"


def test_silent_on_clean_fixtures():
    v = _emit(_IMPL / "fixtures" / "clean")
    offenders = [x for x in v if x["rule_id"] == RULE_ID]
    assert not offenders, f"{RULE_ID} falsely emitted on clean fixtures: {offenders}"


def test_ordinary_unit_test_skip_not_flagged():
    """Scoping: an ordinary (non-live-smoke) unit test using it.skip / describe.skip /
    test.todo must NOT be flagged — only live-smoke tests are in scope."""
    unit = _IMPL / "fixtures" / "clean" / "convex" / "setup_match" / "join_lobby" / "domain"
    v = _emit(unit)
    assert not [x for x in v if x["rule_id"] == RULE_ID], v


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-q"]))
