"""Conformance suite for Worker WA's native Astro coder detectors (contract_version 1.1.0).

These are REAL (non-skipped) tests, mirroring conformance/test_w1_security.py from the
Convex wave: they import the same `discover` / `run` adapter halves and prove each WA
detector satisfies the SAME discover+run contract as the provider — discovery returns it
as a contract-compatible implementation targeting `frontend.workspace.runtime`, a clean
fixture yields zero RAW violations, a dirty fixture yields RAW v1.1 structured violations
through the env + JSON-report seam, and the provider emits RAW facts (exit 0 on a dirty
scan), never a disposition verdict.

WA nodes covered (native Astro rules, no Core equivalent):
  no-secret-in-frontmatter, client-directive-explicit, i18n-no-hardcoded-ui-string,
  no-hardcoded-color, component-frontmatter-fence.

Conformance tests stay WITH the provider, never inside the extensions that consume it.
Requires `node` on PATH (the provider's run command).
"""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

import pytest

_WS = Path(__file__).resolve().parent.parent  # frontend.workspace.runtime/
sys.path.insert(0, str(_WS / "adapter"))

import discover as discover_mod  # noqa: E402
import run as run_mod  # noqa: E402

requires_node = pytest.mark.skipif(shutil.which("node") is None, reason="node not on PATH")

# (implementation_id, impl_dir_name, min_dirty_violations, source_line_needle)
# `source_line_needle` is a substring expected in at least one dirty violation's
# source_line — a sharper check than a bare count.
_WA_NODES = [
    (
        "coder.astro.no-secret-in-frontmatter",
        "astro_no_secret_in_frontmatter",
        2,
        "sk_REDACTED",
    ),
    (
        "coder.astro.client-directive-explicit",
        "astro_client_directive_explicit",
        2,
        "onClick",
    ),
    (
        "coder.astro.i18n-no-hardcoded-ui-string",
        "astro_i18n_no_hardcoded_ui_string",
        2,
        "Forge",
    ),
    (
        "coder.astro.no-hardcoded-color",
        "astro_no_hardcoded_color",
        4,
        "#ff0000",
    ),
    (
        "coder.astro.component-frontmatter-fence",
        "astro_component_frontmatter_fence",
        1,
        "computeTotal",
    ),
]

_IMPL_IDS = {impl_id for impl_id, *_ in _WA_NODES}


def _impl_dir(dir_name: str) -> Path:
    return _WS / "implementations" / dir_name


def test_contract_compatible_same_major_le_provider() -> None:
    # Same caret-SemVer contract math the provider contract asserts — restated here
    # so this suite is self-contained.
    assert discover_mod.contract_compatible("1.0.0", "1.1.0") is True
    assert discover_mod.contract_compatible("1.1.0", "1.1.0") is True
    assert discover_mod.contract_compatible("1.2.0", "1.1.0") is False
    assert discover_mod.contract_compatible("2.0.0", "1.1.0") is False


def test_discover_includes_all_wa_nodes_for_this_workspace() -> None:
    impls = discover_mod.discover_implementations(_WS / "implementations")
    ids = {i.implementation_id for i in impls}
    # Membership, not exact-list: other workers' detectors may ship alongside.
    assert _IMPL_IDS <= ids
    assert all(i.targets_workspace == "frontend.workspace.runtime" for i in impls)


@requires_node
@pytest.mark.parametrize("impl_id,dir_name", [(i, d) for i, d, *_ in _WA_NODES])
def test_run_clean_yields_no_violations_via_report_channel(impl_id: str, dir_name: str) -> None:
    impl_dir = _impl_dir(dir_name)
    res = run_mod.run_implementation(
        impl_id,
        impl_dir / "detect.mjs",
        scan_roots=[str(impl_dir / "fixtures" / "clean")],
        exclude_globs=[],
    )
    assert res.ran
    assert res.structured is True
    assert res.violations == []


@requires_node
@pytest.mark.parametrize("impl_id,dir_name,min_v,needle", _WA_NODES)
def test_run_dirty_yields_raw_v11_violations(
    impl_id: str, dir_name: str, min_v: int, needle: str
) -> None:
    impl_dir = _impl_dir(dir_name)
    res = run_mod.run_implementation(
        impl_id,
        impl_dir / "detect.mjs",
        scan_roots=[str(impl_dir / "fixtures" / "dirty")],
        exclude_globs=[],
    )
    assert res.structured is True
    assert len(res.violations) >= min_v
    for v in res.violations:
        # Full v1.1 violation shape.
        assert set(v) >= {"rule_id", "file", "line", "col", "evidence", "source_line"}
        assert v["rule_id"] == impl_id
        assert isinstance(v["line"], int) and v["line"] >= 1
        assert isinstance(v["col"], int) and v["col"] >= 1
    assert any(needle in v["source_line"] for v in res.violations)


@requires_node
@pytest.mark.parametrize("impl_id,dir_name", [(i, d) for i, d, *_ in _WA_NODES])
def test_provider_emits_raw_not_disposition(impl_id: str, dir_name: str) -> None:
    # run-health (exit 0) is NOT a verdict: a dirty scan still exits 0 / passed=True.
    impl_dir = _impl_dir(dir_name)
    res = run_mod.run_implementation(
        impl_id,
        impl_dir / "detect.mjs",
        scan_roots=[str(impl_dir / "fixtures" / "dirty")],
        exclude_globs=[],
    )
    assert res.passed is True
    assert res.exit_code == 0
    assert res.violations  # the verdict (strict/advisory/…) is the downstream consumer's job
