"""Run half of the convex.workspace.runtime provider contract (contract_version 1.1.0).

Execute a discovered implementation inside the materialized workspace instance
with the provider command and translate the result into the ATDD violation-output
contract. This is the JavaScript sibling of
atdd.workspace.python-pytest/adapter/run.py: it implements the SAME v1.1 contract
(scan-mount env channel + structured JSON report), but the RUN command shells out
to a JS runtime instead of pytest.

  * RUN COMMAND — Phase 0 runs the detector with ``node <entrypoint.mjs>`` (zero
    npm deps, so the Python↔JS subprocess+env+report seam is proven hermetically).
    Phase 0.5 swaps ``RUN_COMMAND`` to a vitest invocation; nothing else changes,
    because the contract is the env channel + report file, not the runner.

  * SCAN-MOUNT (§2) — the code-under-inspection is supplied explicitly, never
    auto-discovered. ``run_implementation`` injects ``ATDD_SCAN_ROOTS`` (JSON
    list) and ``ATDD_SCAN_EXCLUDES`` (JSON list) into the subprocess env. The JS
    detector obeys them; it never walks the repo on its own.

  * STRUCTURED REPORT CHANNEL (§3) — the provider allocates a temp report path,
    passes it as ``ATDD_VIOLATIONS_REPORT``, runs the detector, then reads back a
    JSON report of RAW ``{rule_id,file,line,col,evidence,source_line}`` violations.

The provider performs ZERO disposition logic. ``violations`` is the RAW factual
channel; the disposition verdict (strict / suppress-and-clean / advisory) is the
downstream consumer's job. ``passed``/``exit_code`` is RUN-HEALTH, not a verdict.
"""
from __future__ import annotations

import json
import os
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

CONTRACT_VERSION = "1.1.0"

# Phase 0: plain node over the detector .mjs. Phase 0.5: ("pnpm", "exec", "vitest",
# "run") or ("npx", "vitest", "run") — the contract is unaffected by this swap.
RUN_COMMAND = ("node",)

# Env-var channel names (shared verbatim with the JS detector; identical to the
# python-pytest provider so a detector authored against either provider relies on
# the same names).
ENV_SCAN_ROOTS = "ATDD_SCAN_ROOTS"        # JSON list[str] — code-under-inspection roots
ENV_SCAN_EXCLUDES = "ATDD_SCAN_EXCLUDES"  # JSON list[str] — exclusion globs
ENV_REPORT = "ATDD_VIOLATIONS_REPORT"     # path the detector writes its JSON report to

# The consumer's ATDD *package-install* substrate — ALWAYS excluded from every
# provider scan. When these extensions are installed into a consumer repo, the
# packages (with their deliberately-dirty test fixtures) land under the consumer's
# ``.atdd/workspaces/**`` and ``.atdd/extensions/**``. Without this the extensions'
# OWN fixtures get counted as consumer violations (in one FRG trial: 1731 of 2204
# = 78% pure noise). Injected here — the single chokepoint both the CLI path
# (cli/scan.py) and the direct adapter path cross — so every detector inherits it
# via ATDD_SCAN_EXCLUDES (they match it as a path substring).
#
# NOTE: we exclude the two install dirs, NOT all of ``.atdd/``: the consumer's own
# ``.atdd/config.yaml`` is legitimate scan input for config-reading detectors
# (e.g. the no-stub allowlist-migration check) and must stay visible.
ALWAYS_EXCLUDE = (".atdd/workspaces", ".atdd/extensions")


def _merge_always_excluded(exclude_globs: list[str] | None) -> list[str]:
    """Merge caller excludes with the always-excluded substrate dir(s), order-preserving."""
    merged = [str(g) for g in exclude_globs] if exclude_globs else []
    for ex in ALWAYS_EXCLUDE:
        if ex not in merged:
            merged.append(ex)
    return merged

# Run-health exit codes the contract distinguishes. node exits 0 on success and 1
# on an uncaught throw — the detector itself exits 0 even when it FINDS violations
# (it writes them to the report; finding violations is not a run error).
_EXIT_OK = 0
_EXIT_RUNTIME_ERROR = 1

# Required keys on a v1.1 structured violation record.
_VIOLATION_KEYS = ("rule_id", "file", "line", "col", "evidence", "source_line")


@dataclass(frozen=True)
class RunResult:
    """Outcome of running one implementation under the provider.

    ``violations`` is the RAW factual channel — the provider applies no
    disposition. ``passed`` / ``exit_code`` is run-health (did the detector
    execute and emit), NOT a pass/fail verdict; the verdict is computed downstream
    from ``violations`` by the consumer.
    """

    implementation_id: str
    passed: bool
    exit_code: int
    violations: list[dict] = field(default_factory=list)
    stdout: str = ""
    structured: bool = False  # True when violations came from the v1.1 report channel

    @property
    def ran(self) -> bool:
        """True when the runner actually executed (not a usage/spawn error)."""
        return self.exit_code in (_EXIT_OK, _EXIT_RUNTIME_ERROR)


def _fallback_violations(exit_code: int, stdout: str, implementation_id: str) -> list[dict]:
    """v1.0.0 mapping: a failing run → one impl-keyed violation at root location.

    Used only when the implementation emits no structured report. A passing run
    yields none.
    """
    if exit_code == _EXIT_OK:
        return []
    summary = stdout.strip().splitlines()[-1] if stdout.strip() else f"exit {exit_code}"
    return [{"rule_id": implementation_id, "location": ".", "evidence": summary}]


def _read_report(report_path: Path) -> list[dict] | None:
    """Read + validate the structured report, or None if absent/malformed.

    Returning None routes the caller to the v1.0.0 fallback — a malformed report
    must never be silently treated as "zero violations" (that would hide a
    detector bug as a clean pass).
    """
    if not report_path.is_file():
        return None
    try:
        data = json.loads(report_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return None
    if not isinstance(data, dict):
        return None
    raw = data.get("violations")
    if not isinstance(raw, list):
        return None
    out: list[dict] = []
    for item in raw:
        if not isinstance(item, dict):
            return None
        if not all(k in item for k in _VIOLATION_KEYS):
            return None
        out.append(item)
    return out


def run_implementation(
    implementation_id: str,
    entrypoint: str | Path,
    *,
    scan_roots: list[str] | None = None,
    exclude_globs: list[str] | None = None,
    env: dict | None = None,
) -> RunResult:
    """Run the JS detector at ``entrypoint`` and return a contract-shaped result.

    ``entrypoint`` is the detector module (a ``.mjs`` file in Phase 0) inside the
    resolved workspace instance. ``scan_roots`` / ``exclude_globs`` are the
    explicit scan-mount inputs (§2) — injected as JSON env vars for the detector
    to obey.

    The provider injects ``ATDD_VIOLATIONS_REPORT``; if the detector writes a
    valid v1.1 report there, those RAW violations are returned (``structured=
    True``). Otherwise the v1.0.0 exit-code fallback applies (``structured=
    False``).
    """
    base_env = dict(env if env is not None else os.environ)
    if scan_roots is not None:
        base_env[ENV_SCAN_ROOTS] = json.dumps([str(r) for r in scan_roots])
    # ALWAYS forward the substrate exclude, merged with any caller-supplied globs,
    # so the consumer's ``.atdd/`` is never self-scanned even on the direct path.
    base_env[ENV_SCAN_EXCLUDES] = json.dumps(_merge_always_excluded(exclude_globs))

    with tempfile.TemporaryDirectory(prefix="atdd-convex-report-") as tmp:
        report_path = Path(tmp) / "violations.json"
        base_env[ENV_REPORT] = str(report_path)

        cmd = [*RUN_COMMAND, str(entrypoint)]
        proc = subprocess.run(  # noqa: S603 — fixed argv, no shell
            cmd, capture_output=True, text=True, env=base_env
        )
        stdout = proc.stdout + proc.stderr

        structured_violations = _read_report(report_path)

    if structured_violations is not None:
        # v1.1 structured channel: RAW violations come from the report. passed is
        # run-health (exit 0), NOT a disposition verdict.
        return RunResult(
            implementation_id=implementation_id,
            passed=proc.returncode == _EXIT_OK,
            exit_code=proc.returncode,
            violations=structured_violations,
            stdout=stdout,
            structured=True,
        )

    # v1.0.0 fallback: exit-code → single impl-keyed violation.
    return RunResult(
        implementation_id=implementation_id,
        passed=proc.returncode == _EXIT_OK,
        exit_code=proc.returncode,
        violations=_fallback_violations(proc.returncode, stdout, implementation_id),
        stdout=stdout,
        structured=False,
    )
