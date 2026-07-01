# WT classification — frontend TESTER: journey/E2E · train↔E2E coverage · presentation-smoke · a11y/visual

Sources (read-only):
- Core tester conventions: `/Users/alecfokapu/Github/atdd/main/src/atdd/tester/conventions/`
  (`train`, `smoke`, `coverage`, `filename`, `routing`, `test-isolation`, `red`).
- Core tester harness templates: `.../tester/schemas/{e2e,a11y,visual}.tmpl.json`.
- Core tester frontend validators: `.../tester/validators/`
  (`test_train_frontend_e2e.py`, `test_train_e2e_existence.py`, `test_train_renders_content.py`,
  `test_presentation_smoke_coverage.py`, `test_train_route_smoke_coverage.py`).
- Real frg-app Playwright reality: `/Users/alecfokapu/Github/frg-app/main/apps/game/`
  (`playwright.config.ts`, `tests/e2e/*.smoke.spec.ts`, `plan/_trains*`).

Method (same as the other mirror workers): for every source obligation, classify
**AGNOSTIC-CONSUMER** (a rule any consumer frontend's *test surface* should follow →
MIRROR into the Vite/Playwright stack as `tester.vite.<slug>`) vs **ATDD-INTERNAL /
SUBSTRATE-SPEC / PLANNER-OWNED** (governs only the ATDD toolkit's own substrate,
`.atdd/`, python module paths, the `atdd` CLI, or a `SPEC-*` internal validator id →
DOCUMENT WHY-NOT, no mirror). Conservative rule: wording that targets a *consumer's*
tests, or that has per-stack renderings, is AGNOSTIC.

Build target: **`frontend.extension.vite-tester`** (role: tester, flow_wagon:
validate-test-surface, depends_on workspace `frontend.workspace.runtime`). Astro is
**folded in** — see the Astro decision below. Add-only; ZERO edits to
`convex.extension.tester` or any shared manifest/relationship/conformance.

---

## Astro decision — fold into vite-tester (no `frontend.extension.astro-tester`)

`apps/web` (the Astro app) has **no E2E/journey surface at all**:

```
$ find frg-app/main -name "playwright.config.*" -not -path "*/node_modules/*"
frg-app/main/apps/game/playwright.config.ts        # ← the ONLY playwright config
$ find frg-app/main/apps/web -name "*.spec.ts" -o -name "*.test.ts"   # (none)
```

`apps/web` ships `astro.config.mjs`, `branding/`, `public/`, `src/` — a marketing/
landing site with zero Playwright specs and no `plan`-bound trains routed through it.
The entire journey/E2E/smoke test surface lives in `apps/game` (Vite/React). An
`astro-tester` extension would own zero real conventions today. Therefore the agnostic
frontend test conventions are mirrored **once** under `tester.vite.*`; the detectors
scan `*.spec.ts`/`*.test.ts` trees stack-neutrally, so an Astro app that later grows a
Playwright suite is already covered by the same nodes. If/when `apps/web` grows its own
`playwright.config.*` + train-bound specs, split out `frontend.extension.astro-tester`
then (add-only).

---

## Per-source classification

### 1. `train.convention.yaml` — journey/E2E test contract  → **AGNOSTIC-CONSUMER (MIRROR)**

The whole journey-test contract is a portable test-structure obligation: URN grammar,
the `Train:` header, `Layer: assembly`, mutual exclusion with acceptance headers.

| obligation | class | evidence | mirror |
|---|---|---|---|
| journey URN grammar `test:train:{train_id}:{HARNESS}-{NNN}-{slug}` | AGNOSTIC | `pattern: "test:train:{train_id}:{HARNESS}-{NNN}-{slug}"` | `tester.vite.journey-urn-format` |
| `Train:` header MUST reference a valid train URN `train:\d{4}-[a-z0-9][a-z0-9-]*` | AGNOSTIC | `"Train: header MUST reference a valid train URN"` / `train:\\d{4}-[a-z0-9][a-z0-9-]*` | `tester.vite.journey-train-header` |
| `Layer` MUST be `assembly` for journey tests | AGNOSTIC | `"Layer MUST be 'assembly' for journey tests"` | `tester.vite.journey-layer-assembly` |
| `Acceptance:`/`WMBT:` MUST NOT appear in journey tests | AGNOSTIC | `"Acceptance: and WMBT: lines MUST NOT appear in journey tests"` | `tester.vite.journey-no-acceptance-marker` |
| `tester.train.coverage` — each train wagon has a smoke test at its composition root | AGNOSTIC | `TESTER-TRAIN-COVERAGE-001`, `disposition: documentation-only` | folded into coverage + presentation-smoke below |
| `# Structured rules (issue #394 — see src/atdd/coach/specs/rule-id.spec.md)` tail | ATDD-INTERNAL | references atdd issue tracker / internal spec path | not mirrored |

### 2. `smoke.convention.yaml` — integration/smoke tests  → **MIXED**

| obligation | class | evidence | mirror |
|---|---|---|---|
| smoke header (`Phase: SMOKE`, `Smoke: true`, `Layer: assembly`, slug ends `-smoke`) | AGNOSTIC | `"Phase MUST be SMOKE"` / `"URN slug MUST end with -smoke"` | subsumed by journey-* (a smoke spec IS an assembly journey with SMOKE harness) |
| `tester.smoke.pres` / `TESTER-SMOKE-PRES-001` — every `web/src/*/presentation/*.tsx` has a matching `e2e/*smoke*.spec.ts` | AGNOSTIC | `"Every web/src/*/presentation/*.tsx must have a matching e2e/*smoke*.spec.ts"` | `tester.vite.presentation-smoke-coverage` |
| every train w/ contract-level journey tests SHOULD also have a smoke test | AGNOSTIC | `smoke.convention` §170-173 (severity: warning) | folded into `tester.vite.train-e2e-coverage` |
| smoke asserts observable state, real infra, no collaborator substitution | AGNOSTIC (but overlaps convex.tester.smoke-*) | `tester.smoke.no-collaborator-substitution`, `tester.smoke.operator-observable-assertion` | NOT re-mirrored — already owned by `convex.extension.tester` (`tester.convex.smoke-observable-assertion`, `tester.convex.smoke-no-collaborator-substitution`); those are stack-neutral over `*.spec.ts` and should be **relocated**, not duplicated (see relocate section) |
| `.atdd/baselines/tester.yaml` ratchet, `atdd spawn`/`atdd coach` CLI, validator module paths, `planner.smoke.*` | ATDD-INTERNAL | `"Ratcheted via .atdd/baselines/tester.yaml."`, `"SMOKE tests MUST drive the real CLI entry point (atdd spawn / atdd coach)"` | not mirrored |
| `TESTER-RENDER-001/002/003` behavioral render (empty/stub/harness-error) | RUNTIME-HARNESS (out of static scope) | classified by `mount-train.mjs` harness JSON, not a spec scan — `test_train_renders_content.py` | not mirrored as a static detector (a harness concern; noted for a future render-harness node) |

### 3. `coverage.convention.yaml` — hierarchy coverage  → **MOSTLY ATDD/PLANNER**, one agnostic seed

| obligation | class | evidence | mirror |
|---|---|---|---|
| `COVERAGE-TEST-3.1` every acceptance URN referenced by ≥1 test | AGNOSTIC-but-planner-scoped | `"Each acceptance URN must be referenced by at least one test"` | not mirrored here (acceptance↔test is the coder/planner traceability surface, already covered by `coder.vite.green-*`); the **train↔E2E** direction is the frontend-tester obligation and is mirrored as coverage below |
| `COVERAGE-TEST-3.2/3.3` contract↔wagon, telemetry↔wagon bidirectional | ATDD-INTERNAL | validator names `test_hierarchy_coverage::...`, `rollout.phase: PLANNER_TESTER_ENFORCEMENT` | not mirrored |
| `COVERAGE-TEST-3.4` tracking-manifest complete (`strict`) | ATDD-INTERNAL | substrate telemetry manifest | not mirrored |

**Note.** The "every train has ≥1 E2E" obligation the brief calls out is NOT in
`coverage.convention.yaml`. It is realized by the validators `test_train_e2e_existence.py`
(every train ≥1 E2E file) and `test_train_frontend_e2e.py` VAL-0026 (every frontend spec's
dir is a registered train_id) — mirrored as `tester.vite.train-e2e-coverage` +
`tester.vite.e2e-names-valid-train`.

### 4. `filename.convention.yaml` — test filename identity  → **AGNOSTIC-CONSUMER (partial mirror)**

| obligation | class | evidence | mirror |
|---|---|---|---|
| journey header identity comes from `# URN: test:...`, not the filename | AGNOSTIC | `"Test file IDENTITY comes from the explicit # URN: test:... header"` | enforced inside `tester.vite.journey-urn-format` (a journey spec must carry the `test:train:` URN) |
| acceptance-URN → per-language filename generation tables | ATDD/PLANNER | generator tables for Dart/Go/Java/Kotlin/… + `tester.filename.urn` over acceptance URNs | not mirrored (acceptance-test naming is the coder surface; the frontend-tester surface is the train_id-prefixed `{train_id}.smoke.spec.ts` naming, checked via `e2e-names-valid-train`) |

### 5. `routing.convention.yaml` — layer routing  → **AGNOSTIC**, folded

`tester.routing.path` classifies a test to a layer by keyword. For the frontend journey
surface the only binding decision is `Layer: assembly`, already enforced by
`tester.vite.journey-layer-assembly`. Evidence: `"Layer must be 'assembly' for all
journey tests"` (train.convention). Not mirrored as a separate node — no independent
frontend obligation beyond assembly.

### 6. `test-isolation.convention.yaml` — git-pollution guard  → **ATDD-INTERNAL (no mirror)**

Codifies a specific atdd-repo incident: `"PRs #625 and #627 each pushed 220,000-line
deletions because validator tests set core.bare=true on the live worktree's shared
.git/config."` / `"Reference: CLAUDE.md worktree_config convention (#634 ...)"`. It
protects the toolkit's own worktree, not a consumer's Playwright suite. The convex
sibling `tester.convex.test-isolation-no-polluting-patterns` already renders the
stack-neutral form; a Playwright suite that shells to git is covered by the same
`node:child_process` scan. Not re-mirrored for the frontend surface.

### 7. `red.convention.yaml` — RED generation pipeline  → **MOSTLY ATDD-INTERNAL**

The journey/acceptance header rules it restates are already mirrored (via train.convention
above). Its core — `"Deterministic intent extraction + bounded agent rendering +
multi-level validation"`, the `to: "coder"` handoff, atdd validator module paths — is the
toolkit's own generation pipeline. `tester.red.fails-first` (`RED tests must fail on first
run`) is a runtime/temporal property no static spec-scan can observe; already owned by
`convex.extension.tester` (`tester.convex.red-fails-first`). Not re-mirrored.

### 8. harness templates `e2e/a11y/visual.tmpl.json`  → **AGNOSTIC-CONSUMER (MIRROR)**

The `header_template.journey` block of all three is identical and is the canonical
journey header this extension enforces:

```
// URN: test:train:{train_id}:{HARNESS}-{nnn}-{slug}   (HARNESS ∈ E2E | A11Y | VIS)
// Train: train:{train_id}
// Phase: RED
// Layer: assembly
```

- `e2e.tmpl.json` (`framework: playwright`) → journey-* nodes cover its header + URN.
- `a11y.tmpl.json` (`import AxeBuilder from '@axe-core/playwright'` … `.analyze()` … assert
  `critical.length <= {max_critical}`) → `tester.vite.a11y-harness` (an A11Y spec must use
  an axe builder and assert on violations).
- `visual.tmpl.json` (`await expect(page).toHaveScreenshot('{snapshot_name}.png', …)`) →
  `tester.vite.visual-harness` (a VIS spec must assert a screenshot).

---

## Built nodes (9 conventions, 4 realizations)

| # | rule_id | realization (impl) | shape | severity/disp |
|---|---|---|---|---|
| 1 | `tester.vite.journey-train-header` | `vite_journey_test_detector` | family member | 2 / documentation-only |
| 2 | `tester.vite.journey-urn-format` | `vite_journey_test_detector` | family member | 2 / documentation-only |
| 3 | `tester.vite.journey-layer-assembly` | `vite_journey_test_detector` | family member | 2 / documentation-only |
| 4 | `tester.vite.journey-no-acceptance-marker` | `vite_journey_test_detector` | family member | 2 / documentation-only |
| 5 | `tester.vite.train-e2e-coverage` | `vite_train_e2e_coverage` | family member | 2 / documentation-only |
| 6 | `tester.vite.e2e-names-valid-train` | `vite_train_e2e_coverage` | family member | 2 / documentation-only |
| 7 | `tester.vite.presentation-smoke-coverage` | `vite_presentation_smoke_coverage` | singleton | 3 / documentation-only |
| 8 | `tester.vite.a11y-harness` | `vite_a11y_visual_harness` | family member | 3 / documentation-only |
| 9 | `tester.vite.visual-harness` | `vite_a11y_visual_harness` | family member | 3 / documentation-only |

Each detector is a zero-dependency `.mjs` on the `frontend.workspace.runtime` v1.1
contract (env `ATDD_SCAN_ROOTS`/`ATDD_SCAN_EXCLUDES` in, RAW
`{rule_id,file,line,col,evidence,source_line}` report out, exit 0 regardless of count).

### Binding convention — grounded in frg-app reality, wider than the core validators

The **core** frontend validators bind a spec to a train by **directory** (`e2e/{train_id}/`
in `test_train_e2e_existence.py`, `web/e2e/{train_id}/` + `@train`/`@see` JSDoc in
`test_train_frontend_e2e.py`). But **frg-app does not use that layout** — its specs are
flat, train_id-**prefixed** files carrying a `// Train:` header:
`apps/game/tests/e2e/{train_id}.smoke.spec.ts`. So these detectors bind a spec to a train
by **any** of: (a) the `// Train: train:{id}` header, (b) a `{train_id}.` filename prefix,
or (c) a `e2e/{train_id}/` parent directory — a strict superset of the core conventions, so
frg-app's real specs actually bind (the core dir-only validators would miss them entirely).

---

## Train↔E2E audit (frg-app)  — REQUIRED DELIVERABLE

Audited `/Users/alecfokapu/Github/frg-app/main`. Registry: `plan/_trains.yaml` +
`plan/_trains/*.yaml`. Specs: `apps/game/tests/e2e/*.smoke.spec.ts`.

### Spec inventory (4 spec files)

| spec file | filename train prefix | `// Train:` header | binds real train? | verdict |
|---|---|---|---|---|
| `2001-curate-scenarios.smoke.spec.ts` | `2001` | ✅ `train:2001-curate-scenarios` | ✅ | OK — **partial header** (missing `Runtime:`, `Smoke: true`, `Purpose:`, `URN:`) |
| `3001-host-a-match.smoke.spec.ts` | `3001` | ✅ `train:3001-host-a-match` | ✅ | OK — full compliant header (5 tests) |
| `3002-play-a-match.smoke.spec.ts` | `3002` | ✅ `train:3002-play-a-match` | ✅ | OK — full compliant header (7 tests) |
| `curate-content.localise-content.smoke.spec.ts` | **NONE** (`{wagon}.{feature}`) | ❌ **no `Train:`** (has `Feature: feature:curate-content:localise-content`) | ❌ | 🔴 **FLAGGED** — orphaned from the train system; carries `Acceptance:` lines in an `assembly`-layer file |

### Train coverage (11 declared trains)

| train_id | E2E smoke spec? | evidence |
|---|---|---|
| `2001-curate-scenarios` | ✅ | `2001-curate-scenarios.smoke.spec.ts` |
| `3001-host-a-match` | ✅ | `3001-host-a-match.smoke.spec.ts` |
| `3002-play-a-match` | ✅ | `3002-play-a-match.smoke.spec.ts` |
| `2101-invalid-scenario-json` | ⚪ backend-only by design | registry `test.backend = curate-content.import-scenario.test.ts` |
| `3003-resolve-a-dilemma` | ⚪ backend-only by design | registry `test.backend = run-match.resolve-dilemma.test.ts` |
| `3102-team-quorum-empty` | ⚪ backend-only by design | registry `test.backend = commit-decisions.empty-quorum.test.ts` |
| `3004-end-a-match` | 🔴 MISSING | registry declares frontend `e2e/3004-end-a-match.smoke.spec.ts` — **file does not exist** |
| `3101-join-closed-tournament` | 🔴 MISSING | registry declares frontend `e2e/3101-join-closed-tournament.smoke.spec.ts` — **file does not exist** |
| `8001-payout-standard` | 🔴 NONE | no `test:` block in registry; no spec (payout theme entirely untested) |
| `8301-missing-phone` | 🔴 NONE | no `test:` block; no spec |
| `8302-duplicate-player` | 🔴 NONE | no `test:` block; no spec |

### Concrete gaps flagged (what the mirrored nodes catch)

1. 🔴 **`3004-end-a-match`, `3101-join-closed-tournament` — broken registry references.**
   The registry points each at an `e2e/{train_id}.smoke.spec.ts` that **is not on disk**.
   → caught by `tester.vite.train-e2e-coverage` (train with no covering spec).
2. 🔴 **`8001-payout-standard`, `8301-missing-phone`, `8302-duplicate-player` — the entire
   payout/monetization theme has zero E2E coverage** and no `test:` declaration.
   → caught by `tester.vite.train-e2e-coverage`.
3. 🔴 **`curate-content.localise-content.smoke.spec.ts` — orphaned spec.** No `NNNN-slug`
   train prefix, no `// Train:` header; its acceptances (`acc:curate-content:L0xx`) are
   keyed to a **wagon**, not a train. It sits in the train E2E dir but binds no train.
   → caught by `tester.vite.e2e-names-valid-train` (an e2e spec that names no valid train).
   Its `Acceptance:` lines in an assembly file would ALSO trip
   `tester.vite.journey-no-acceptance-marker` *if* it were train-bound — it is not, which
   is itself the defect.
4. ⚠ **`2001-curate-scenarios.smoke.spec.ts` — partial header.** Has `Train:`/`Phase:`/
   `Layer:` but omits `Runtime:`, `Smoke: true`, `Purpose:`, and a top-level `URN:` line
   mandated by `apps/game/tests/e2e/README.md`. Non-blocking, noted. (Its per-test
   `test:train:...:E2E-001-...` comment satisfies `journey-urn-format`; the header-block
   `URN:` line is a stricter README-local rule.)
5. ⚪ **Slug drift.** `plan/_trains/3101-join-closed-session.yaml` declares
   `train_id: 3101-join-closed-tournament` (registry uses `-tournament`); the per-train
   file is named `...-session`. Cosmetic, but the file-name↔train_id mismatch is the kind
   of drift `e2e-names-valid-train` normalizes against the registry.

**Tally:** 11 trains → 3 with E2E specs, 2 with broken (missing-file) registry refs,
3 backend-only by design, 3 with zero test declarations. 4 spec files → 3 bind cleanly,
1 orphaned. **Every gap above is surfaced by the two coverage nodes** (`train-e2e-coverage`
+ `e2e-names-valid-train`) plus the journey-header family.

---

## Relocate from `convex.extension.tester`  (ADD-ONLY here — orchestrator relocates)

These nodes currently sit in `convex.extension.tester` but are really **frontend
(Playwright/journey/E2E)** concerns — they scan `*.spec.ts` presentation/journey trees
and the train↔E2E relation, not Convex server code. They were mis-scoped into the backend
tester during the Convex wave and SHOULD relocate to `frontend.extension.vite-tester`
(or be recognized as the stack-neutral originals these `tester.vite.*` nodes now mirror).
**I did not edit `convex.extension.tester`.**

| convex node (current) | why it is frontend | frontend home |
|---|---|---|
| `tester.convex.journey-train-header` | journey/E2E `Train:` header on `*.spec.ts` assembly tests | ↔ `tester.vite.journey-train-header` |
| `tester.convex.journey-urn-format` | `test:train:{id}:{HARNESS}-{NNN}-{slug}` journey URN | ↔ `tester.vite.journey-urn-format` |
| `tester.convex.journey-layer-assembly` | `Layer: assembly` on journey specs | ↔ `tester.vite.journey-layer-assembly` |
| `tester.convex.journey-no-acceptance-marker` | forbids `Acceptance:`/`WMBT:` in journey specs | ↔ `tester.vite.journey-no-acceptance-marker` |
| `tester.convex.train-coverage` | "each train wagon has a smoke test at its composition root" — the train↔E2E/smoke relation, not server code | ↔ `tester.vite.train-e2e-coverage` |
| `tester.convex.smoke-presentation-coverage` | literally "every `presentation/*.tsx` has a matching `e2e/*smoke*.spec.ts`" — a pure frontend-view coverage rule (`.tsx`, Playwright) | ↔ `tester.vite.presentation-smoke-coverage` |
| `tester.convex.interlocking-route-coverage` | "every admissible route has an **e2e** test that exercises it" — an `e2e/**/*.ts` journey-coverage obligation | frontend E2E surface (route↔E2E); relocate the e2e-coverage half |
| `tester.convex.interlocking-smoke-coverage-for-station-master` | smoke coverage over the interlocking's rendered surface | frontend smoke surface |

**Not proposed for relocation** (genuinely backend/stack-neutral-but-server-scoped):
`tester.convex.security-auth/-input`, `tester.convex.telemetry-emit`,
`tester.convex.migration-naming`, `tester.convex.routing-path`,
`tester.convex.red-fails-first`, `tester.convex.filename-urn`,
`tester.convex.live-smoke-no-self-skip`, `tester.convex.test-isolation-no-polluting-patterns`,
`tester.convex.interlocking-production-runner-used`,
`tester.convex.interlocking-trace-binds-declared-route`,
`tester.convex.smoke-observable-assertion`, `tester.convex.smoke-no-collaborator-substitution`
(the last two are stack-neutral over any `*.spec.ts` but are already owned; not duplicated).
