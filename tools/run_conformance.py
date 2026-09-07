#!/usr/bin/env python3
"""Run EVERY package's conformance suite, and refuse to pass when one was unrunnable.

CI ran two of the nine conformance suites in the hub. The other seven were green
locally and invisible in CI, so the guards they contain — including the staged-rule
guard that exists to catch a coder rule shipped in a tester family — certified
nothing. This tool closes that by discovering the suites instead of listing them,
so a package added tomorrow is covered without anyone remembering to edit CI.

Two details are load-bearing:

1. Each suite runs as its OWN pytest process. The conformance directories share
   test-file basenames (test_provider_contract.py, test_families.py, ...) and carry
   no __init__.py, so a single `pytest official/*/conformance` collides on module
   names and collects nothing. That collision is why CI hardcoded two suites; it is
   not a reason to keep hardcoding them.

2. Not every skip is equal, and collapsing them is the defect this tool guards.
   A skeleton adapter has nothing to check — NOT_APPLICABLE, and fine. A missing
   `bun` means the check could not run at all — COULD_NOT_CHECK, and in the job
   built to run it that is a failure, not a pass. Green over an unrun suite is
   exactly the outcome this file exists to prevent.

    python3 tools/run_conformance.py            # run all; non-zero on failure or COULD_NOT_CHECK
    python3 tools/run_conformance.py --list     # show what would run, run nothing
"""
from __future__ import annotations

import argparse
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

HUB = Path(__file__).resolve().parent.parent

# A skip meaning "the environment could not run this check". In the job built to
# run these suites, each of these is a failure: the check did not happen.
UNRUNNABLE = (
    "not on PATH",
    "core not importable",
    "installed core ships no",
)

SKIP_LINE = re.compile(r"^SKIPPED \[(\d+)\] (.+?): (.*)$")
COUNTS = re.compile(r"(\d+) (passed|failed|skipped|error|errors)")


def discover() -> list[Path]:
    """Conformance directories that actually contain tests.

    A directory holding only a README (atdd.workspace.git-worktree) is not a suite:
    pytest exits 5 on it, which would read as a failure and teach everyone to
    ignore this tool.
    """
    return sorted(
        d for d in HUB.glob("official/*/conformance")
        if d.is_dir() and any(d.glob("test_*.py"))
    )


def run(suite: Path) -> tuple[int, str, list[tuple[int, str]], str]:
    """Run one suite. Returns (exit code, summary line, [(count, reason), ...], output)."""
    proc = subprocess.run(
        [sys.executable, "-m", "pytest", str(suite), "-q", "-rs"],
        capture_output=True, text=True, cwd=HUB,
    )
    out = proc.stdout + proc.stderr
    skips = [
        (int(m.group(1)), m.group(3).strip())
        for line in out.splitlines()
        if (m := SKIP_LINE.match(line))
    ]
    summary = next(
        (ln.strip() for ln in reversed(out.splitlines()) if COUNTS.search(ln)),
        "no summary",
    )
    return proc.returncode, summary, skips, out


def unrunnable(reason: str) -> bool:
    return any(marker in reason for marker in UNRUNNABLE)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--list", action="store_true",
                    help="print the discovered suites and exit")
    args = ap.parse_args()

    suites = discover()
    if not suites:
        print("no conformance suites discovered — that is itself the bug", file=sys.stderr)
        return 1
    if args.list:
        for s in suites:
            print(f"  {s.parent.name}")
        return 0

    failed: list[str] = []
    blind: Counter[str] = Counter()

    for suite in suites:
        pkg = suite.parent.name
        code, summary, skips, out = run(suite)
        print(f"\n{pkg}\n  {summary}")
        for count, reason in skips:
            verdict = "COULD_NOT_CHECK" if unrunnable(reason) else "NOT_APPLICABLE"
            print(f"  {verdict:15s} x{count}  {reason}")
            if unrunnable(reason):
                blind[f"{pkg}: {reason}"] += count
        if code != 0:
            failed.append(pkg)
            # A CI tool that reports a failure without saying which test failed
            # sends the reader back to reproduce it by hand. Print what pytest
            # said, so the log is the diagnosis.
            print(f"  --- {pkg} pytest output ---")
            for line in out.splitlines():
                print(f"  | {line}")

    print(f"\n{'=' * 66}")
    print(f"{len(suites)} conformance suite(s) run")

    if failed:
        print(f"\nFAILED: {', '.join(failed)}", file=sys.stderr)
    if blind:
        print("\nUNRUN — the environment could not perform these checks, so this job "
              "proves nothing about them:", file=sys.stderr)
        for entry, count in sorted(blind.items()):
            print(f"  - {entry}  (x{count} test(s))", file=sys.stderr)
        print("\nInstall the missing tool in the job rather than accepting the skip.",
              file=sys.stderr)
    if failed or blind:
        return 1
    print("all suites ran, and none was skipped for want of its environment")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
