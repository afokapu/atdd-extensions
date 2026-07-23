# Convex extensions — porting plan (atdd-js draft → atomic convention nodes)

**Source drafts (read-only):** `frg-app/main/atdd-js/{coder,tester}/conventions/`.
These are written in the OLD monolithic style (`convention_id`, embedded
`runtime.hard_constraints`, `structure` blocks). This plan decomposes them into
ATOMIC convention nodes (one `rule_id` per file, schema 1.1.0), each owned by an
extension and realized by an `convex.workspace.runtime` detector.

**Rule of engagement:** a node is authored as `active` only when a real detector
backs it. Until then it is listed here as `planned` — no orphan obligations.

## Legend
- **Owner:** `convex-coder` | `convex-tester`
- **Detector:** the `convex.workspace.runtime` implementation that realizes it
- **Status:** `active` (authored + detector green) · `planned` (detector TODO) ·
  `deferred` (needs a design decision before it can be a static rule)

## Coder surface — from `coder/conventions/convex.convention.yaml`

| rule_id | Owner | Sev | Disp | Detector idea | Status |
|---|---|---|---|---|---|
| `coder.convex.no-server-console-log` | convex-coder | 2 | strict | regex `console.*` over `convex/**` (skip `_generated`, tests) | **active** |
| `coder.convex.schema-at-root` (CONVEX-RT-001) | convex-coder | 4 | strict | assert `convex/schema.ts` exists | **active** |
| `coder.convex.http-router-at-root` (CONVEX-RT-002) | convex-coder | 4 | strict | if any `httpAction(` used, assert `convex/http.ts` exists | **active** |
| `coder.convex.api-no-underscore-dir` (CONVEX-RT-004) | convex-coder | 3 | strict | exported query/mutation/action must not sit under an `_`-prefixed dir | planned |
| `coder.convex.layer-naming` (structure.layer_naming) | convex-coder | 2 | s&c | per-feature layer files named `api/application/domain/integration.ts` | planned |
| `coder.convex.domain-no-convex-import` (4-layer purity) | convex-coder | 3 | strict | files in `domain.ts`/`domain/` must not import `convex/*` or `_generated` | planned |
| `coder.convex.feature-layout-promotion` (structure.promotion_trigger) | convex-coder | 1 | advisory | flag a layer file > 150 lines OR > 3 exports (promote to dir) | planned |
| `coder.convex.generated-not-edited` (CONVEX-RT-003) | convex-coder | 4 | — | `_generated/` is an exclusion, not a violation site | **deferred** (scan-policy, not a rule) |

### Still to classify (drafts not yet decomposed)
- `coder/conventions/boundaries-ts.convention.yaml` — cross-wagon isolation via TS
  path aliases → likely `coder.convex.wagon-isolation-*`.
- `coder/conventions/vite.convention.yaml` — Vite + React 4-layer → a SEPARATE
  frontend extension (`atdd.extension.vite-coder`?), not Convex. Out of scope here.
- `coder/conventions/green-ts.convention.yaml` — URN headers in TS comment form →
  may be a tester/traceability node, classify with the tester pass.

## Tester surface — from `tester/conventions/filename-ts.convention.yaml`

| rule_id | Owner | Sev | Disp | Detector idea | Status |
|---|---|---|---|---|---|
| `tester.convex.filename-urn` | convex-tester | 2 | documentation-only | a `*.test.ts` under `convex/**` is named from its acceptance URN (`{wmbt}-{harness}-{nnn}[-slug].test.ts`) and is Vitest-collectable | **active** |

This is the Convex/Vitest sibling of the official `tester.filename.urn`
(python-pytest renders `test_*.py`; convex renders `*.test.ts`). The IDENTITY-from-
URN-header invariant stays in core; only the per-stack FILENAME rendering lives
here.

## Build order (each = one vertical slice: detector + convention + fixtures)
1. ✅ `coder.convex.no-server-console-log` (done — Phase 0).
2. ✅ `coder.convex.schema-at-root` + `http-router-at-root` (trivial existence detectors).
3. `coder.convex.domain-no-convex-import` (import-graph boundary detector).
4. `tester.convex.filename-urn` (first tester node).
5. `coder.convex.api-no-underscore-dir`, `layer-naming`, `feature-layout-promotion`.
