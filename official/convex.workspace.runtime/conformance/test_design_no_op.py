"""Conformance: convex_design_detector NO-OPS when there is no design layer.

The convex design-system rules (foundations / hierarchy-import / orphan-export)
PRESUPPOSE a design system. On a consumer with real feature code but no design
layer at all (the FRG case — apps/game/convex has domain/application/presentation
slices but no `design/` layer), firing them is a false positive. Like the
train-e2e / interlocking detectors that no-op when their plan registry is absent,
the design detector must write an empty report and exit 0 when no design layer is
present.

The `fixtures/no_design_layer/` tree deliberately contains code that WOULD fire
(an upper layer with no domain.ts foundation; an orphan export) to prove the zero
count comes from the out-of-scope no-op, not from clean code. The dirty fixtures —
which DO carry a design-layer marker — keep firing (see test_families.py).
"""
from __future__ import annotations
import sys
from pathlib import Path

_WS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_WS / "adapter"))
import run as run_mod  # noqa: E402

_IMPL = _WS / "implementations" / "convex_design_detector"
_NO_DESIGN = _IMPL / "fixtures" / "no_design_layer"


def _run(root: Path):
    return run_mod.run_implementation(_IMPL.name, _IMPL / "detect.mjs",
                                      scan_roots=[str(root)], exclude_globs=[])


def test_no_design_layer_yields_zero_violations() -> None:
    res = _run(_NO_DESIGN)
    assert res.ran and res.structured, "detector did not run / emit a structured report"
    assert res.violations == [], f"expected out-of-scope no-op, got {res.violations!r}"


def test_no_design_layer_fixture_has_no_design_marker() -> None:
    # Guard the premise: the fixture must genuinely lack any design layer, else the
    # zero above would be meaningless. No design/design_system dir, no token file.
    for p in _NO_DESIGN.rglob("*"):
        assert p.name not in {"design", "design_system", "design-system", "tokens", "foundations"}, p
