"""Conformance suite for the Worker WV1 Vite/React design/tokens/boundaries slices
(contract_version 1.1.0).

These are REAL (not skipped) tests for the five existence-style detectors owned by
frontend.extension.vite-coder and realized by frontend.workspace.runtime
implementations:

  * coder.vite.boundaries-http-client  — no raw fetch()/axios in component files.
  * coder.vite.design-orphan-ui        — every exported component is imported somewhere.
  * coder.vite.design-primitives       — no raw interactive HTML element in app code.
  * coder.vite.design-token-color      — color style props reference tokens, not literals.
  * coder.vite.design-token-hardcoded  — no hardcoded hex/rgb color literal in tsx/css.

They mirror the patterns in the Convex conformance suite (test_coder_slices.py):
discovery returns each detector as a contract-compatible implementation targeting
this workspace, and a run produces RAW v1.1 structured violations through the
env + JSON-report seam (clean fixture -> 0, dirty fixture -> exactly 1). Run-health
(exit 0) is NOT a verdict — a dirty scan still exits 0 / passed=True. Requires
`node` on PATH.
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

_IMPLS = _WS / "implementations"

requires_node = pytest.mark.skipif(shutil.which("node") is None, reason="node not on PATH")

_KEYS = {"rule_id", "file", "line", "col", "evidence", "source_line"}


def _impl(snake: str):
    d = _IMPLS / snake
    return d / "detect.mjs", d / "fixtures" / "clean", d / "fixtures" / "dirty"


# --- boundaries-http-client -------------------------------------------------
_HTTP_DETECTOR, _HTTP_CLEAN, _HTTP_DIRTY = _impl("vite_boundaries_http_client")
_HTTP_ID = "coder.vite.boundaries-http-client"


def test_discover_includes_http_client_slice() -> None:
    impls = discover_mod.discover_implementations(_IMPLS)
    ids = {i.implementation_id for i in impls}
    assert _HTTP_ID in ids
    for impl in impls:
        assert impl.targets_workspace == "frontend.workspace.runtime"


@requires_node
def test_http_client_clean_yields_no_violations() -> None:
    res = run_mod.run_implementation(_HTTP_ID, _HTTP_DETECTOR, scan_roots=[str(_HTTP_CLEAN)], exclude_globs=[])
    assert res.ran
    assert res.structured is True
    assert res.violations == []


@requires_node
def test_http_client_dirty_yields_one_raw_v11_violation() -> None:
    res = run_mod.run_implementation(_HTTP_ID, _HTTP_DETECTOR, scan_roots=[str(_HTTP_DIRTY)], exclude_globs=[])
    assert res.structured is True
    assert len(res.violations) == 1
    v = res.violations[0]
    assert set(v) >= _KEYS
    assert v["rule_id"] == _HTTP_ID
    assert v["file"].endswith("ProfilePanel.tsx")
    assert "fetch" in v["source_line"]


@requires_node
def test_http_client_emits_raw_not_disposition() -> None:
    # run-health (exit 0) is NOT a verdict: a dirty scan still exits 0 / passed=True.
    res = run_mod.run_implementation(_HTTP_ID, _HTTP_DETECTOR, scan_roots=[str(_HTTP_DIRTY)], exclude_globs=[])
    assert res.passed is True
    assert res.exit_code == 0
    assert res.violations


# --- design-orphan-ui -------------------------------------------------------
_ORPHAN_DETECTOR, _ORPHAN_CLEAN, _ORPHAN_DIRTY = _impl("vite_design_orphan_ui")
_ORPHAN_ID = "coder.vite.design-orphan-ui"


def test_discover_includes_orphan_ui_slice() -> None:
    ids = {i.implementation_id for i in discover_mod.discover_implementations(_IMPLS)}
    assert _ORPHAN_ID in ids


@requires_node
def test_orphan_ui_clean_yields_no_violations() -> None:
    # main -> App -> Button: every exported component is imported somewhere.
    res = run_mod.run_implementation(_ORPHAN_ID, _ORPHAN_DETECTOR, scan_roots=[str(_ORPHAN_CLEAN)], exclude_globs=[])
    assert res.ran
    assert res.structured is True
    assert res.violations == []


@requires_node
def test_orphan_ui_dirty_yields_one_raw_v11_violation() -> None:
    res = run_mod.run_implementation(_ORPHAN_ID, _ORPHAN_DETECTOR, scan_roots=[str(_ORPHAN_DIRTY)], exclude_globs=[])
    assert res.structured is True
    assert len(res.violations) == 1
    v = res.violations[0]
    assert set(v) >= _KEYS
    assert v["rule_id"] == _ORPHAN_ID
    assert v["file"].endswith("OrphanCard.tsx")
    assert "OrphanCard" in v["evidence"]


@requires_node
def test_orphan_ui_emits_raw_not_disposition() -> None:
    res = run_mod.run_implementation(_ORPHAN_ID, _ORPHAN_DETECTOR, scan_roots=[str(_ORPHAN_DIRTY)], exclude_globs=[])
    assert res.passed is True
    assert res.exit_code == 0
    assert res.violations


# --- design-primitives ------------------------------------------------------
_PRIM_DETECTOR, _PRIM_CLEAN, _PRIM_DIRTY = _impl("vite_design_primitives")
_PRIM_ID = "coder.vite.design-primitives"


def test_discover_includes_primitives_slice() -> None:
    ids = {i.implementation_id for i in discover_mod.discover_implementations(_IMPLS)}
    assert _PRIM_ID in ids


@requires_node
def test_primitives_clean_yields_no_violations() -> None:
    # Composed from <Input>/<Button> design-system primitives — no raw HTML element.
    res = run_mod.run_implementation(_PRIM_ID, _PRIM_DETECTOR, scan_roots=[str(_PRIM_CLEAN)], exclude_globs=[])
    assert res.ran
    assert res.structured is True
    assert res.violations == []


@requires_node
def test_primitives_dirty_yields_one_raw_v11_violation() -> None:
    res = run_mod.run_implementation(_PRIM_ID, _PRIM_DETECTOR, scan_roots=[str(_PRIM_DIRTY)], exclude_globs=[])
    assert res.structured is True
    assert len(res.violations) == 1
    v = res.violations[0]
    assert set(v) >= _KEYS
    assert v["rule_id"] == _PRIM_ID
    assert v["file"].endswith("SignupForm.tsx")
    assert "<button" in v["source_line"]


@requires_node
def test_primitives_emits_raw_not_disposition() -> None:
    res = run_mod.run_implementation(_PRIM_ID, _PRIM_DETECTOR, scan_roots=[str(_PRIM_DIRTY)], exclude_globs=[])
    assert res.passed is True
    assert res.exit_code == 0
    assert res.violations


# --- design-token-color -----------------------------------------------------
_TCOLOR_DETECTOR, _TCOLOR_CLEAN, _TCOLOR_DIRTY = _impl("vite_design_token_color")
_TCOLOR_ID = "coder.vite.design-token-color"


def test_discover_includes_token_color_slice() -> None:
    ids = {i.implementation_id for i in discover_mod.discover_implementations(_IMPLS)}
    assert _TCOLOR_ID in ids


@requires_node
def test_token_color_clean_yields_no_violations() -> None:
    # color: colors.accent (token ref) + backgroundColor: 'transparent' (keyword) -> 0.
    res = run_mod.run_implementation(_TCOLOR_ID, _TCOLOR_DETECTOR, scan_roots=[str(_TCOLOR_CLEAN)], exclude_globs=[])
    assert res.ran
    assert res.structured is True
    assert res.violations == []


@requires_node
def test_token_color_dirty_yields_one_raw_v11_violation() -> None:
    res = run_mod.run_implementation(_TCOLOR_ID, _TCOLOR_DETECTOR, scan_roots=[str(_TCOLOR_DIRTY)], exclude_globs=[])
    assert res.structured is True
    assert len(res.violations) == 1
    v = res.violations[0]
    assert set(v) >= _KEYS
    assert v["rule_id"] == _TCOLOR_ID
    assert v["file"].endswith("Pill.tsx")
    assert "tomato" in v["source_line"]


@requires_node
def test_token_color_emits_raw_not_disposition() -> None:
    res = run_mod.run_implementation(_TCOLOR_ID, _TCOLOR_DETECTOR, scan_roots=[str(_TCOLOR_DIRTY)], exclude_globs=[])
    assert res.passed is True
    assert res.exit_code == 0
    assert res.violations


# --- design-token-hardcoded -------------------------------------------------
_THARD_DETECTOR, _THARD_CLEAN, _THARD_DIRTY = _impl("vite_design_token_hardcoded")
_THARD_ID = "coder.vite.design-token-hardcoded"


def test_discover_includes_token_hardcoded_slice() -> None:
    ids = {i.implementation_id for i in discover_mod.discover_implementations(_IMPLS)}
    assert _THARD_ID in ids


def test_discover_returns_all_five_wv1_slices() -> None:
    ids = {i.implementation_id for i in discover_mod.discover_implementations(_IMPLS)}
    assert {_HTTP_ID, _ORPHAN_ID, _PRIM_ID, _TCOLOR_ID, _THARD_ID} <= ids


@requires_node
def test_token_hardcoded_clean_yields_no_violations() -> None:
    # var(--token) refs + tolerated #fff neutral -> 0.
    res = run_mod.run_implementation(_THARD_ID, _THARD_DETECTOR, scan_roots=[str(_THARD_CLEAN)], exclude_globs=[])
    assert res.ran
    assert res.structured is True
    assert res.violations == []


@requires_node
def test_token_hardcoded_dirty_yields_one_raw_v11_violation() -> None:
    res = run_mod.run_implementation(_THARD_ID, _THARD_DETECTOR, scan_roots=[str(_THARD_DIRTY)], exclude_globs=[])
    assert res.structured is True
    assert len(res.violations) == 1
    v = res.violations[0]
    assert set(v) >= _KEYS
    assert v["rule_id"] == _THARD_ID
    assert v["file"].endswith("card.css")
    assert "#3a7bd5" in v["source_line"]


@requires_node
def test_token_hardcoded_emits_raw_not_disposition() -> None:
    res = run_mod.run_implementation(_THARD_ID, _THARD_DETECTOR, scan_roots=[str(_THARD_DIRTY)], exclude_globs=[])
    assert res.passed is True
    assert res.exit_code == 0
    assert res.violations
