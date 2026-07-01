# Full Core coder/tester → Convex/frontend mirror — worker assignments

**Why this exists.** The first mirror wave only covered the partially-decomposed
`atdd.extension.coder` (48) + `atdd.extension.tester` (2) and *missed* large parts of
the real core surface (`src/atdd/{coder,tester}/conventions/` = 20 + 13 domains) and
the entire `atdd.extension.train-interlocking-enforcement` extension. The goal now is
**100% mirror of core coder/tester behavior** — no guessing, no silent drops.

**Core repo (read-only source):** `/Users/alecfokapu/Github/atdd/main/src/atdd/`
**Interlocking extension (read-only source):** `/Users/alecfokapu/Github/atdd-extensions/official/atdd.extension.train-interlocking-enforcement/`
**This repo (build here):** the convex/frontend packages under `official/`.

---

## SHARED METHOD — every worker does this, precisely and comprehensively

For **every** convention in your assignment:

1. **READ the core convention in full** (path given). Read the `statement`,
   `normative_text`, `rationale`, examples — do NOT judge from the filename.

2. **CLASSIFY it yourself** and record it in `docs/mirror-classification/<W>.md`
   (create it) as one row per rule_id:
   - **AGNOSTIC-CONSUMER** — the obligation applies to *any* consumer repo's code
     (a Convex/TS app is a consumer). Most conventions are worded "a consumer …
     MUST …" with a per-stack detector as the realization → **MIRROR**.
   - **ATDD-INTERNAL / PLANNER-OWNED / SUBSTRATE-SPEC** — the obligation only
     governs the ATDD toolkit's own substrate, or is a planner/plan-layer concern,
     or a `SPEC-*/AP-*/GP-*/DS-*` internal spec id → **DOCUMENT WHY-NOT** (quote the
     text that proves it). Do NOT mirror; do NOT silently drop.
   Be conservative: when a convention says "consumer" / "consumer runtime" / has
   TypeScript/frontend/backend variants, it is AGNOSTIC — mirror it.

3. **For each AGNOSTIC rule, BUILD the Convex/TS realization** at full fidelity:
   - Atomic convention node → schema 1.1.0, adapted from the core node (statement /
     content.normative_text / fix_hint / exceptions / metadata / terms). Rule_id:
     `coder.convex.<slug>` (backend), `coder.vite.<slug>` / `coder.astro.<slug>`
     (frontend), `tester.convex.<slug>` (tests). Pick the target by the convention's
     stack (backend→convex, frontend→vite/astro, tests→convex-tester); if it is
     truly stack-neutral and applies to both, mirror into BOTH backend + frontend.
   - Validator (detector) → zero-dep Node ESM `detect.mjs` reading `ATDD_SCAN_ROOTS`,
     writing RAW v1.1 `{rule_id,file,line,col,evidence,source_line}` to
     `ATDD_VIOLATIONS_REPORT`, exit 0. **Prefer FAMILY validators** — one detector
     emitting a cohesive group's `emits_rule_ids` (Core pattern). Manifest MUST pass
     the enforced implementation-schema: `kind: implementation`, `subtype: validator`,
     `targets_workspace`, `contract_version "1.1.0"`, `entrypoint`, `report`,
     `emits_rule_ids` (non-empty), `realizes_convention` (primary, ∈ emits_rule_ids).
   - Fixtures: `fixtures/clean/` (0 violations) + `fixtures/dirty/` (≥1). For
     path-based rules preserve realistic subpaths.
   - Ground against real code: `/Users/alecfokapu/Github/frg-app/main/apps/game/convex/`
     (backend), `apps/game/src/` (Vite), `apps/web/src/` (Astro).

4. **Reference the proven pattern** (in your worktree): the console-log slice
   `official/convex.workspace.runtime/implementations/convex_no_server_console_log/`
   + `official/convex.extension.coder/conventions/coder.convex.no-server-console-log.convention.yaml`,
   and a FAMILY detector `.../implementations/convex_complexity_detector/` (checks/ + _map.json).

5. **ADD-ONLY (no cross-worker conflicts):** create only NEW files — new convention
   YAMLs (distinct rule_ids), new implementation dirs, your own
   `official/<workspace>/conformance/test_<W>.py`, and `docs/mirror-classification/<W>.md`.
   Do NOT edit any `atdd.extension.yaml`, `relationships.yaml`, `PORTING-PLAN.md`,
   `MIRROR-GAP-ASSIGNMENT.md`, `CORE-PARITY-MATRIX.md`, or existing conformance files —
   the orchestrator wires manifests + relationships + graph at assembly.

6. **Validate + commit:** run your conformance file green
   (`python3 -m pytest official/<workspace>/conformance/test_<W>.py -q`); each node
   YAML must `yaml.safe_load`. Commit per convention-group (conventional commits).
   Do NOT push. When your whole assignment (classification + all agnostic builds)
   is done, print `WORKER <W> DONE` and stop. NEVER `atdd emergency`.

**Secrets:** any security fixture must use placeholder secrets WITHOUT a real provider
sub-format (`sk_REDACTED_PLACEHOLDER`, not `sk_live_...`/full AKIA) — GitHub push
protection blocks real formats.

---

## ASSIGNMENTS

Core paths are under `/Users/alecfokapu/Github/atdd/main/src/atdd/`.

### W1 — Interlocking (confirmed AGNOSTIC — highest priority)
Source: `/Users/alecfokapu/Github/atdd-extensions/official/atdd.extension.train-interlocking-enforcement/conventions/` (read the python detectors under `implementations/` for the exact checks).
- coder: interlocking-runner-exists, interlocking-resolution-model-exists, interlocking-delegates-to-trainrunner, interlocking-does-not-carry-cargo, interlocking-bilateral-binding, station-master-interlocking-routing
- tester: interlocking.route-coverage, interlocking.production-runner-used, interlocking.trace-binds-declared-route, interlocking.smoke-coverage-for-station-master

### W2 — Train (composition root + journey tests)
- `coder/conventions/train.convention.yaml` (coder.train.is-a-production, wagons-communicate-via-cargo, yaml-is-the) + `coder/conventions/nodes/coder.train.*.convention.yaml`
- `tester/conventions/train.convention.yaml` (journey/E2E tests, Train: header, TS+python examples) + `tester.train.coverage`

### W3 — Backend architecture
- `coder/conventions/backend.convention.yaml` (code-is-organized, component-file-suffix-matches, imports-respect-dependency-allowed)
- `coder/conventions/dto.convention.yaml` (dto.placement, dto.purity, dto.mapper)
- `coder/conventions/technology.convention.yaml` (new-components-default-to, approved-alternatives, unapproved-technology-choices)

### W4 — Commons layering
- `coder/conventions/commons.convention.yaml` (domain-layer-in-commons, application-layer-uses-ports, cross-feature-imports-in + SPEC-CODER-COMMONS-000x)

### W5 — Green / URN traceability
- `coder/conventions/green.convention.yaml` (component-urn-marker, urn-matches-pattern, wagon-and-feature-segments, name/side/layer segments, runtime-declaration, tested-by-block, header-order, + GP/GR/SH/DL/DC/AP ids)

### W6 — Frontend boundaries + train
- `coder/conventions/frontend.convention.yaml` (trainid-not-registered, resolved-train-lists-wagon, trainid-expression-not-static, arrow/function-expression, empty-fragment, self-closing, conditional-branch, allowlist-entry, negative-rule-guarded, boundaries-fe-layers, boundaries-fe-imports)

### W7 — Design system (gap fill)
- `coder/conventions/design.convention.yaml` (the full 34: tokens-are-pure-values, dependency-flow-tokens-primitives, wagons-import-from-design, extract-to-design-system, hierarchy-coverage, DS/VC-DS/METRIC-DS/AP-DS ids, primitives, token-color, token-hardcoded, orphan-export/ui, foundations, hierarchy-import). Mirror the gaps not already built in vite/convex.

### W8 — Coder gap fill (security/boundaries/logging/coverage)
- `coder/conventions/security.convention.yaml` — **xss**, sql-injection (missing-auth/hardcoded-secret already done — skip)
- `coder/conventions/boundaries.convention.yaml` — xlang-entity/enum/naming/contract (http-client done)
- `coder/conventions/logging.convention.yaml` — no-print-calls-in, logger-calls-must-include(context), coach-silent-swallow (print/structured done)
- `coder/conventions/coverage.convention.yaml` — every-feature-must-have, every-implementation-must-have

### W9 — Tester: acceptance + coverage
- `tester/conventions/acceptance-violation.convention.yaml` (9: acceptance-must-be-measurable, must-declare-phase, disposition-must-not-be-declared, validator-binding-bidirectional, security-rule-acceptance-ref, metric-implementation-must-exist, hermetic-fake-must-declare-contract, hermetic-live-smoke-paired, live-smoke-must-execute)
- `tester/conventions/coverage.convention.yaml` (every-acceptance-criterion, bidirectional contracts/telemetry, tracking-manifest)

### W10 — Tester: smoke + red + routing
- `tester/conventions/smoke.convention.yaml` (train-mounts, harness-subprocess-crash, pres, no-collaborator-substitution, operator-observable-assertion, cross-component-handoff-gap; note some `planner.smoke.*` are PLANNER — classify)
- `tester/conventions/red.convention.yaml` (red.naming, red.fails-first)
- `tester/conventions/routing.convention.yaml` (routing.path)

### W11 — Tester: security + artifact + telemetry + isolation
- `tester/conventions/security.convention.yaml` (tester.security.auth, tester.security.input; SPEC-TESTER-SEC/THREAT ids — classify)
- `tester/conventions/artifact.convention.yaml` (commons:ux:foundations, :color, mechanic:decision.choice — classify carefully)
- `tester/conventions/telemetry.convention.yaml` (telemetry.emit)
- `tester/conventions/test-isolation.convention.yaml` (test-isolation.no-polluting-patterns)

---

**Orchestrator (post-wave):** collect each `docs/mirror-classification/<W>.md`, wire all
new nodes into the extension manifests + no-orphan relationship graphs, run
`atdd validate package` on every package + full conformance + a real-life smoke over
frg-app, then report the complete mirror ledger.
