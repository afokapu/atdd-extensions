"""Detector self-scoping conformance (defense-in-depth to the consumer scope map).

FRG's frontend workspace serves BOTH a Vite app (`.tsx`) and an Astro app (`.astro`
+ `.tsx` islands). Detectors must key on their own stack's file signatures so they do
not cross-contaminate a sibling app:

  * ASTRO detectors file-signature-GATE on `.astro`: over a tree with NO `.astro` file
    (a pure Vite app) they NO-OP — even when that tree holds `.tsx`/`.css` the detector
    would otherwise flag. The guard is CAUSAL: dropping a single benign `.astro` marker
    into the same tree makes the detector fire, proving the no-op is the signature guard
    and not merely an absence of matchable content.
  * VITE detectors SKIP `.astro` files: over an `.astro`-only tree they NO-OP — even when
    that `.astro` holds sink text a Vite pattern would match — because an Astro-stack
    artifact must never be linted by a Vite React rule.

The `.tsx`-in-both-apps residue is NOT tested here: a file-signature guard cannot
separate a Vite `.tsx` from an Astro-island `.tsx`, and eliminating that leakage is the
consumer scope map's job (documented in each detector header), not this guard's. These
tests only pin the leakage that IS decidable from file signatures.

Requires `node` on PATH (the provider's run command). Fixtures live under each
detector's `fixtures/noop_signature/` (a name the family suite's dirty/clean walk
ignores).
"""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

import pytest

_WS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_WS / "adapter"))
import run as run_mod  # noqa: E402

_IMPLS = _WS / "implementations"
requires_node = pytest.mark.skipif(shutil.which("node") is None, reason="node not on PATH")

# Benign Astro component: a `.astro` file with a frontmatter fence and inert markup.
# It carries NO sink/handler/color of its own, so it adds the `.astro` SIGNATURE to a
# tree without adding a violation — isolating the guard as the only variable.
_ASTRO_MARKER = "---\nconst ok = 1;\n---\n<div>ok</div>\n"


def _count(impl: str, root: Path) -> int:
    r = run_mod.run_implementation(impl, _IMPLS / impl / "detect.mjs",
                                   scan_roots=[str(root)], exclude_globs=[])
    assert r.ran and r.structured, f"{impl} did not run / emit a structured report"
    return len(r.violations)


# Astro detectors whose `noop_signature/` fixture is a signature-ABSENT tree
# (`.tsx`/`.css` only) that WOULD trip the detector if it did not self-scope.
_ASTRO_DETECTORS = [
    "astro_security_xss",
    "astro_logging_silent_swallow",
    "astro_hardcoded_literal_detector",
]

# Vite detectors whose `noop_signature/` fixture is an `.astro`-only tree holding sink
# text a Vite pattern would match — proving the detector skips `.astro` outright.
_VITE_DETECTORS = [
    "vite_security_xss",
    "vite_logging_silent_swallow",
]


@requires_node
@pytest.mark.parametrize("impl", _ASTRO_DETECTORS)
def test_astro_detector_no_ops_without_astro_signature(impl: str) -> None:
    root = _IMPLS / impl / "fixtures" / "noop_signature"
    assert root.is_dir(), f"missing no-op fixture for {impl}"
    assert _count(impl, root) == 0, (
        f"{impl} fired on a tree with NO .astro file — file-signature guard failed"
    )


@requires_node
@pytest.mark.parametrize("impl", _ASTRO_DETECTORS)
def test_astro_no_op_is_causal_marker_reactivates(impl: str, tmp_path: Path) -> None:
    """Adding one benign `.astro` marker to the SAME tree makes the detector fire,
    proving the no-op was the signature guard, not an absence of matchable content."""
    src = _IMPLS / impl / "fixtures" / "noop_signature"
    tree = tmp_path / "tree"
    shutil.copytree(src, tree)
    assert _count(impl, tree) == 0  # no `.astro` yet → gated off
    (tree / "Marker.astro").write_text(_ASTRO_MARKER)
    assert _count(impl, tree) > 0, (
        f"{impl} stayed silent after an .astro marker was added — the no-op is not the "
        f"signature guard (fixture content may not actually be matchable)"
    )


@requires_node
@pytest.mark.parametrize("impl", _VITE_DETECTORS)
def test_vite_detector_skips_astro_files(impl: str) -> None:
    root = _IMPLS / impl / "fixtures" / "noop_signature"
    assert root.is_dir(), f"missing no-op fixture for {impl}"
    assert _count(impl, root) == 0, (
        f"{impl} linted an .astro file — a Vite React detector must skip the Astro stack"
    )


@requires_node
@pytest.mark.parametrize("impl", _ASTRO_DETECTORS + _VITE_DETECTORS)
def test_home_dirty_fixture_still_fires(impl: str) -> None:
    """Regression guard: self-scoping must not silence a detector on its own stack's
    home fixture (an `.astro` app for Astro rules, a `.tsx` app for Vite rules)."""
    dirty = _IMPLS / impl / "fixtures" / "dirty"
    assert _count(impl, dirty) >= 1, f"{impl} no longer fires on its home dirty fixture"
