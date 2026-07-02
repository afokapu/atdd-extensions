#!/usr/bin/env python3
"""CW-Phase 0 provider CLI — the SUBPROCESS boundary between ATDD core and the
convex.workspace.runtime provider.

This is the black box core shells out to. It resolves a discovered detector
implementation and runs it over caller-supplied consumer scan roots, then prints
the RAW v1.1 violation list to stdout. The provider applies ZERO disposition; the
verdict is the consumer's job (core ``disposition_gate``).

Sibling of ``atdd.workspace.python-pytest/cli/scan.py`` — the SAME CLI contract.
The only difference is what the provider runs: python-pytest collects a pytest
report test; this JS runtime runs the detector module (a ``.mjs`` file) directly
via ``node`` (the adapter's ``run.py``). Both cross the boundary as one JSON array
of RAW v1.1 violations on stdout.

================================  CLI CONTRACT  ================================

INVOCATION
    python3 scan.py [--impl <implementation_id>] [--impls-root <dir>] [<scan_root> ...]

INPUT
    env ATDD_SCAN_ROOTS     JSON array of path strings — the consumer
                            code-under-inspection roots. Absolute paths are used
                            verbatim (a real consumer repo); relative resolve
                            against the detector's own dir (fixtures). Positional
                            argv roots, if given, OVERRIDE this env var.
    env ATDD_SCAN_EXCLUDES  JSON array of exclusion globs (optional; forwarded to
                            the detector via the adapter).
    env ATDD_IMPL_ID        implementation_id to resolve + run. Default
                            ``coder.convex.no-server-console-log``. ``--impl``
                            overrides.

OUTPUT  (stdout — the ONLY thing that crosses the boundary)
    A single JSON array of RAW v1.1 violation records, each:
        {rule_id, file, line, col, evidence, source_line}
    (PROVIDER-CONTRACT-v1.1.md §3.2). RAW factual channel only — no disposition.

DIAGNOSTICS  (stderr — never pollutes the stdout JSON)
    one ``provider-cli: ...`` run-health line (structured/ran/exit/count).

EXIT CODE
    0   the provider ran and emitted its report (run-health) — NOT a verdict.
    2   resolution / usage error (no scan roots; impl not discoverable; detector
        module missing). stdout stays empty so the consumer's json.loads is safe.

BOUNDARY DISCIPLINE
    Imports ONLY the provider's own adapter (adapter/discover.py + run.py). It
    never imports ATDD core; core never imports this module. Provider-agnostic by
    construction: core knows only "run a CLI, read v1.1 JSON".
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

_WS = Path(__file__).resolve().parent.parent  # convex.workspace.runtime/
sys.path.insert(0, str(_WS / "adapter"))

import yaml  # noqa: E402  (already a hard dep of the adapter's discover.py)

import discover as discover_mod  # noqa: E402
import run as run_mod  # noqa: E402

IMPLS_ROOT = _WS / "implementations"
DEFAULT_IMPL = "coder.convex.no-server-console-log"
# Per-impl manifest field naming the runnable detector module that emits the v1.1
# report (the detector's structured report channel). Resolved from each
# implementation's atdd.implementation.yaml so the CLI runs EVERY bound detector —
# not one hardcoded module. For this JS runtime the runnable and the detector are
# the same ``.mjs`` file (``report:`` == ``entrypoint:``); ``run.py`` executes it
# with ``node`` and reads back ATDD_VIOLATIONS_REPORT.
REPORT_FIELD = "report"


def _scan_roots(argv_roots: list[str]) -> list[str]:
    if argv_roots:
        return list(argv_roots)
    raw = os.environ.get("ATDD_SCAN_ROOTS")
    if not raw:
        return []
    try:
        names = json.loads(raw)
    except json.JSONDecodeError:
        return []
    return [str(n) for n in names] if isinstance(names, list) else []


def _report_module_name(manifest_path: Path) -> str | None:
    """Resolve the impl's declared v1.1 report-emitting module (manifest ``report:``).

    Each implementation declares the runnable detector module that scans
    ``ATDD_SCAN_ROOTS`` and writes the RAW v1.1 report to
    ``ATDD_VIOLATIONS_REPORT``. The CLI runs THAT per-impl module rather than a
    single hardcoded filename, so every bound detector executes. Reuses each
    impl's EXISTING report channel — no detection logic is reimplemented here.

    Returns None when the manifest is unreadable or declares no ``report:`` — the
    caller then exits 2 (honest run-health failure, not a silent clean pass).
    """
    try:
        data = yaml.safe_load(manifest_path.read_text(encoding="utf-8")) or {}
    except (OSError, yaml.YAMLError):
        return None
    name = data.get(REPORT_FIELD)
    return str(name) if name else None


# The consumer's ATDD *package-install* substrate — ALWAYS excluded from the
# provider scan. Installing these extensions into a consumer drops the packages
# (with their deliberately-dirty fixtures) under ``.atdd/workspaces/**`` and
# ``.atdd/extensions/**``; without this the extensions' OWN fixtures get miscounted
# as consumer violations. Merged in below so it holds even when the caller supplies
# no ATDD_SCAN_EXCLUDES. ``run.py`` re-asserts the same invariant for the direct
# adapter path. We exclude the two install dirs, NOT all of ``.atdd/`` — the
# consumer's own ``.atdd/config.yaml`` stays visible for config-reading detectors.
ALWAYS_EXCLUDE = (".atdd/workspaces", ".atdd/extensions")


def _exclude_globs() -> list[str]:
    """Caller-supplied excludes (ATDD_SCAN_EXCLUDES) merged with the always-excluded
    substrate dir. Never drops caller globs; always contains ``.atdd``."""
    caller: list[str] = []
    raw = os.environ.get("ATDD_SCAN_EXCLUDES")
    if raw:
        try:
            globs = json.loads(raw)
        except json.JSONDecodeError:
            globs = None
        if isinstance(globs, list):
            caller = [str(g) for g in globs]
    merged = list(caller)
    for ex in ALWAYS_EXCLUDE:
        if ex not in merged:
            merged.append(ex)
    return merged


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="CW-Phase 0 convex.workspace.runtime provider CLI")
    ap.add_argument("--impl", default=os.environ.get("ATDD_IMPL_ID", DEFAULT_IMPL))
    ap.add_argument("--impls-root", default=str(IMPLS_ROOT),
                    help="root to discover implementations under (default: the provider's)")
    ap.add_argument("scan_roots", nargs="*")
    args = ap.parse_args(argv)

    impls_root = Path(args.impls_root)

    roots = _scan_roots(args.scan_roots)
    if not roots:
        print("provider-cli: no scan roots (set ATDD_SCAN_ROOTS or pass argv)", file=sys.stderr)
        return 2

    # Resolution via the real provider contract: discover the implementation.
    found = discover_mod.discover_implementations(impls_root)
    impl = next((i for i in found if i.implementation_id == args.impl), None)
    if impl is None:
        ids = ", ".join(sorted(i.implementation_id for i in found))
        print(f"provider-cli: impl {args.impl!r} not discoverable under {impls_root} "
              f"(found: {ids})", file=sys.stderr)
        return 2

    impl_dir = impl.manifest_path.parent
    report_name = _report_module_name(impl.manifest_path)
    if not report_name:
        print(f"provider-cli: impl {impl.implementation_id!r} declares no "
              f"{REPORT_FIELD!r} (v1.1 report module) in {impl.manifest_path}", file=sys.stderr)
        return 2
    detector_path = impl_dir / report_name
    if not detector_path.is_file():
        print(f"provider-cli: v1.1 report module {detector_path} missing", file=sys.stderr)
        return 2

    result = run_mod.run_implementation(
        impl.implementation_id,
        detector_path,
        scan_roots=roots,
        exclude_globs=_exclude_globs(),
    )

    # RAW factual channel only — no disposition applied here.
    json.dump(result.violations, sys.stdout)
    sys.stdout.write("\n")
    sys.stdout.flush()

    print(
        f"provider-cli: impl={impl.implementation_id} structured={result.structured} "
        f"ran={result.ran} exit={result.exit_code} raw_violations={len(result.violations)}",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
