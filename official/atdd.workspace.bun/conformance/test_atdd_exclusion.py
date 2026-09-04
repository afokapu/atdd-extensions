"""The consumer's vendored substrate is never counted as consumer violations.

Ported from frontend.workspace.runtime/conformance/test_atdd_exclusion.py, which
documents the incident this guards: installing these extensions into a consumer drops
the packages — WITH their deliberately-dirty fixtures — under the consumer's
``.atdd/workspaces/**`` and ``.atdd/extensions/**``. When ``atdd enforce`` then scans
the repo root, nothing excludes them, so the extensions' OWN fixtures are reported as
the consumer's violations. In one trial that was 1731 of 2204 findings — 78% pure
noise, all sourced from ``.atdd/``.

The fix is CENTRAL, not per-detector: ``adapter/run.py`` and ``cli/scan.py`` both
merge ``ALWAYS_EXCLUDE`` into ``ATDD_SCAN_EXCLUDES``, and every detector inherits it
because they segment-match their excludes. This provider carried that code from the
first commit and never tested it.

The scan root below holds BOTH a normal dirty file AND a copy of the same dirt under
``.atdd/workspaces/``, so a passing test proves the exclusion is doing the work
rather than the tree simply being empty.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

_WS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_WS / "adapter"))

import run as run_mod  # noqa: E402

_CLI = _WS / "cli" / "scan.py"
_IMPL = _WS / "implementations" / "bun_security_hygiene_detector"
_DETECTOR = _IMPL / "detect.mjs"

requires_bun = pytest.mark.skipif(shutil.which("bun") is None, reason="bun not on PATH")

# A file that fires coder.bun.security-hardcoded-secret — short, unambiguous, and
# from a family with no cross-file checks, so the count is exactly attributable.
_DIRT = 'export const awsKey = "AKIAIOSFODNN7EXAMPLE";\n'


def _tree(tmp_path: Path) -> Path:
    root = tmp_path / "consumer"
    (root / "src").mkdir(parents=True)
    (root / "src" / "config.ts").write_text(_DIRT)
    # the vendored substrate, exactly as `atdd substrate add` lays it down
    vendored = root / ".atdd" / "workspaces" / "atdd.workspace.bun" / "0.1.0" / "fixtures"
    vendored.mkdir(parents=True)
    (vendored / "secrets.ts").write_text(_DIRT)
    ext = root / ".atdd" / "extensions" / "atdd.extension.coder.htmx" / "0.1.0"
    ext.mkdir(parents=True)
    (ext / "sample.ts").write_text(_DIRT)
    return root


@requires_bun
def test_adapter_path_excludes_vendored_substrate(tmp_path: Path) -> None:
    root = _tree(tmp_path)
    res = run_mod.run_implementation(
        _IMPL.name, _DETECTOR, scan_roots=[str(root)], exclude_globs=[]
    )
    files = {Path(v["file"]).name for v in res.violations}
    assert files == {"config.ts"}, f"vendored substrate leaked into the report: {files}"


@requires_bun
def test_cli_path_excludes_vendored_substrate(tmp_path: Path) -> None:
    """The CLI is a separate chokepoint from the adapter and re-asserts the same
    invariant; a fix applied to only one of them would pass the other test."""
    root = _tree(tmp_path)
    env = {**os.environ, "ATDD_SCAN_ROOTS": json.dumps([str(root)])}
    proc = subprocess.run(
        [sys.executable, str(_CLI), "--impl", _IMPL.name],
        capture_output=True, text=True, env=env,
    )
    assert proc.returncode == 0, proc.stderr
    files = {Path(v["file"]).name for v in json.loads(proc.stdout)}
    assert files == {"config.ts"}, f"vendored substrate leaked through the CLI: {files}"


@requires_bun
def test_consumer_own_atdd_config_stays_visible(tmp_path: Path) -> None:
    """Only the two INSTALL directories are excluded, not all of ``.atdd/``.

    A consumer's own ``.atdd/config.yaml`` is legitimate scan input for
    config-reading detectors, so excluding the whole directory would break them.
    This pins the narrower exclusion the adapter actually implements.
    """
    assert run_mod.ALWAYS_EXCLUDE == (".atdd/workspaces", ".atdd/extensions")
    assert not any(ex == ".atdd" for ex in run_mod.ALWAYS_EXCLUDE)
