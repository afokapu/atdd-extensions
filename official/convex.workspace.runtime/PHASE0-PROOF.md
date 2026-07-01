# convex.workspace.runtime — Phase 0 de-risk proof

**Status:** PROVEN (2026-06-30). First real (non-stub) JavaScript runtime provider
in the hub.

## What Phase 0 had to de-risk

A workspace provider's adapter is **Python** (the ATDD engine speaks one
discover/run/translate protocol), but `convex.workspace.runtime` must drive a
**JavaScript** runtime. The only genuinely novel piece in the whole Convex
effort is therefore the **Python ↔ JS seam**: can a Python adapter run a JS
detector and get back ATDD-shaped violations, with no npm install and without
importing ATDD core? Everything else (conventions, more detectors) is
well-precedented by the python-pytest provider once this seam holds.

## What was built

| File | Role |
|---|---|
| `atdd.workspace.yaml` | provider manifest; `contract_version: 1.1.0`; capability `execution.convex` (runner `node` → `vitest` in 0.5) |
| `adapter/discover.py` | discovery half — line-for-line sibling of python-pytest's; same caret-SemVer contract math; also filters on `targets_workspace == convex.workspace.runtime` |
| `adapter/run.py` | run half — shells out to `node <detector.mjs>`, injects `ATDD_SCAN_ROOTS` / `ATDD_SCAN_EXCLUDES` / `ATDD_VIOLATIONS_REPORT`, reads back the RAW v1.1 report, falls back to the v1.0.0 exit-code mapping if no report |
| `implementations/convex_no_server_console_log/` | the proof detector `coder.convex.no-server-console-log` (strict) + clean/dirty fixtures |
| `conformance/test_provider_contract.py` | 5 REAL (not skipped) contract tests |
| `prove_phase0.py` | end-to-end driver |

## The contract this provider claims

Identical to `atdd.workspace.python-pytest` v1.1.0 — the runtime differs, the
contract does not:

- **Scan-mount (§2):** scope is supplied, never auto-discovered. The detector
  reads `ATDD_SCAN_ROOTS`; it never walks the repo on its own.
- **Structured report (§3):** the detector writes
  `{"violations": [{rule_id, file, line, col, evidence, source_line}, ...]}` to
  `ATDD_VIOLATIONS_REPORT`.
- **RAW, not disposition (§1):** exit 0 / `passed=True` is *run-health*, not a
  verdict — a dirty scan still exits 0. The strict/suppress/advisory verdict is a
  downstream consumer concern. The provider imports no consumer; the consumer
  imports no adapter.

## Proof result

`python3 prove_phase0.py` (node v26, python 3.14):

- discovery finds the detector ✔
- CLEAN fixture → structured report, **0 violations** ✔
- DIRTY fixture → structured report, **exactly 1 violation** at the `console.log`
  line, full v1.1 shape ✔
- run-health stays exit 0 on the dirty scan (RAW channel, no disposition) ✔
- **real `frg-app/apps/game/convex/` tree → 9 real `console.*` violations** across
  `process_payout/**` ✔

`python3 -m pytest conformance/` → **5 passed**.

## The vitest swap (Phase 0.5)

Phase 0 runs detectors with plain `node` to keep the proof hermetic. To adopt
vitest, change `RUN_COMMAND` in `adapter/run.py` to the vitest invocation and ship
`runtime/{package.json,vitest.config.ts}` under `shared_runtime.files`. The
contract — env channel + report file — is unchanged, so discovery, the report
shape, and every detector keep working.

## Not in scope here (Phase 1+)

- Convention nodes (`coder.convex.*`) — authored in `convex.extension.coder`.
- The tester surface — `convex.extension.tester`.
- Wiring into frg-app via `atdd substrate add → bind → enforce`.
