"""Regression: the provider scan ALWAYS excludes the consumer's ``.atdd/`` substrate.

Installing these extensions into a consumer repo drops the packages — with their
deliberately-dirty test fixtures — under the consumer's ``.atdd/workspaces/**`` and
``.atdd/extensions/**``. When ``atdd enforce`` then scans the repo root, nothing
excludes ``.atdd/``, so the extensions' OWN fixtures get counted as CONSUMER
violations. In one FRG trial this was 1731 of 2204 violations (78%) — all noise
sourced from ``.atdd/``.

The fix is central (not per-detector): ``cli/scan.py._exclude_globs`` and
``adapter/run.py.run_implementation`` always merge ``.atdd`` into
``ATDD_SCAN_EXCLUDES``; every detector inherits it (they segment-match excludes).

These tests build a scan root containing BOTH a normal dirty source file AND an
IDENTICALLY-dirty twin nested under ``.atdd/workspaces/x/fixtures/dirty/`` — then
prove ZERO violations are sourced from any ``.atdd/`` path while the normal file
still fires. The twin is genuinely dirty (same bytes as the file that fires), so a
clean scan of it can only mean it was excluded, not that it was benign.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

_WS = Path(__file__).resolve().parent.parent  # convex.workspace.runtime/
sys.path.insert(0, str(_WS / "adapter"))

import run as run_mod  # noqa: E402

_CLI = _WS / "cli" / "scan.py"
_IMPL_DIR = _WS / "implementations" / "convex_no_server_console_log"
_DETECTOR = _IMPL_DIR / "detect.mjs"
_IMPL_ID = "coder.convex.no-server-console-log"

requires_node = pytest.mark.skipif(shutil.which("node") is None, reason="node not on PATH")

# A Convex server file with a bare console.log — the detector flags exactly this.
_DIRTY_SRC = (
    "import { mutation } from \"./_generated/server\";\n"
    "export const charge = mutation({\n"
    "  handler: async (ctx, { userId }) => {\n"
    "    console.log(\"charging\", userId);\n"
    "  },\n"
    "});\n"
)


def _build_polluted_root(base: Path) -> Path:
    """A scan root with a normal dirty file AND an identical twin under ``.atdd/``."""
    root = base / "consumer_repo"
    # Normal consumer source — SHOULD fire.
    normal = root / "convex" / "payments.ts"
    normal.parent.mkdir(parents=True)
    normal.write_text(_DIRTY_SRC, encoding="utf-8")
    # The installed-extension substrate: an identically-dirty fixture that WOULD
    # fire if scanned. It must NOT be counted.
    twin = root / ".atdd" / "workspaces" / "x" / "fixtures" / "dirty" / "payments.ts"
    twin.parent.mkdir(parents=True)
    twin.write_text(_DIRTY_SRC, encoding="utf-8")
    return root


@requires_node
def test_run_excludes_atdd_substrate_but_still_flags_normal_source(tmp_path: Path) -> None:
    root = _build_polluted_root(tmp_path)
    # exclude_globs=[] on purpose: the always-exclude must hold with NO caller globs.
    res = run_mod.run_implementation(_IMPL_ID, _DETECTOR, scan_roots=[str(root)], exclude_globs=[])
    assert res.structured is True
    assert res.ran

    atdd_sourced = [v for v in res.violations if ".atdd" in v["file"]]
    assert atdd_sourced == [], f"'.atdd/' pollution leaked into the scan: {atdd_sourced}"

    # Sanity: the identical NON-.atdd twin still fires — the scan is not just empty.
    assert res.violations, "expected the normal dirty source to still be flagged"
    assert all(".atdd" not in v["file"] for v in res.violations)
    assert any(v["file"].endswith("convex/payments.ts") for v in res.violations)


@requires_node
def test_run_excludes_atdd_even_alongside_caller_supplied_globs(tmp_path: Path) -> None:
    # Caller globs must be preserved AND .atdd still excluded (merge, not replace).
    root = _build_polluted_root(tmp_path)
    res = run_mod.run_implementation(
        _IMPL_ID, _DETECTOR, scan_roots=[str(root)], exclude_globs=["some_other_dir"]
    )
    assert [v for v in res.violations if ".atdd" in v["file"]] == []
    assert res.violations  # normal source still fires


@requires_node
def test_cli_excludes_atdd_substrate(tmp_path: Path) -> None:
    """The CLI path (``atdd enforce`` subprocesses this) also excludes ``.atdd/``."""
    root = _build_polluted_root(tmp_path)
    env = {**os.environ, "ATDD_SCAN_ROOTS": json.dumps([str(root)]), "ATDD_IMPL_ID": _IMPL_ID}
    proc = subprocess.run(
        [sys.executable, str(_CLI)], capture_output=True, text=True, env=env
    )
    assert proc.returncode == 0, proc.stderr
    violations = json.loads(proc.stdout)
    assert [v for v in violations if ".atdd" in v["file"]] == [], "CLI leaked .atdd pollution"
    assert violations, "CLI scan should still flag the normal dirty source"
