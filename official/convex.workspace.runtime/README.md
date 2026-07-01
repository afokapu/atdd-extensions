# convex.workspace.runtime

A first-class ATDD **workspace provider**: a reusable JavaScript/TypeScript
runtime that runs validator implementations against a Convex codebase. It owns
**zero conventions** — those live in the Convex extensions
(`convex.extension.coder`, `convex.extension.tester`), which *target*
this provider by id + contract range.

It is the first **real** (non-stub) non-pytest provider in the hub: its Python
adapter shells out to a JS runner and translates the result into the standard
ATDD violation contract.

## Contract

`contract_version: 1.1.0` — the same discover + run contract as
`atdd.workspace.python-pytest` (scan-mount env channel + structured JSON violation
report). A detector reads `ATDD_SCAN_ROOTS` and writes RAW
`{rule_id, file, line, col, evidence, source_line}` records to
`ATDD_VIOLATIONS_REPORT`. The provider emits RAW facts only; disposition is the
consumer's job.

## Layout

```
adapter/discover.py   discovery (caret-SemVer + targets_workspace filter)
adapter/run.py        run: node <detector.mjs> + env channel → violations
implementations/      detector(s) this provider ships fixtures for
conformance/          contract suite (REAL — runs, not skipped)
runtime/              shared files materialized per instance (empty in Phase 0)
prove_phase0.py       end-to-end de-risk driver  → see PHASE0-PROOF.md
```

## Status

Phase 0 PROVEN (`PHASE0-PROOF.md`). Runner is `node`; Phase 0.5 swaps it to
`vitest run` without changing the contract.

## Requirements

`node` on PATH (run command) and `pyyaml` (adapter discovery).
