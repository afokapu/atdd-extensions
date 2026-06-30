"""Conformance suite for the tester.convex.filename-urn slice (contract_version 1.1.0).

These are REAL (non-skipped) tests for the convex-tester filename detector, run
through the SAME convex.workspace.runtime adapter (`discover` / `run`) the provider
contract suite uses. They prove the tester detector obeys the v1.1 contract:
discovery returns it as a contract-compatible implementation that targets this
workspace, and a run produces RAW v1.1 structured violations through the env +
JSON-report seam (a clean fixture → 0; a mis-named test fixture → exactly 1, at
line/col 1 with the basename as source_line, per the filename-rule convention).

Conformance tests stay WITH the provider, never inside the extensions that consume
it. Requires `node` on PATH (the provider's run command).
"""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

import pytest

_WS = Path(__file__).resolve().parent.parent  # convex.workspace.runtime/
sys.path.insert(0, str(_WS / "adapter"))

import discover as discover_mod  # noqa: E402
import run as run_mod  # noqa: E402

_IMPL_DIR = _WS / "implementations" / "convex_test_filename_urn"
_DETECTOR = _IMPL_DIR / "detect.mjs"
_CLEAN = _IMPL_DIR / "fixtures" / "clean"
_DIRTY = _IMPL_DIR / "fixtures" / "dirty"
_IMPL_ID = "tester.convex.filename-urn"

requires_node = pytest.mark.skipif(shutil.which("node") is None, reason="node not on PATH")


def test_tester_detector_is_discovered_for_this_workspace() -> None:
    impls = discover_mod.discover_implementations(_WS / "implementations")
    by_id = {i.implementation_id: i for i in impls}
    assert _IMPL_ID in by_id, f"{_IMPL_ID} not discovered among {sorted(by_id)}"
    assert by_id[_IMPL_ID].targets_workspace == "convex.workspace.runtime"
    assert by_id[_IMPL_ID].contract_version == "1.1.0"


@requires_node
def test_run_clean_yields_no_violations_via_report_channel() -> None:
    # Clean fixture holds a URN-named test (`e001-unit-001-evaluate-cell.test.ts`)
    # and a colocated `{layer}.test.ts` (`domain.test.ts`) — both URN-derivable.
    res = run_mod.run_implementation(_IMPL_ID, _DETECTOR, scan_roots=[str(_CLEAN)], exclude_globs=[])
    assert res.ran
    assert res.structured is True
    assert res.violations == []


@requires_node
def test_run_dirty_yields_exactly_one_raw_v11_violation() -> None:
    res = run_mod.run_implementation(_IMPL_ID, _DETECTOR, scan_roots=[str(_DIRTY)], exclude_globs=[])
    assert res.structured is True
    assert len(res.violations) == 1
    v = res.violations[0]
    assert set(v) >= {"rule_id", "file", "line", "col", "evidence", "source_line"}
    assert v["rule_id"] == _IMPL_ID
    # filename rule: line/col pinned to 1, source_line is the offending basename.
    assert v["line"] == 1
    assert v["col"] == 1
    assert v["source_line"] == "myTest.test.ts"


@requires_node
def test_provider_emits_raw_not_disposition() -> None:
    # documentation-only is a downstream verdict; run-health (exit 0) is NOT a
    # verdict — a dirty scan still exits 0 / passed=True and emits the RAW list.
    res = run_mod.run_implementation(_IMPL_ID, _DETECTOR, scan_roots=[str(_DIRTY)], exclude_globs=[])
    assert res.passed is True
    assert res.exit_code == 0
    assert res.violations  # the advisory verdict is the downstream consumer's job
