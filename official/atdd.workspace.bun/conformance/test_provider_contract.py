"""Conformance suite for atdd.workspace.bun (contract_version 1.1.0).

A new runtime earns the right to be called a provider by passing THIS suite —
proving it satisfies the SAME discover+run+CLI contract as
atdd.workspace.python-pytest and frontend.workspace.runtime: discovery returns
only contract-compatible implementations targeting this workspace, a run produces
RAW v1.1 structured violations through the env + JSON-report seam, and the
provider CLI (cli/scan.py — the subprocess boundary core shells out to) emits that
RAW v1.1 array on stdout with honest run-health exit codes.

Conformance tests stay WITH the provider, never inside the extensions that consume
it. Requires `bun` on PATH (the provider's run command).

Beyond the shared contract, this suite pins the two facts that are specific to a
FAMILY provider: every rule_id an implementation declares in `emits_rule_ids` must
actually be emitted by a dirty scan (no declared-but-dead rule), and a clean scan
must be silent for all of them (no rule that can only ever fire).
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
import yaml

_WS = Path(__file__).resolve().parent.parent  # atdd.workspace.bun/
sys.path.insert(0, str(_WS / "adapter"))

import discover as discover_mod  # noqa: E402
import run as run_mod  # noqa: E402

_CLI = _WS / "cli" / "scan.py"
_IMPLS = _WS / "implementations"
_IMPL_ID = "htmx_hypermedia_detector"
_IMPL_DIR = _IMPLS / _IMPL_ID
_DETECTOR = _IMPL_DIR / "detect.mjs"
_CLEAN = _IMPL_DIR / "fixtures" / "clean"
_DIRTY = _IMPL_DIR / "fixtures" / "dirty"

# Both families this provider ships, exercised identically by the parametrised tests.
_FAMILIES = ("htmx_hypermedia_detector", "bun_fullstack_detector",
             "bun_green_traceability_detector", "bun_ts_metrics_detector",
             "bun_security_hygiene_detector", "bun_tester_discipline_detector",
             "bun_clean_architecture_detector", "htmx_tester_detector")

requires_bun = pytest.mark.skipif(shutil.which("bun") is None, reason="bun not on PATH")


def _family(impl_id: str) -> tuple[Path, Path, Path, list[str]]:
    """(detector, clean_fixtures, dirty_fixtures, declared_rule_ids) for a family."""
    d = _IMPLS / impl_id
    manifest = yaml.safe_load((d / "atdd.implementation.yaml").read_text())
    return (
        d / manifest["report"],
        d / "fixtures" / "clean",
        d / "fixtures" / "dirty",
        list(manifest["emits_rule_ids"]),
    )


# ── discover half ────────────────────────────────────────────────────────────

def test_contract_compatible_same_major_le_provider() -> None:
    assert discover_mod.contract_compatible("1.0.0", "1.1.0") is True
    assert discover_mod.contract_compatible("1.1.0", "1.1.0") is True
    assert discover_mod.contract_compatible("1.2.0", "1.1.0") is False  # needs newer provider
    assert discover_mod.contract_compatible("2.0.0", "1.1.0") is False  # major mismatch


def test_discover_returns_only_contract_compatible_for_this_workspace() -> None:
    impls = discover_mod.discover_implementations(_IMPLS)
    ids = {i.implementation_id for i in impls}
    assert set(_FAMILIES) <= ids  # membership, not exact-list: more detectors may ship
    assert all(i.targets_workspace == "atdd.workspace.bun" for i in impls)


# ── run half ─────────────────────────────────────────────────────────────────

@requires_bun
@pytest.mark.parametrize("impl_id", _FAMILIES)
def test_run_clean_yields_no_violations_via_report_channel(impl_id: str) -> None:
    detector, clean, _, _ = _family(impl_id)
    res = run_mod.run_implementation(impl_id, detector, scan_roots=[str(clean)], exclude_globs=[])
    assert res.ran
    assert res.structured is True
    assert res.violations == []


@requires_bun
@pytest.mark.parametrize("impl_id", _FAMILIES)
def test_run_dirty_yields_raw_v11_violations(impl_id: str) -> None:
    detector, _, dirty, _ = _family(impl_id)
    res = run_mod.run_implementation(impl_id, detector, scan_roots=[str(dirty)], exclude_globs=[])
    assert res.structured is True
    assert len(res.violations) >= 1
    for v in res.violations:
        assert set(v) >= {"rule_id", "file", "line", "col", "evidence", "source_line"}


@requires_bun
@pytest.mark.parametrize("impl_id", _FAMILIES)
def test_every_declared_rule_id_actually_fires(impl_id: str) -> None:
    """No declared-but-dead rule: `emits_rule_ids` is a promise the fixtures keep.

    A family manifest that lists a rule its detector can never emit is the exact
    way a rule surface becomes decorative — declared, bound, and silently
    unenforced. The dirty fixtures must therefore provoke EVERY declared id.
    """
    detector, _, dirty, declared = _family(impl_id)
    res = run_mod.run_implementation(impl_id, detector, scan_roots=[str(dirty)], exclude_globs=[])
    emitted = {v["rule_id"] for v in res.violations}
    assert emitted == set(declared), f"declared-but-not-emitted: {sorted(set(declared) - emitted)}"


@requires_bun
@pytest.mark.parametrize("impl_id", _FAMILIES)
def test_provider_emits_raw_not_disposition(impl_id: str) -> None:
    # run-health (exit 0) is NOT a verdict: a dirty scan still exits 0 / passed=True.
    detector, _, dirty, _ = _family(impl_id)
    res = run_mod.run_implementation(impl_id, detector, scan_roots=[str(dirty)], exclude_globs=[])
    assert res.passed is True
    assert res.exit_code == 0
    assert res.violations  # the verdict (strict → fail) is the downstream consumer's job


# ── CLI: the provider-CLI subprocess boundary core shells out to ─────────────
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


@requires_bun
@pytest.mark.parametrize("impl_id", _FAMILIES)
def test_cli_dirty_emits_raw_v11_array_on_stdout(impl_id: str) -> None:
    _, _, dirty, declared = _family(impl_id)
    proc = _run_cli(scan_roots=[str(dirty)], impl_id=impl_id)
    assert proc.returncode == 0, proc.stderr
    parsed = json.loads(proc.stdout)  # raises if stdout is not valid JSON
    assert isinstance(parsed, list) and len(parsed) >= 1
    for v in parsed:
        assert set(v) >= {"rule_id", "file", "line", "col", "evidence", "source_line"}
        assert v["rule_id"] in declared


@requires_bun
@pytest.mark.parametrize("impl_id", _FAMILIES)
def test_cli_clean_emits_empty_array_exit_0(impl_id: str) -> None:
    _, clean, _, _ = _family(impl_id)
    proc = _run_cli(scan_roots=[str(clean)], impl_id=impl_id)
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
            targets_workspace: atdd.workspace.bun
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


@requires_bun
def test_scan_mount_is_obeyed_not_repo_discovered(tmp_path: Path) -> None:
    """A detector scans ONLY the declared roots.

    The provider's whole isolation story rests on this: if a detector walked out
    of its mount it would report the consumer's vendored `.atdd/` fixtures as
    consumer violations. An empty mount must therefore be silent even though the
    dirty fixtures exist elsewhere on disk.
    """
    empty = tmp_path / "empty"
    empty.mkdir()
    res = run_mod.run_implementation(_IMPL_ID, _DETECTOR, scan_roots=[str(empty)], exclude_globs=[])
    assert res.structured is True
    assert res.violations == []
