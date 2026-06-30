"""Conformance suite for the WV2 presentation/i18n/gsap vertical slices (contract_version 1.1.0).

REAL (not skipped) tests for the five detectors owned by frontend.extension.vite-coder
and realized by frontend.workspace.runtime implementations (Worker WV2):

  * coder.vite.presentation-gsap-commons   — gsap outside the shared animation-commons module.   (strict)
  * coder.vite.presentation-gsap-layer     — gsap in a non-presentation layer (domain/app/integ). (strict)
  * coder.vite.presentation-i18n-config    — i18n config missing provider/resources wiring.       (strict)
  * coder.vite.presentation-i18n-switcher  — switcher hardcodes a locale string.                  (strict)
  * coder.vite.refactor-coach-ratchet-pres — presentation component gutted to an empty render.    (advisory)

They mirror the patterns in the convex test_coder_slices.py suite: discovery returns
each detector as a contract-compatible implementation targeting this workspace, and a
run produces RAW v1.1 structured violations through the env + JSON-report seam (clean
fixture -> 0, dirty fixture -> exactly 1). Run-health (exit 0) is NOT a verdict — a
dirty scan still exits 0 / passed=True, including the advisory rule. Requires `node`.
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


# Each WV2 node: (snake dir, rule_id, expected dirty-fixture file suffix).
_NODES = {
    "gsap_commons": ("vite_presentation_gsap_commons", "coder.vite.presentation-gsap-commons", "Board.tsx"),
    "gsap_layer": ("vite_presentation_gsap_layer", "coder.vite.presentation-gsap-layer", "useTileState.ts"),
    "i18n_config": ("vite_presentation_i18n_config", "coder.vite.presentation-i18n-config", "i18n.ts"),
    "i18n_switcher": ("vite_presentation_i18n_switcher", "coder.vite.presentation-i18n-switcher", "LocaleSwitcher.tsx"),
    "ratchet_pres": ("vite_refactor_coach_ratchet_pres", "coder.vite.refactor-coach-ratchet-pres", "MatchGrid.tsx"),
}


def _detector(snake: str) -> Path:
    return _IMPLS / snake / "detect.mjs"


def _clean(snake: str) -> Path:
    return _IMPLS / snake / "fixtures" / "clean"


def _dirty(snake: str) -> Path:
    return _IMPLS / snake / "fixtures" / "dirty"


# --- discovery --------------------------------------------------------------
def test_discover_includes_all_five_wv2_slices() -> None:
    impls = discover_mod.discover_implementations(_IMPLS)
    ids = {i.implementation_id for i in impls}
    for _snake, rule_id, _suffix in _NODES.values():
        assert rule_id in ids, f"{rule_id} not discovered"
    for impl in impls:
        assert impl.targets_workspace == "frontend.workspace.runtime"


# --- per-node clean -> 0 violations -----------------------------------------
@requires_node
@pytest.mark.parametrize("key", list(_NODES))
def test_clean_fixture_yields_no_violations(key: str) -> None:
    snake, rule_id, _suffix = _NODES[key]
    res = run_mod.run_implementation(rule_id, _detector(snake), scan_roots=[str(_clean(snake))], exclude_globs=[])
    assert res.ran
    assert res.structured is True
    assert res.violations == [], f"{rule_id}: clean fixture should be quiet, got {res.violations}"


# --- per-node dirty -> exactly 1 RAW v1.1 violation -------------------------
@requires_node
@pytest.mark.parametrize("key", list(_NODES))
def test_dirty_fixture_yields_one_raw_v11_violation(key: str) -> None:
    snake, rule_id, suffix = _NODES[key]
    res = run_mod.run_implementation(rule_id, _detector(snake), scan_roots=[str(_dirty(snake))], exclude_globs=[])
    assert res.structured is True
    assert len(res.violations) == 1, f"{rule_id}: expected 1 violation, got {res.violations}"
    v = res.violations[0]
    assert set(v) >= {"rule_id", "file", "line", "col", "evidence", "source_line"}
    assert v["rule_id"] == rule_id
    assert v["file"].endswith(suffix)
    assert isinstance(v["line"], int) and v["line"] >= 1


# --- per-node RAW, not disposition ------------------------------------------
@requires_node
@pytest.mark.parametrize("key", list(_NODES))
def test_dirty_run_emits_raw_not_disposition(key: str) -> None:
    # run-health (exit 0) is NOT a verdict: a dirty scan still exits 0 / passed=True,
    # including the advisory ratchet rule. The strict/advisory verdict is downstream.
    snake, rule_id, _suffix = _NODES[key]
    res = run_mod.run_implementation(rule_id, _detector(snake), scan_roots=[str(_dirty(snake))], exclude_globs=[])
    assert res.passed is True
    assert res.exit_code == 0
    assert res.violations
