"""Conformance: the design detectors NO-OP when there is no design layer.

vite_design_system_detector (primitives / token-color / token-hardcoded /
orphan-ui) and vite_design_hierarchy_detector (dependency-flow / tokens-pure /
wagons-import) PRESUPPOSE a design system. On a consumer with real component code
but no design layer at all (the FRG case — apps/game/src, apps/web/src have no
design_system/ or design/ layer), firing them is a false positive. Like the
train-e2e / interlocking detectors that no-op when their plan registry is absent,
these detectors must write an empty report and exit 0 when no design layer exists.

Each `fixtures/no_design_layer/` tree deliberately contains code that WOULD fire
(a raw <button>, a hardcoded color literal, an orphan component) to prove the zero
count comes from the out-of-scope no-op, not from clean code. The dirty fixtures —
which carry a design-layer marker (or live under design_system/) — keep firing
(see test_families.py / test_W7.py).
"""
from __future__ import annotations
import sys
from pathlib import Path

import pytest

_WS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_WS / "adapter"))
import run as run_mod  # noqa: E402

_IMPLS = ["vite_design_system_detector", "vite_design_hierarchy_detector"]


def _run(impl_name: str, root: Path):
    impl = _WS / "implementations" / impl_name
    return run_mod.run_implementation(impl.name, impl / "detect.mjs",
                                      scan_roots=[str(root)], exclude_globs=[])


@pytest.mark.parametrize("impl_name", _IMPLS)
def test_no_design_layer_yields_zero_violations(impl_name: str) -> None:
    root = _WS / "implementations" / impl_name / "fixtures" / "no_design_layer"
    res = _run(impl_name, root)
    assert res.ran and res.structured, f"{impl_name} did not run / emit a structured report"
    assert res.violations == [], f"{impl_name}: expected out-of-scope no-op, got {res.violations!r}"


@pytest.mark.parametrize("impl_name", _IMPLS)
def test_no_design_layer_fixture_has_no_design_marker(impl_name: str) -> None:
    root = _WS / "implementations" / impl_name / "fixtures" / "no_design_layer"
    for p in root.rglob("*"):
        assert p.name not in {"design", "design_system", "design-system", "tokens", "foundations"}, p
