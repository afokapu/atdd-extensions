#!/usr/bin/env python3
"""Phase 0 de-risk proof for convex.workspace.runtime.

Proves the ONE genuinely novel piece — a Python provider adapter driving a JS
detector over the subprocess + env + JSON-report seam — end to end, with NO npm
install and NO ATDD-core import:

  1. discover_implementations() finds the convex detector manifest.
  2. run_implementation() runs the JS detector (node) over a CLEAN fixture
     → structured report, ZERO violations.
  3. run_implementation() runs it over a DIRTY fixture
     → structured report, ONE violation at the console.log site.
  4. (optional) the SAME detector over the real frg-app Convex tree, if present,
     showing it scans real Convex source.

Run:  python3 prove_phase0.py
Exit: 0 = proven, 1 = a proof assertion failed.
"""
from __future__ import annotations

import sys
from pathlib import Path

_WS = Path(__file__).resolve().parent  # convex.workspace.runtime/
sys.path.insert(0, str(_WS / "adapter"))

import discover as discover_mod  # noqa: E402
import run as run_mod  # noqa: E402

_IMPL_DIR = _WS / "implementations" / "convex_no_server_console_log"
_DETECTOR = _IMPL_DIR / "detect.mjs"
_CLEAN = _IMPL_DIR / "fixtures" / "clean"
_DIRTY = _IMPL_DIR / "fixtures" / "dirty"
_IMPL_ID = "coder.convex.no-server-console-log"

# Best-effort real-repo target (skipped cleanly if absent on this machine).
_REAL_CONVEX = Path.home() / "Github" / "frg-app" / "main" / "apps" / "game" / "convex"


def _check(label: str, cond: bool, detail: str = "") -> bool:
    mark = "PASS" if cond else "FAIL"
    print(f"  [{mark}] {label}" + (f"  — {detail}" if detail else ""))
    return cond


def main() -> int:
    ok = True
    print("== convex.workspace.runtime — Phase 0 proof ==\n")

    # 1. discovery
    impls = discover_mod.discover_implementations(_WS / "implementations")
    ids = [i.implementation_id for i in impls]
    ok &= _check("discover finds the convex detector", _IMPL_ID in ids, f"found={ids}")

    # 2. clean fixture → 0 violations, structured channel
    clean = run_mod.run_implementation(
        _IMPL_ID, _DETECTOR, scan_roots=[str(_CLEAN)], exclude_globs=[]
    )
    ok &= _check("clean run executed (run-health)", clean.ran, f"exit={clean.exit_code}")
    ok &= _check("clean run used structured report channel", clean.structured)
    ok &= _check("clean fixture → 0 violations", clean.violations == [], f"{clean.violations}")

    # 3. dirty fixture → exactly 1 violation at the console.log line
    dirty = run_mod.run_implementation(
        _IMPL_ID, _DETECTOR, scan_roots=[str(_DIRTY)], exclude_globs=[]
    )
    ok &= _check("dirty run used structured report channel", dirty.structured)
    ok &= _check("dirty fixture → exactly 1 violation", len(dirty.violations) == 1,
                 f"count={len(dirty.violations)}")
    if dirty.violations:
        v = dirty.violations[0]
        ok &= _check("violation has full v1.1 shape",
                     all(k in v for k in ("rule_id", "file", "line", "col", "evidence", "source_line")),
                     str(v))
        ok &= _check("violation rule_id is correct", v.get("rule_id") == _IMPL_ID)
        ok &= _check("violation points at the console.log line",
                     "console.log" in str(v.get("source_line", "")),
                     f"line {v.get('line')}: {v.get('source_line')!r}")

    # 4. optional real-repo run
    print()
    if _REAL_CONVEX.is_dir():
        real = run_mod.run_implementation(
            _IMPL_ID, _DETECTOR, scan_roots=[str(_REAL_CONVEX)], exclude_globs=[]
        )
        _check(f"real frg-app convex run executed ({_REAL_CONVEX})", real.ran)
        print(f"  [INFO] real Convex tree → {len(real.violations)} console.* violation(s)")
        for v in real.violations[:10]:
            print(f"         {v['file']}:{v['line']}:{v['col']}  {v['source_line']}")
    else:
        print(f"  [SKIP] real frg-app convex tree not found at {_REAL_CONVEX}")

    print("\n== PROVEN ==" if ok else "\n== PROOF FAILED ==")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
