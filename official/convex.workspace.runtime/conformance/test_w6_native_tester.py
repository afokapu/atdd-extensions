"""Conformance suite for Worker W6 — Convex-NATIVE coder nodes + tester migration.

Five detectors, all run through the SAME convex.workspace.runtime adapter
(`discover` / `run`) the other conformance suites use, proving each obeys the v1.1
contract: discovery returns it as a contract-compatible implementation targeting
this workspace, and a run produces RAW v1.1 structured violations through the env +
JSON-report seam (a clean fixture → 0; a dirty fixture → the expected count). Four
are NATIVE Convex coder rules (no Core sibling); the fifth adapts Core's
`tester.migration.naming` to Convex's `convex/migrations/**` TypeScript migrations.

  * coder.convex.api-no-underscore-dir   — exported query/mutation/action under an
                                           `_`-prefixed dir (off the API surface).
  * coder.convex.layer-naming            — a feature module not named after a layer
                                           (api/application/domain/integration.ts).
  * coder.convex.domain-no-convex-import — a domain module importing convex/*,
                                           ./_generated, or referencing `ctx`.
  * coder.convex.feature-layout-promotion— a single-file layer > 150 lines OR > 3
                                           exported entities (should become a dir).
  * tester.convex.migration-naming       — a convex/migrations/** file whose name is
                                           not deterministically derived from its id.

Run-health (exit 0) is NOT a verdict — a dirty scan still exits 0 / passed=True.
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

_IMPLS = _WS / "implementations"

requires_node = pytest.mark.skipif(shutil.which("node") is None, reason="node not on PATH")


def _slice(dir_name: str):
    d = _IMPLS / dir_name
    return d / "detect.mjs", d / "fixtures" / "clean", d / "fixtures" / "dirty"


# --- coder.convex.api-no-underscore-dir -------------------------------------
_API_DETECTOR, _API_CLEAN, _API_DIRTY = _slice("convex_api_no_underscore_dir")
_API_ID = "coder.convex.api-no-underscore-dir"


def test_api_no_underscore_dir_is_discovered() -> None:
    impls = discover_mod.discover_implementations(_IMPLS)
    by_id = {i.implementation_id: i for i in impls}
    assert _API_ID in by_id, f"{_API_ID} not discovered among {sorted(by_id)}"
    assert by_id[_API_ID].targets_workspace == "convex.workspace.runtime"
    assert by_id[_API_ID].contract_version == "1.1.0"


@requires_node
def test_api_no_underscore_dir_clean_yields_no_violations() -> None:
    res = run_mod.run_implementation(_API_ID, _API_DETECTOR, scan_roots=[str(_API_CLEAN)], exclude_globs=[])
    assert res.ran
    assert res.structured is True
    assert res.violations == []


@requires_node
def test_api_no_underscore_dir_dirty_yields_one_raw_v11_violation() -> None:
    res = run_mod.run_implementation(_API_ID, _API_DETECTOR, scan_roots=[str(_API_DIRTY)], exclude_globs=[])
    assert res.structured is True
    assert len(res.violations) == 1
    v = res.violations[0]
    assert set(v) >= {"rule_id", "file", "line", "col", "evidence", "source_line"}
    assert v["rule_id"] == _API_ID
    assert "_internal" in v["file"]
    assert "secretMutation" in v["evidence"]


@requires_node
def test_api_no_underscore_dir_emits_raw_not_disposition() -> None:
    res = run_mod.run_implementation(_API_ID, _API_DETECTOR, scan_roots=[str(_API_DIRTY)], exclude_globs=[])
    assert res.passed is True
    assert res.exit_code == 0
    assert res.violations  # the strict verdict is the downstream consumer's job


# --- coder.convex.layer-naming ----------------------------------------------
_LAYER_DETECTOR, _LAYER_CLEAN, _LAYER_DIRTY = _slice("convex_layer_naming")
_LAYER_ID = "coder.convex.layer-naming"


def test_layer_naming_is_discovered() -> None:
    impls = discover_mod.discover_implementations(_IMPLS)
    by_id = {i.implementation_id: i for i in impls}
    assert _LAYER_ID in by_id, f"{_LAYER_ID} not discovered among {sorted(by_id)}"
    assert by_id[_LAYER_ID].targets_workspace == "convex.workspace.runtime"
    assert by_id[_LAYER_ID].contract_version == "1.1.0"


@requires_node
def test_layer_naming_clean_yields_no_violations() -> None:
    # api.ts + domain.ts (layer files) + wagon.ts (structural) — all legitimate.
    res = run_mod.run_implementation(_LAYER_ID, _LAYER_DETECTOR, scan_roots=[str(_LAYER_CLEAN)], exclude_globs=[])
    assert res.ran
    assert res.structured is True
    assert res.violations == []


@requires_node
def test_layer_naming_dirty_yields_one_raw_v11_violation() -> None:
    # A feature dir with a correct domain.ts AND a mis-named helpers.ts — only the
    # latter is flagged (selectivity), at line/col 1 with the basename as source.
    res = run_mod.run_implementation(_LAYER_ID, _LAYER_DETECTOR, scan_roots=[str(_LAYER_DIRTY)], exclude_globs=[])
    assert res.structured is True
    assert len(res.violations) == 1
    v = res.violations[0]
    assert set(v) >= {"rule_id", "file", "line", "col", "evidence", "source_line"}
    assert v["rule_id"] == _LAYER_ID
    assert v["line"] == 1
    assert v["col"] == 1
    assert v["source_line"] == "helpers.ts"


@requires_node
def test_layer_naming_emits_raw_not_disposition() -> None:
    res = run_mod.run_implementation(_LAYER_ID, _LAYER_DETECTOR, scan_roots=[str(_LAYER_DIRTY)], exclude_globs=[])
    assert res.passed is True
    assert res.exit_code == 0
    assert res.violations  # the suppress-and-clean verdict is the downstream consumer's job


# --- coder.convex.domain-no-convex-import -----------------------------------
_DOMAIN_DETECTOR, _DOMAIN_CLEAN, _DOMAIN_DIRTY = _slice("convex_domain_no_convex_import")
_DOMAIN_ID = "coder.convex.domain-no-convex-import"


def test_domain_no_convex_import_is_discovered() -> None:
    impls = discover_mod.discover_implementations(_IMPLS)
    by_id = {i.implementation_id: i for i in impls}
    assert _DOMAIN_ID in by_id, f"{_DOMAIN_ID} not discovered among {sorted(by_id)}"
    assert by_id[_DOMAIN_ID].targets_workspace == "convex.workspace.runtime"
    assert by_id[_DOMAIN_ID].contract_version == "1.1.0"


@requires_node
def test_domain_no_convex_import_clean_yields_no_violations() -> None:
    # A pure domain.ts: no convex/* import, no _generated, no ctx.
    res = run_mod.run_implementation(_DOMAIN_ID, _DOMAIN_DETECTOR, scan_roots=[str(_DOMAIN_CLEAN)], exclude_globs=[])
    assert res.ran
    assert res.structured is True
    assert res.violations == []


@requires_node
def test_domain_no_convex_import_dirty_yields_three_raw_v11_violations() -> None:
    # Three distinct leaks, one per line: a convex/* import, a _generated import,
    # and a ctx reference — proving all three detector branches fire.
    res = run_mod.run_implementation(_DOMAIN_ID, _DOMAIN_DETECTOR, scan_roots=[str(_DOMAIN_DIRTY)], exclude_globs=[])
    assert res.structured is True
    assert len(res.violations) == 3
    for v in res.violations:
        assert set(v) >= {"rule_id", "file", "line", "col", "evidence", "source_line"}
        assert v["rule_id"] == _DOMAIN_ID
        assert v["file"].endswith("domain.ts")
    joined = " ".join(v["evidence"] for v in res.violations)
    assert "convex/*" in joined
    assert "_generated" in joined
    assert "ctx" in joined


@requires_node
def test_domain_no_convex_import_emits_raw_not_disposition() -> None:
    res = run_mod.run_implementation(_DOMAIN_ID, _DOMAIN_DETECTOR, scan_roots=[str(_DOMAIN_DIRTY)], exclude_globs=[])
    assert res.passed is True
    assert res.exit_code == 0
    assert res.violations  # the strict verdict is the downstream consumer's job


# --- coder.convex.feature-layout-promotion ----------------------------------
_PROMO_DETECTOR, _PROMO_CLEAN, _PROMO_DIRTY = _slice("convex_feature_layout_promotion")
_PROMO_ID = "coder.convex.feature-layout-promotion"


def test_feature_layout_promotion_is_discovered() -> None:
    impls = discover_mod.discover_implementations(_IMPLS)
    by_id = {i.implementation_id: i for i in impls}
    assert _PROMO_ID in by_id, f"{_PROMO_ID} not discovered among {sorted(by_id)}"
    assert by_id[_PROMO_ID].targets_workspace == "convex.workspace.runtime"
    assert by_id[_PROMO_ID].contract_version == "1.1.0"


@requires_node
def test_feature_layout_promotion_clean_yields_no_violations() -> None:
    # A domain.ts with 3 exported entities, well under 150 lines — under both bounds.
    res = run_mod.run_implementation(_PROMO_ID, _PROMO_DETECTOR, scan_roots=[str(_PROMO_CLEAN)], exclude_globs=[])
    assert res.ran
    assert res.structured is True
    assert res.violations == []


@requires_node
def test_feature_layout_promotion_dirty_yields_one_raw_v11_violation() -> None:
    # A domain.ts with 4 exported entities (> 3) — over the export threshold.
    res = run_mod.run_implementation(_PROMO_ID, _PROMO_DETECTOR, scan_roots=[str(_PROMO_DIRTY)], exclude_globs=[])
    assert res.structured is True
    assert len(res.violations) == 1
    v = res.violations[0]
    assert set(v) >= {"rule_id", "file", "line", "col", "evidence", "source_line"}
    assert v["rule_id"] == _PROMO_ID
    assert v["source_line"] == "domain.ts"
    assert "exported entities" in v["evidence"]


@requires_node
def test_feature_layout_promotion_emits_raw_not_disposition() -> None:
    res = run_mod.run_implementation(_PROMO_ID, _PROMO_DETECTOR, scan_roots=[str(_PROMO_DIRTY)], exclude_globs=[])
    assert res.passed is True
    assert res.exit_code == 0
    assert res.violations  # the advisory verdict is the downstream consumer's job


# --- tester.convex.migration-naming -----------------------------------------
_MIG_DETECTOR, _MIG_CLEAN, _MIG_DIRTY = _slice("convex_test_migration_naming")
_MIG_ID = "tester.convex.migration-naming"


def test_migration_naming_is_discovered() -> None:
    impls = discover_mod.discover_implementations(_IMPLS)
    by_id = {i.implementation_id: i for i in impls}
    assert _MIG_ID in by_id, f"{_MIG_ID} not discovered among {sorted(by_id)}"
    assert by_id[_MIG_ID].targets_workspace == "convex.workspace.runtime"
    assert by_id[_MIG_ID].contract_version == "1.1.0"


@requires_node
def test_migration_naming_clean_yields_no_violations() -> None:
    # migrations/backfill_matches.ts exports backfillMatches — stem is the
    # snake_case of the id, so it is derivable.
    res = run_mod.run_implementation(_MIG_ID, _MIG_DETECTOR, scan_roots=[str(_MIG_CLEAN)], exclude_globs=[])
    assert res.ran
    assert res.structured is True
    assert res.violations == []


@requires_node
def test_migration_naming_dirty_yields_one_raw_v11_violation() -> None:
    # migrations/fix-stuff.ts exports fixStuff (id fix_stuff) — kebab stem is not
    # the snake_case rendering, so the file<->id mapping is broken.
    res = run_mod.run_implementation(_MIG_ID, _MIG_DETECTOR, scan_roots=[str(_MIG_DIRTY)], exclude_globs=[])
    assert res.structured is True
    assert len(res.violations) == 1
    v = res.violations[0]
    assert set(v) >= {"rule_id", "file", "line", "col", "evidence", "source_line"}
    assert v["rule_id"] == _MIG_ID
    assert v["line"] == 1
    assert v["col"] == 1
    assert v["source_line"] == "fix-stuff.ts"
    assert "fix_stuff.ts" in v["evidence"]


@requires_node
def test_migration_naming_emits_raw_not_disposition() -> None:
    res = run_mod.run_implementation(_MIG_ID, _MIG_DETECTOR, scan_roots=[str(_MIG_DIRTY)], exclude_globs=[])
    assert res.passed is True
    assert res.exit_code == 0
    assert res.violations  # the documentation-only verdict is the downstream consumer's job
