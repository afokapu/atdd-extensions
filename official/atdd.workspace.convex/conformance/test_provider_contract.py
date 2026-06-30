"""Conformance suite for atdd.workspace.convex (contract_version 1.1.0).

Unlike the typescript/supabase/fastapi providers (whose adapters are
NotImplementedError stubs and whose suites are skipped), this provider has a REAL
adapter, so these tests actually RUN. They prove the convex runtime satisfies the
SAME discover+run contract as atdd.workspace.python-pytest: discovery returns only
contract-compatible implementations that target this workspace, and a run produces
RAW v1.1 structured violations through the env + JSON-report seam.

Conformance tests stay WITH the provider, never inside the extensions that consume
it. Requires `node` on PATH (the provider's run command).
"""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

import pytest

_WS = Path(__file__).resolve().parent.parent  # atdd.workspace.convex/
sys.path.insert(0, str(_WS / "adapter"))

import discover as discover_mod  # noqa: E402
import run as run_mod  # noqa: E402

_IMPL_DIR = _WS / "implementations" / "convex_no_server_console_log"
_DETECTOR = _IMPL_DIR / "detect.mjs"
_CLEAN = _IMPL_DIR / "fixtures" / "clean"
_DIRTY = _IMPL_DIR / "fixtures" / "dirty"
_IMPL_ID = "coder.convex.no-server-console-log"

requires_node = pytest.mark.skipif(shutil.which("node") is None, reason="node not on PATH")


def test_contract_compatible_same_major_le_provider() -> None:
    assert discover_mod.contract_compatible("1.0.0", "1.1.0") is True
    assert discover_mod.contract_compatible("1.1.0", "1.1.0") is True
    assert discover_mod.contract_compatible("1.2.0", "1.1.0") is False  # needs newer provider
    assert discover_mod.contract_compatible("2.0.0", "1.1.0") is False  # major mismatch


def test_discover_returns_only_contract_compatible_for_this_workspace() -> None:
    impls = discover_mod.discover_implementations(_WS / "implementations")
    assert [i.implementation_id for i in impls] == [_IMPL_ID]
    assert impls[0].targets_workspace == "atdd.workspace.convex"


@requires_node
def test_run_clean_yields_no_violations_via_report_channel() -> None:
    res = run_mod.run_implementation(_IMPL_ID, _DETECTOR, scan_roots=[str(_CLEAN)], exclude_globs=[])
    assert res.ran
    assert res.structured is True
    assert res.violations == []


@requires_node
def test_run_dirty_yields_raw_v11_violation() -> None:
    res = run_mod.run_implementation(_IMPL_ID, _DETECTOR, scan_roots=[str(_DIRTY)], exclude_globs=[])
    assert res.structured is True
    assert len(res.violations) == 1
    v = res.violations[0]
    assert set(v) >= {"rule_id", "file", "line", "col", "evidence", "source_line"}
    assert v["rule_id"] == _IMPL_ID
    assert "console.log" in v["source_line"]


@requires_node
def test_provider_emits_raw_not_disposition() -> None:
    # run-health (exit 0) is NOT a verdict: a dirty scan still exits 0 / passed=True.
    res = run_mod.run_implementation(_IMPL_ID, _DETECTOR, scan_roots=[str(_DIRTY)], exclude_globs=[])
    assert res.passed is True
    assert res.exit_code == 0
    assert res.violations  # the verdict (strict → fail) is the downstream consumer's job
