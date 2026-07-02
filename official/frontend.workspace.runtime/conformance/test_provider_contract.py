"""Conformance suite for frontend.workspace.runtime (contract_version 1.1.0).

Unlike the typescript/supabase/fastapi providers (whose adapters are
NotImplementedError stubs and whose suites are skipped), this provider has a REAL
adapter, so these tests actually RUN. They prove the frontend runtime satisfies the
SAME discover+run+CLI contract as atdd.workspace.python-pytest: discovery returns
only contract-compatible implementations that target this workspace, a run produces
RAW v1.1 structured violations through the env + JSON-report seam, and the provider
CLI (cli/scan.py — the subprocess boundary core shells out to) emits that RAW v1.1
array on stdout with run-health exit codes.

Conformance tests stay WITH the provider, never inside the extensions that consume
it. Requires `node` on PATH (the provider's run command).
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import textwrap
from pathlib import Path

import pytest

_WS = Path(__file__).resolve().parent.parent  # frontend.workspace.runtime/
sys.path.insert(0, str(_WS / "adapter"))

import discover as discover_mod  # noqa: E402
import run as run_mod  # noqa: E402

_CLI = _WS / "cli" / "scan.py"
_IMPL_DIR = _WS / "implementations" / "vite_logging_silent_swallow"
_DETECTOR = _IMPL_DIR / "detect.mjs"
_CLEAN = _IMPL_DIR / "fixtures" / "clean"
_DIRTY = _IMPL_DIR / "fixtures" / "dirty"
_IMPL_ID = "coder.vite.logging-silent-swallow"

requires_node = pytest.mark.skipif(shutil.which("node") is None, reason="node not on PATH")


def test_contract_compatible_same_major_le_provider() -> None:
    assert discover_mod.contract_compatible("1.0.0", "1.1.0") is True
    assert discover_mod.contract_compatible("1.1.0", "1.1.0") is True
    assert discover_mod.contract_compatible("1.2.0", "1.1.0") is False  # needs newer provider
    assert discover_mod.contract_compatible("2.0.0", "1.1.0") is False  # major mismatch


def test_discover_returns_only_contract_compatible_for_this_workspace() -> None:
    impls = discover_mod.discover_implementations(_WS / "implementations")
    ids = {i.implementation_id for i in impls}
    assert _IMPL_ID in ids  # membership, not exact-list: more detectors may ship
    assert all(i.targets_workspace == "frontend.workspace.runtime" for i in impls)


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
    assert len(res.violations) >= 1
    v = res.violations[0]
    assert set(v) >= {"rule_id", "file", "line", "col", "evidence", "source_line"}
    assert v["rule_id"] == _IMPL_ID


@requires_node
def test_provider_emits_raw_not_disposition() -> None:
    # run-health (exit 0) is NOT a verdict: a dirty scan still exits 0 / passed=True.
    res = run_mod.run_implementation(_IMPL_ID, _DETECTOR, scan_roots=[str(_DIRTY)], exclude_globs=[])
    assert res.passed is True
    assert res.exit_code == 0
    assert res.violations  # the verdict (strict → fail) is the downstream consumer's job


# ── CLI: the provider-CLI subprocess boundary core shells out to ──────────────
#
# cli/scan.py is what ``atdd enforce`` subprocesses: it resolves a discovered
# impl, runs the detector over ATDD_SCAN_ROOTS, and prints the RAW v1.1 array to
# stdout. These tests invoke the REAL CLI exactly as core would (env contract, no
# imports) and assert the boundary: RAW JSON on stdout, run-health exit codes,
# and exit 2 (empty stdout) on resolution failure — never a fake-green pass.


def _run_cli(*argv: str, scan_roots: list[str] | None = None,
             impl_id: str | None = None) -> subprocess.CompletedProcess:
    env = {**os.environ}
    if scan_roots is not None:
        env["ATDD_SCAN_ROOTS"] = json.dumps(scan_roots)
    if impl_id is not None:
        env["ATDD_IMPL_ID"] = impl_id
    return subprocess.run(
        [sys.executable, str(_CLI), *argv],
        capture_output=True, text=True, env=env,
    )


@requires_node
def test_cli_dirty_emits_raw_v11_array_on_stdout() -> None:
    proc = _run_cli(scan_roots=[str(_DIRTY)], impl_id=_IMPL_ID)
    assert proc.returncode == 0, proc.stderr
    parsed = json.loads(proc.stdout)  # raises if stdout is not valid JSON
    assert isinstance(parsed, list) and len(parsed) >= 1
    v = parsed[0]
    assert set(v) >= {"rule_id", "file", "line", "col", "evidence", "source_line"}
    assert v["rule_id"] == _IMPL_ID


@requires_node
def test_cli_clean_emits_empty_array_exit_0() -> None:
    proc = _run_cli(scan_roots=[str(_CLEAN)], impl_id=_IMPL_ID)
    assert proc.returncode == 0, proc.stderr
    assert json.loads(proc.stdout) == []


def test_cli_no_scan_roots_exits_2_empty_stdout() -> None:
    proc = _run_cli()  # neither env nor argv scan roots
    assert proc.returncode == 2
    assert proc.stdout.strip() == ""  # stdout stays empty so json.loads is safe


def test_cli_undiscoverable_impl_exits_2() -> None:
    proc = _run_cli(scan_roots=[str(_CLEAN)], impl_id="ext.does-not-exist")
    assert proc.returncode == 2
    assert proc.stdout.strip() == ""


def test_cli_missing_report_field_exits_2(tmp_path: Path) -> None:
    """A misconfigured impl (no ``report:``) fails honestly with exit 2, not fake-green."""
    impl = tmp_path / "impls" / "broken"
    impl.mkdir(parents=True)
    (impl / "atdd.implementation.yaml").write_text(
        textwrap.dedent(
            """\
            kind: implementation
            implementation_id: ext.broken
            targets_workspace: frontend.workspace.runtime
            contract_version: "1.1.0"
            entrypoint: broken.mjs
            """
        )
    )
    scan_root = tmp_path / "scan"
    scan_root.mkdir()
    (scan_root / "benign.ts").write_text("export const x = 1\n")

    proc = _run_cli("--impls-root", str(impl.parent), str(scan_root), impl_id="ext.broken")
    assert proc.returncode == 2
    assert "report" in proc.stderr.lower()
    assert proc.stdout.strip() == ""
