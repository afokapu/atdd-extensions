# CODER + TESTER → Extension Migration: Design & Classification

**Status:** ANALYSIS + PROPOSAL ONLY. No convention nodes authored, no core repo
touched, no commit. Sole deliverable = this file.

**CWD / target repo:** `atdd-extensions` (this repo).
**Read-only sources:**
- Core rules: `/Users/alecfokapu/Github/atdd/main/src/atdd/{coder,tester}/conventions/*.convention.yaml`
- Precedent to mirror: `./official/atdd.extension.github/` (15-field node schema, implementations, relationships, manifest, registry).
- Prior core classification: `/Users/alecfokapu/Github/atdd/main/docs/{coder,tester}-convention-decomposition-plan.md` (+ `-issues.md`).

## Scope translation (5-way core plan → binary this-task axis)

The core plans classify section-by-section into
`core | workspace | extension | legacy_redirect | design_candidate`.
This task's axis is binary: **core-agnostic** (stays in core `atdd`) vs
**extension** (migrates here). Mapping used throughout:

| Core-plan class | This task | Migrates to atdd-extensions? |
|---|---|---|
| `core` | core-agnostic | No — stays in core `src/atdd/{coder,tester}/conventions/nodes/` |
| `legacy_redirect` (to planner/filename naming authority) | core-agnostic | No — core/planner owns it |
| `design_candidate` (no language-neutral source yet) | core-agnostic (deferred) | No — recorded, not authored anywhere yet |
| `workspace` (ties to a runtime/test-framework/persistence) | **extension** | **Yes** |
| `extension` (ties to a platform: GitHub CI) | **extension** | **Yes** |

A canonical dotted `rule_id` (`coder.<area>.<slug>` / `tester.<area>.<slug>`) is
classified **extension** iff *the rule as written* names or is inseparable from a
specific language, framework, persistence engine, or platform tool. If the dotted
id states a stack-neutral architecture/lifecycle/traceability principle (even when
its *detector body* is Python), it is **core-agnostic** and only the peeled
detector body migrates.

## Target-package legend

Per the github precedent, **conventions are owned by an `atdd.extension.*` package**;
the **`atdd.workspace.*` package is only the runtime that executes the
implementation** (python-pytest owns zero conventions). So each extension rule has
TWO coordinates: the convention owner (an extension) and the implementation runtime
(a workspace). See §3 / Open Decision 1 for why this two-layer split is mandatory.

Convention owners (NEW unless noted):
- `atdd.extension.coder` — owns every extension-classified coder convention node.
- `atdd.extension.tester` — owns every extension-classified tester convention node.
- `atdd.extension.github` *(EXISTS)* — smoke CI integration only.
- `atdd.extension.consumer-stack` — the concrete product stack catalog (technology.convention).

Implementation runtimes (workspaces):
- `PYP` = `atdd.workspace.python-pytest` *(EXISTS)* — Python + pytest detectors/validators.
- `TS`  = `atdd.workspace.typescript` *(NEW)* — TS / React / Preact (JSX AST, fetch, GSAP, i18n, DOM).
- `DF`  = `atdd.workspace.dart-flutter` *(NEW)* — Dart / Flutter design-system.
- `SB`  = `atdd.workspace.supabase` *(NEW)* — Supabase / Deno Edge Functions / Postgres migrations.
- `FA`  = `atdd.workspace.fastapi` *(NEW)* — FastAPI / HTTP-REST (route auth, Station-Master DI, api_structure).

---

# 1. PER-RULE CLASSIFICATION TABLE

Legend: **CA** = core-agnostic (stays in core, not migrated). **EXT** = extension
(migrates here). For EXT rows, *Owner* is the convention-owning extension and
*Runtime* is the implementation workspace.

## 1A. CODER rules (104 canonical dotted rule_ids + 2 no-dotted-id files)

### backend.convention.yaml
| rule_id | Class | Owner / Runtime | Rationale |
|---|---|---|---|
| coder.backend.code-is-organized | CA | — | Layering into presentation/application/domain/integration is stack-neutral. |
| coder.backend.imports-respect-dependency-allowed | CA | — | The canonical inward dependency-direction rule (SHARED core node). |
| coder.backend.component-file-suffix-matches | EXT | coder / PYP (+TS) | Per-language file-suffix tables (`_service.py`, `.service.ts`) are realization. |

### boundaries.convention.yaml
| rule_id | Class | Owner / Runtime | Rationale |
|---|---|---|---|
| coder.boundaries.xlang-naming | CA | — | Naming consistent across runtimes = planner naming/URN authority (legacy_redirect). |
| coder.boundaries.http-client | EXT | coder / TS | Centralized HTTP-client detector is the React/fetch realization (principle lives in coder.frontend.centralized-http-client, CA). |
| coder.boundaries.xlang-entity | EXT | coder / PYP | Cross-language entity-parity detector (python↔dart↔ts); detector host PYP. |
| coder.boundaries.xlang-enum | EXT | coder / PYP | Cross-language enum-parity detector. |
| coder.boundaries.xlang-contract | EXT | coder / PYP | Cross-language contract-parity detector. |

### commons.convention.yaml
| rule_id | Class | Owner / Runtime | Rationale |
|---|---|---|---|
| coder.commons.domain-layer-in-commons | CA | — | Domain layer has no outbound deps — boundary invariant. |
| coder.commons.application-layer-uses-ports | CA | — | Application talks to ports — hexagonal invariant. |
| coder.commons.cross-feature-imports-in | CA | — | Cross-feature imports route through the layer above (dedup → no-cross-wagon). |

### composition.convention.yaml *(no dotted rule_ids — config/spec)*
| section | Class | Owner / Runtime | Rationale |
|---|---|---|---|
| composition.principle (every file has a consumer / root reaches all layers) | CA | — | Completeness invariant; atomize as core `coder.composition.*` (synthesize ids). |
| composition.stacks repo_root/patterns/import_resolution/exclusions | EXT | coder / PYP (+TS, SB) | Per-stack roots, barrel/path-alias resolution, ast_imports detectors. |

### component-naming.convention.yaml *(no dotted rule_ids)*
| section | Class | Owner / Runtime | Rationale |
|---|---|---|---|
| layer_assignment (artifact-type → layer) | CA | — | Architectural layer assignment by artifact type — stack-neutral. |
| urn_naming / artifact_derivation | CA | — | Component-URN grammar + name derivation = planner naming authority (legacy_redirect). |

### coverage.convention.yaml
| rule_id | Class | Owner / Runtime | Rationale |
|---|---|---|---|
| coder.coverage.every-feature-must-have | CA | — | Every feature implemented — coverage principle. |
| coder.coverage.every-implementation-must-have | CA | — | Every implementation has a linked test — coverage principle. |

### dead-code.convention.yaml
| rule_id | Class | Owner / Runtime | Rationale |
|---|---|---|---|
| coder.dead-code.reachability | CA | (detector → PYP) | "No unreachable code" is agnostic; Python BFS/importlib detector peels to PYP. |
| coder.dead-code.reachability-typescript | EXT | coder / TS | Explicit TypeScript reachability detector. |

### design.convention.yaml (Flutter design-system)
| rule_id | Class | Owner / Runtime | Rationale |
|---|---|---|---|
| coder.design.tokens-are-pure-values | CA | — | Tokens carry no logic/widgets — design principle. |
| coder.design.dependency-flow-tokens-primitives | CA | — | tokens←primitives←components←templates one-way flow — layering. |
| coder.design.wagons-import-from-design | CA | — | Design system never imports from wagons — one-way boundary. |
| coder.design.extract-to-design-system | EXT | coder / DF | Extraction triggers are EdgeInsets/Color/Dart-specific. |
| coder.design.primitives | EXT | coder / DF | Flutter primitive-layer detector (registry mirror of DS-rules). |
| coder.design.foundations | EXT | coder / DF | Flutter foundations-layer detector. |
| coder.design.token-color | EXT | coder / DF | `Color(0xFF..)` literal detector. |
| coder.design.token-hardcoded | EXT | coder / DF | Hardcoded-design-value detector (Flutter literals). |
| coder.design.orphan-export | EXT | coder / DF | Design-system orphan-export detector. |
| coder.design.orphan-ui | EXT | coder / DF | Orphan UI-component detector. |
| coder.design.hierarchy-import | EXT | coder / DF | Reverse-import detector (dedup target = CA dependency-flow). |
| coder.design.hierarchy-coverage | EXT | coder / DF | Design-hierarchy coverage detector. |

### dto.convention.yaml
| rule_id | Class | Owner / Runtime | Rationale |
|---|---|---|---|
| coder.dto.placement | CA | — | DTOs live in contracts/ at the boundary — placement principle. |
| coder.dto.purity | CA | — | DTOs pure/immutable/simple-typed — true in any language. |
| coder.dto.mapper | CA | — | Mapper discipline (integration, bidirectional) — boundary principle. |

### duplication.convention.yaml
| rule_id | Class | Owner / Runtime | Rationale |
|---|---|---|---|
| coder.duplication.no-structurally-identical-code | CA | (detector → PYP) | DRY principle; AST-hash threshold detector peels to runtime. |
| coder.duplication.no-structurally-identical-typescript | EXT | coder / TS | TS structural-dup detector. |
| coder.duplication.no-intra-layer-code-python | EXT | coder / PYP | Python intra-layer-dup detector. |
| coder.duplication.no-intra-layer-code-typescript | EXT | coder / TS | TS intra-layer-dup detector. |

### error-response.convention.yaml
| rule_id | Class | Owner / Runtime | Rationale |
|---|---|---|---|
| coder.error-response.bare-string | CA | — | Errors are structured objects not bare strings — wire-contract principle. |
| coder.error-response.code-format | CA | — | `^[A-Z][A-Z0-9_]+$` + per-wagon namespacing — agnostic identifier grammar. |

### frontend.convention.yaml
| rule_id | Class | Owner / Runtime | Rationale |
|---|---|---|---|
| coder.frontend.boundaries-fe-layers | CA | — | 4-layer FE architecture — protocol layering. |
| coder.frontend.boundaries-fe-imports | CA | — | Inward FE dependency direction. |
| coder.frontend.allowlist-entry-must-include | CA | — | No-stub allowlist must carry a migration ref — policy meta-rule. |
| coder.frontend.arrow-function-with-a | EXT | coder / TS | JSX AST no-stub-render detector (principle = coder.presentation.no-stub-render, CA). |
| coder.frontend.function-or-function-expression | EXT | coder / TS | JSX AST stub detector. |
| coder.frontend.empty-fragment-return-or | EXT | coder / TS | Empty-fragment JSX detector. |
| coder.frontend.self-closing-or-empty | EXT | coder / TS | Self-closing/empty JSX detector. |
| coder.frontend.conditional-whose-every-branch | EXT | coder / TS | Vacuous-conditional-render JSX detector. |
| coder.frontend.negative-rule-a-guarded | EXT | coder / TS | Guarded-render JSX detector. |
| coder.frontend.trainid-not-registered-in | EXT | coder / TS | TrainView registration check (React train composition). |
| coder.frontend.resolved-train-lists-wagon | EXT | coder / TS | Resolved-train wagon-listing check. |
| coder.frontend.trainid-expression-not-statically | EXT | coder / TS | Static trainId-expression analyzer. |

### green.convention.yaml
| rule_id | Class | Owner / Runtime | Rationale |
|---|---|---|---|
| coder.green.component-urn-marker-is | CA | — | URN/header grammar → planner authority (legacy_redirect). |
| coder.green.component-urn-matches-pattern | CA | — | URN pattern grammar → planner. |
| coder.green.wagon-and-feature-segments | CA | — | URN segment grammar → planner. |
| coder.green.component-name-segment-matches | CA | — | URN segment grammar → planner. |
| coder.green.side-segment-is-one | CA | — | URN segment enum → planner. |
| coder.green.layer-segment-is-one | CA | — | URN segment enum → planner. |
| coder.green.purpose-description-purpose-is | CA | — | File-header grammar → planner. |
| coder.green.tested-by-block-lists | CA | — | Tested-by header grammar → planner. |
| coder.green.header-order-urn-tested | CA | — | Header-ordering grammar → planner. |
| coder.green.runtime-declaration-runtime-python | EXT | coder / PYP | `runtime: python` declaration is runtime-specific. |

> NB: GREEN's protocol kernel (thinnest-vertical-slice GP-*, guardrails GR-*,
> deferral SH/DL/DC/AP-*) is **CA** but carries no canonical dotted rule_ids in the
> monolith — atomize with synthesized core ids (see §4 bundling).

### logging.convention.yaml
| rule_id | Class | Owner / Runtime | Rationale |
|---|---|---|---|
| coder.logging.no-print-calls-in | CA | (detector → PYP) | Structured-logging-over-print principle. |
| coder.logging.logger-calls-must-include | CA | (detector → PYP) | Logs carry structured context — observability principle. |
| coder.logging.coach-silent-swallow | CA | (detector → PYP) | No silent exception swallowing. |
| coder.logging.print | CA | — | Registry mirror of no-print-calls-in — **dedup**, not a second node. |
| coder.logging.structured | CA | — | Registry mirror of logger-calls-must-include — **dedup**. |

### performance.convention.yaml
| rule_id | Class | Owner / Runtime | Rationale |
|---|---|---|---|
| coder.performance.perf | CA | (detector → PYP/SB) | No IO-in-loop / N+1 principle; supabase/httpx chain detector peels to runtime. |

### presentation.convention.yaml
| rule_id | Class | Owner / Runtime | Rationale |
|---|---|---|---|
| coder.presentation.layer-is-thin | CA | — | Presentation carries no business logic. |
| coder.presentation.controllers-never-call-domain | CA | — | Controller→UseCase→Domain layering. |
| coder.presentation.response-models-live-in | CA | — | Response models in contract_dto matching schema. |
| coder.presentation.gsap-layer | EXT | coder / TS | GSAP animation-layer rule (frontend lib). |
| coder.presentation.gsap-commons | EXT | coder / TS | GSAP-in-commons rule. |
| coder.presentation.i18n-config | EXT | coder / TS | i18n config rule (frontend lib). |
| coder.presentation.i18n-switcher | EXT | coder / TS | i18n switcher rule. |

### refactor.convention.yaml
| rule_id | Class | Owner / Runtime | Rationale |
|---|---|---|---|
| coder.refactor.coach-ratchet-pres | CA | — | Presentation reduction requires recorded smoke evidence — safety gate. |
| coder.refactor.composition-consumer | CA | — | Every file has a consumer — composition principle. |
| coder.refactor.composition-root | CA | — | Composition root reaches all layers. |
| coder.refactor.complexity-cyclomatic | EXT | coder / PYP | Numeric threshold (>10) + radon — measurement tooling. |
| coder.refactor.complexity-nesting | EXT | coder / PYP | Nesting-depth threshold detector. |
| coder.refactor.complexity-length | EXT | coder / PYP | Function-length threshold detector. |
| coder.refactor.complexity-params | EXT | coder / PYP | Param-count threshold detector. |
| coder.refactor.complexity-cognitive | EXT | coder / PYP | Cognitive-complexity metric detector. |
| coder.refactor.complexity-cyclomatic-typescript | EXT | coder / TS | TS cyclomatic-complexity detector. |
| coder.refactor.complexity-nesting-typescript | EXT | coder / TS | TS nesting detector. |
| coder.refactor.complexity-length-typescript | EXT | coder / TS | TS length detector. |
| coder.refactor.quality-mi | EXT | coder / PYP | Maintainability-index metric (radon). |
| coder.refactor.quality-comments | EXT | coder / PYP | Comment-ratio metric detector. |
| coder.refactor.quality-duplication | EXT | coder / PYP | Duplication-quality metric detector. |
| coder.refactor.quality-naming | EXT | coder / PYP | Naming-quality metric detector. |
| coder.refactor.quality-file-length | EXT | coder / PYP | File-length metric detector. |
| coder.refactor.quality-mi-typescript | EXT | coder / TS | TS maintainability-index detector. |
| coder.refactor.quality-comments-typescript | EXT | coder / TS | TS comment-ratio detector. |
| coder.refactor.nplus1 | EXT | coder / PYP | N+1 query detector (principle = performance.perf, CA). |

### security.convention.yaml
| rule_id | Class | Owner / Runtime | Rationale |
|---|---|---|---|
| coder.security.no-raw-sql-string | CA | (detector → PYP/SB) | No raw SQL concatenation — security principle. |
| coder.security.sql-injection | CA | — | Mirror of no-raw-sql-string — **dedup**. |
| coder.security.xss | CA | — | No unsafe HTML injection — agnostic security principle. |
| coder.security.hardcoded-secret | CA | — | No hardcoded secrets — universal principle. |
| coder.security.fastapi-routes-must-have | EXT | coder / FA | FastAPI route-auth (decorators, Depends(auth_fn)). |
| coder.security.missing-auth | EXT | coder / FA | FastAPI Depends(auth) detector (neutral "protected endpoints enforce auth" = design_candidate, CA). |
| coder.security.no-hardcoded-secrets-aws | EXT | coder / PYP | AWS-key regex secret scanner (cloud-specific patterns). |
| coder.security.no-innerhtml-or-dangerouslysetinnerhtml | EXT | coder / TS | React/DOM innerHTML sink detector. |

### technology.convention.yaml
| rule_id | Class | Owner / Runtime | Rationale |
|---|---|---|---|
| coder.technology.new-components-default-to | CA | — | "Default to approved stack" — governance rule (the *stack tree* itself migrates, see below). |
| coder.technology.approved-alternatives-are-taken | CA | — | Approved-alternative governance. |
| coder.technology.unapproved-technology-choices-require | CA | — | Deviation-process governance (SPEC edit + revisit date). |
| *(technology stack tree section — no dotted id)* | EXT | consumer-stack | Concrete Supabase/Flutter/Gun.js/Sentry/PostHog defaults + costs/SLAs. |

### train.convention.yaml
| rule_id | Class | Owner / Runtime | Rationale |
|---|---|---|---|
| coder.train.is-a-production | CA | — | Train is a PRODUCTION composition root (node already exists in core). |
| coder.train.wagons-communicate-via-cargo | CA | — | Wagons communicate via cargo (node already exists). |
| coder.train.yaml-is-the | CA | — | Train YAML single-source-of-truth; YAML *grammar* → planner (legacy_redirect). |

## 1B. TESTER rules (30 canonical dotted rule_ids + 2 no-dotted-id files)

### acceptance-violation.convention.yaml — 9-rule substrate cluster (near 1:1)
| rule_id | Class | Owner / Runtime | Rationale |
|---|---|---|---|
| tester.acceptance-violation.acceptance-must-be-measurable | CA | — | Acceptance measurable (binding test OR metric+threshold) — substrate invariant. |
| tester.acceptance-violation.acceptance-must-declare-phase | CA | — | identity.phase declared (coach dispatch). |
| tester.acceptance-violation.disposition-must-not-be-declared | CA | — | Disposition is walker-set, unsuppressible-by-construction. |
| tester.acceptance-violation.validator-binding-must-be-bidirectional | CA | — | Declared harness.type ⇒ anchored matching test exists. |
| tester.acceptance-violation.security-rule-must-have-acceptance-ref-resolved | CA | — | abuse_case.acceptance_ref must resolve. |
| tester.acceptance-violation.metric-implementation-must-exist | CA | (compute() lookup → PYP) | Declared signal.metric ⇒ compute() exists; .py lookup peels to PYP. |
| tester.acceptance-violation.hermetic-fake-must-declare-contract | CA | — | permitted_fakes ⇒ fidelity contract declared. |
| tester.acceptance-violation.hermetic-live-smoke-required-must-have-paired-smoke-acceptance | CA | — | Hermetic-before-live-smoke pairing invariant. |
| tester.acceptance-violation.live-smoke-acceptance-must-execute | CA | (skip-detect → PYP) | live_smoke runs-or-fails, never self-skips. |

### coverage.convention.yaml
| rule_id | Class | Owner / Runtime | Rationale |
|---|---|---|---|
| tester.coverage.every-acceptance-criterion-must | CA | — | Acceptance→test bidirectional traceability. |
| tester.coverage.bidirectional-coverage-between-contracts | CA | — | Contract↔wagon produce/consume graph invariant. |
| tester.coverage.bidirectional-coverage-between-telemetry | CA | — | Telemetry-signal↔wagon graph invariant. |
| tester.coverage.tracking-manifest-must-be | CA | — | Manifest-completeness + exemption policy. |

### filename.convention.yaml
| rule_id | Class | Owner / Runtime | Rationale |
|---|---|---|---|
| tester.filename.urn | EXT | tester / PYP | Sits in slug_transformations/per-language section — `test_` prefix + filename mechanics (principle "test carries URN identity" is CA / planner). |

### migration.convention.yaml
| rule_id | Class | Owner / Runtime | Rationale |
|---|---|---|---|
| tester.migration.naming | EXT | tester / SB | Migration table-naming for Postgres/Supabase (the "persistent contract needs a store" principle is CA). |

### red.convention.yaml
| rule_id | Class | Owner / Runtime | Rationale |
|---|---|---|---|
| tester.red.fails-first | CA | — | RED must fail on first run — canonical protocol invariant. |
| tester.red.naming | CA | — | RED test header/filename grammar → filename/planner (legacy_redirect). |

### routing.convention.yaml
| rule_id | Class | Owner / Runtime | Rationale |
|---|---|---|---|
| tester.routing.path | EXT | tester / PYP | "Test path determines runtime (python/ vs supabase/ vs web/)" bakes in concrete runtimes (the layer-keyword taxonomy itself is CA). |

### security.convention.yaml
| rule_id | Class | Owner / Runtime | Rationale |
|---|---|---|---|
| tester.security.auth | CA | — | Secured ops need auth/authz acceptance coverage — binding rule. |
| tester.security.input | CA | — | Secured ops need adversarial-input tests — binding rule. |

### smoke.convention.yaml
| rule_id | Class | Owner / Runtime | Rationale |
|---|---|---|---|
| tester.smoke.no-collaborator-substitution | CA | — | No substituting a production collaborator — smoke-fidelity invariant. |
| tester.smoke.operator-observable-assertion | CA | — | Anti-false-green: operator-observable assertion required. |
| tester.smoke.cross-component-handoff-gap | CA | — | Anti-false-green: cross-component handoff must be exercised. |
| tester.smoke.harness-subprocess-failed-crash | CA | (subprocess model → PYP) | A crashed harness subprocess must surface as RED, not green — fidelity invariant (BORDERLINE: subprocess model may be pytest-specific — Open Decision 5). |
| tester.smoke.pres | EXT | tester / TS | Presentation-smoke (preact-DOM render) — frontend-bound. |
| tester.smoke.train-mounts-but-the | EXT | tester / TS | Train-mount render assertion (preact-DOM). |
| tester.smoke.train-mounts-but-the-1 | EXT | tester / TS | Train-mount render assertion (variant). |

### telemetry.convention.yaml
| rule_id | Class | Owner / Runtime | Rationale |
|---|---|---|---|
| tester.telemetry.emit | CA | (sink wiring → PYP) | Validator emits expected events to configured sink — behavioral protocol rule. |

### test-isolation.convention.yaml
| rule_id | Class | Owner / Runtime | Rationale |
|---|---|---|---|
| tester.test-isolation.no-polluting-patterns | CA | (AST scan → PYP) | No mutation of shared state outside isolated scope — isolation principle. |

### train.convention.yaml
| rule_id | Class | Owner / Runtime | Rationale |
|---|---|---|---|
| tester.train.coverage | CA | — | Per-wagon smoke at composition root + journey/acceptance header mutual-exclusion. |

### contract.convention.yaml *(no dotted rule_ids — core principle rows)*
| section | Class | Owner / Runtime | Rationale |
|---|---|---|---|
| agent_responsibilities / schema_structure / composite_contracts / contract_versioning / bidirectional_linkage | CA | — | Planner-defines/tester-implements, schema-is-source-of-truth, UI-agnostic, SemVer lifecycle, closed-loop linkage — atomize as core `tester.contract.*` (synthesize ids). |
| persistence_traceability / api_structure / generation_workflow / enforcement | EXT | tester / SB (persistence), tester / FA (api_structure) | JSONB/Supabase persistence; REST ops/status/OAuth2/pagination. |
| naming_authority / directory_structure | CA | — | $id/URN/theme → planner artifact-naming (legacy_redirect). |

### artifact.convention.yaml *(no dotted rule_ids)*
| section | Class | Owner / Runtime | Rationale |
|---|---|---|---|
| ownership (producer-owns / consumers-reference) | CA | — | Single-source-of-truth principle (atomize as one core `tester.artifact.*`). |
| naming/versioning/organization/api_mapping/urns/examples | CA | — | Entire surface declared "aligned with canonical artifact-naming.convention.yaml v2.1" → planner (legacy_redirect). |

---

# 2. EXTENSION TARGET MAP

Each NEW package mirrors a precedent **exactly**. There are two precedent shapes
in this repo:

- **Extension** (owns conventions) → mirror `./official/atdd.extension.github/`.
- **Workspace runtime** (owns adapter, no conventions) → mirror `./official/atdd.workspace.python-pytest/`.

## 2.1 `atdd.extension.coder` *(NEW extension — owns all coder EXT conventions)*

Mirrors `atdd.extension.github/` structure exactly:

```
official/atdd.extension.coder/
  atdd.extension.yaml          # extension_id, role: coder, owns{conventions,relationships,implementations}, depends_on.workspaces[python-pytest,typescript,dart-flutter,supabase,fastapi]
  README.md
  conventions/                 # one <rule_id>.convention.yaml per EXT coder rule (15-field v1.1.0)
    coder.backend.component-file-suffix-matches.convention.yaml
    coder.boundaries.http-client.convention.yaml
    coder.boundaries.xlang-entity.convention.yaml
    coder.boundaries.xlang-enum.convention.yaml
    coder.boundaries.xlang-contract.convention.yaml
    coder.dead-code.reachability-typescript.convention.yaml
    coder.design.{extract-to-design-system,primitives,foundations,token-color,token-hardcoded,orphan-export,orphan-ui,hierarchy-import,hierarchy-coverage}.convention.yaml
    coder.duplication.{no-structurally-identical-typescript,no-intra-layer-code-python,no-intra-layer-code-typescript}.convention.yaml
    coder.frontend.{arrow-function-with-a,function-or-function-expression,empty-fragment-return-or,self-closing-or-empty,conditional-whose-every-branch,negative-rule-a-guarded,trainid-not-registered-in,resolved-train-lists-wagon,trainid-expression-not-statically}.convention.yaml
    coder.green.runtime-declaration-runtime-python.convention.yaml
    coder.presentation.{gsap-layer,gsap-commons,i18n-config,i18n-switcher}.convention.yaml
    coder.refactor.{complexity-*,quality-*,nplus1}.convention.yaml   # 16 detector nodes
    coder.security.{fastapi-routes-must-have,missing-auth,no-hardcoded-secrets-aws,no-innerhtml-or-dangerouslysetinnerhtml}.convention.yaml
  implementations/             # one dir per detector, mirror github implementations/<name>/
    <name>/atdd.implementation.yaml   # targets_workspace: <PYP|TS|DF|SB|FA>, realizes_convention: <rule_id>, entrypoint
    <name>/<logic>.py
    <name>/test_<logic>.py
  relationships.yaml           # extension-LOCAL edges only (dedup links: design.hierarchy-import → dependency-flow; complexity-*-typescript refines complexity-*)
```
Registry entry: `registry/entries/atdd.extension.coder.yaml` + add to `registry/registry.yaml`.

## 2.2 `atdd.extension.tester` *(NEW extension — owns all tester EXT conventions)*

```
official/atdd.extension.tester/
  atdd.extension.yaml          # role: tester, depends_on.workspaces[python-pytest,typescript,supabase,fastapi]
  README.md
  conventions/
    tester.filename.urn.convention.yaml
    tester.migration.naming.convention.yaml
    tester.routing.path.convention.yaml
    tester.smoke.pres.convention.yaml
    tester.smoke.train-mounts-but-the.convention.yaml
    tester.smoke.train-mounts-but-the-1.convention.yaml
    tester.contract.persistence-binding.convention.yaml      # from contract.persistence_traceability (synth id)
    tester.contract.api-structure.convention.yaml            # from contract.api_structure (synth id)
  implementations/<name>/{atdd.implementation.yaml,*.py,test_*.py}
  relationships.yaml
```
Registry entry: `registry/entries/atdd.extension.tester.yaml`.

## 2.3 NEW workspace runtimes (mirror `atdd.workspace.python-pytest/`)

Each owns ZERO conventions — adapter + conformance + runtime only:
```
official/atdd.workspace.<id>/
  atdd.workspace.yaml          # workspace_id, contract version
  adapter/discover.py
  adapter/run.py
  conformance/test_provider_contract.py
  runtime/<manifests>
  README.md
```
| Workspace | Hosts implementations for | Status |
|---|---|---|
| `atdd.workspace.python-pytest` | Python+pytest detectors (complexity/quality/dup/dead-code/perf/secret-scan, xlang hosts, filename mechanics, metric compute(), skip-detect, AST isolation scan) | **EXISTS** |
| `atdd.workspace.typescript` | TS/React/Preact: JSX no-stub AST, fetch http-client, GSAP, i18n, innerHTML, TS complexity/quality/dup/dead-code, preact-DOM render smoke | **NEW** |
| `atdd.workspace.dart-flutter` | Dart/Flutter design-system: token/primitive/foundations/hierarchy detectors, EdgeInsets/Color literals, Dart DTOs | **NEW** |
| `atdd.workspace.supabase` | Supabase/Deno/Postgres: migration table-naming + SQL/JSONB, persistence traceability, supabase perf chains | **NEW** |
| `atdd.workspace.fastapi` | FastAPI/HTTP-REST: route-auth (Depends), Station-Master DI, api_structure ops/status | **NEW** |

## 2.4 Existing/other extensions
| Package | Rules it receives | Status |
|---|---|---|
| `atdd.extension.github` | `smoke.ci_integration` (validate-smoke GH Actions job, SMOKE_BASE_URL, Playwright) — the ONLY true `extension`-class (platform) row | **EXISTS** (add 1 convention) |
| `atdd.extension.consumer-stack` | `technology.convention` stack tree (Supabase/Flutter/Gun.js/Sentry/PostHog defaults + costs/SLAs) | **NEW** |

---

# 3. AUTHORING-MECHANISM FINDING (#1098)

**CORRECTED 2026-06-26.** The earlier draft of this section claimed the CLI was
"too thin" and that nodes must be hand-authored. **That was wrong** — it was based
on reading the STALE `author.py` in the divergent local-`main` worktree (3.133.2),
not the real CLI. Verified against the actual installed CLI (`atdd author
convention-node --help`, 3.134.0+):

**`atdd author convention-node` ALREADY emits the full 15-field v1.1.0 schema.** It
exposes flags for every group: `--name`, `--statement`, `--rationale`, `--note`,
`--term`, `--kind`, `--status`, `--implementation` (JSON `{type, ref}`), `--content`
(JSON summary/normative_text/operational_guidance/examples/counter_examples/
constraints/exceptions/fix_hint), `--bidirectional` (JSON array), `--metadata`
(JSON aliases/severity/disposition/introduced_in/suppression_deadline),
`--node-source` (JSON legacy_path/legacy_section/legacy_rule_id/legacy_sha/
extraction_mode), `--parity` (JSON), plus targeting flags `--core` / `--extension
<pkg>` / `--role`, and `--family`/`--template` to scaffold a convention-graph variant.

**Authoring mechanism (compliance-by-construction, available NOW — not blocked on any CLI work):**

- **Phase A (core nodes):** `atdd author convention-node --core --role {coder,tester}
  --rule-id <id> --name … --statement … --metadata '{…}' --content '{…}'
  --node-source '{…}' --parity '{…}' [--implementation '{…}']`. No publisher
  namespace ⇒ no guard. This is the path for core atomization.
- **Phase B (extension nodes in this repo):** the public authoring path **refuses**
  the reserved `atdd` publisher (`atdd author rejected input: the 'atdd' publisher
  is reserved for official ATDD packages`). Guard lives in
  `author_context.py::_validate_package_id(..., allow_reserved=False)` — it stops
  END USERS claiming `atdd.*`, while structural validation of an already-official
  manifest passes `allow_reserved=True`. Since `atdd.extension.coder/tester` are
  **official** packages (like `atdd.extension.github`), Phase B node authoring uses
  the **official-maintainer path** for `atdd.*` (the same way github's official nodes
  were created), NOT the end-user `atdd author --extension` invocation. Exact
  maintainer invocation/bypass to be confirmed before Phase B authoring.

The interface is flag + JSON (nested schema groups passed as JSON objects), not a
single node-file input; output is schema-validated either way (compliance-by-construction).

---

# 4. COMPRESSION / ATOMIZATION CHECK

**1 rule = 1 node — confirmed from the precedent.** `atdd.extension.github` has 14
conventions, 14 node files, 14 relationship `nodes:` entries, 5 implementations
(several nodes are documentation-only, no impl) — a clean 1 rule : 1 node mapping,
with implementations as a separate many-to-some layer. The migration must preserve
this: one `<rule_id>.convention.yaml` per atomic assertion.

**Already atomic (good models, migrate near-1:1):**
- `tester.acceptance-violation.*` — 9 discrete rules, each one assertion → 9 nodes.
- Most `coder.refactor.complexity-*` / `quality-*` — each a single metric → 1 node each.
- `coder.security.*`, `coder.presentation.gsap-*/i18n-*`, `coder.frontend.*` JSX detectors — each one detector → 1 node.

**Bundles that MUST be split (multiple distinct assertions under one id/section):**
- `coder.refactor` RP-01..RP-04 = four assertions in one block (preserve behavior /
  no new behavior without tests / no test changes / enforce dependency rules) → 4 nodes.
- `green.convention` GP-*/GR-*/SH-DL-DC-AP-* protocol kernel is one monolith bundling
  thinnest-slice + side-effects-behind-ports + pure-core + no-globals + basic-security
  + schema-validation + deferral/exit policy → ~8–10 core nodes (synthesize ids).
- `coder.green.component-urn-*` 9 segment checks are individually atomic but collectively
  redirect to planner — author **zero** core nodes here (legacy_redirect), don't split into 9.
- `composition.principle` bundles "every file has a consumer" + "root reaches all layers"
  + "existing-layers-only" → 3 nodes.
- `contract.convention` core block bundles 5 distinct principles → 5 nodes.

**Too-granular / must DEDUP to one node (registry mirrors — do NOT emit twice):**
- `coder.logging.print` ↔ `coder.logging.no-print-calls-in`; `coder.logging.structured`
  ↔ `coder.logging.logger-calls-must-include` — same principle, mirror block → 1 node each.
- `coder.security.sql-injection` ↔ `coder.security.no-raw-sql-string`;
  `coder.security.xss`/`hardcoded-secret` mirror the SPEC-SEC detectors → collapse to 1 core node per principle.
- `coder.design` DS-01..07 structured block ↔ the `canonical_rules` mirror
  (primitives/token-color/…) — the **principle** is one core node; the **detector mirror**
  is one EXT/dart-flutter node — never two core nodes.
- `-python` / `-typescript` pairs (duplication, dead-code, complexity, quality): these
  are the **same principle realized twice**. In core: ONE agnostic node. In extensions:
  the Python detector → PYP node, the TS detector → TS node — legitimately two EXT nodes
  in two packages, NOT a core duplication.
- Cross-cutting SHARED core nodes (author ONCE, reference via edges): inward
  dependency-direction (backend/commons/composition/train) and no-cross-wagon-imports
  (boundaries/design/dto/train) — each principle = exactly one core node.

---

# 5. OPEN DECISIONS (for the human overseer)

1. **Convention owner vs runtime target (structural).** The github precedent puts
   conventions in an `atdd.extension.*` and uses a workspace purely as an
   implementation runtime. The core plan's prose routes rules "to
   `atdd.workspace.python`/`react`/`flutter`…", which would put conventions *in*
   workspaces — contradicting the precedent. **Recommendation:** honor the precedent
   — convention nodes live in `atdd.extension.coder` / `atdd.extension.tester`;
   `atdd.workspace.{python-pytest,typescript,dart-flutter,supabase,fastapi}` host
   only implementations. Confirm this two-layer model before authoring.

2. **One coder/tester extension each, or per-stack extensions?** Alternative to 5.1:
   split by stack (`atdd.extension.coder-typescript`, `atdd.extension.coder-flutter`, …).
   **Recommendation:** one `atdd.extension.coder` + one `atdd.extension.tester`
   (cohesive role packages, like github is one platform package), with implementations
   fanning out to multiple workspace runtimes. Decide before scaffolding.

3. **`atdd.workspace.fastapi` vs folding HTTP-REST into `python-pytest`.** Route-auth
   + Station-Master DI + api_structure could be a dedicated `fastapi` runtime or live
   under `python-pytest`. **Recommendation:** separate `atdd.workspace.fastapi`
   (FastAPI ≠ pytest; keeps python-pytest a pure test runtime). Confirm.

4. **`atdd.extension.consumer-stack` ownership.** The technology stack tree
   (Supabase/Flutter/Gun.js/Sentry costs+SLAs) is product-specific, not a reusable
   runtime. Is it an `atdd.extension.*` in this repo, or does it belong in a downstream
   consumer repo entirely? **Recommendation:** record as a NEW extension here but flag
   as the lowest-priority / possibly out-of-scope (product-coupled).

5. **`tester.smoke.harness-subprocess-failed-crash` classification.** Marked CA (a
   crashed harness subprocess must surface as RED = fidelity invariant), but the
   subprocess model may be pytest-specific. **Decision needed:** CA principle + PYP
   detector, or fully EXT/PYP? **Recommendation:** CA principle, peel detector to PYP.

6. **Core-side dedup is a precondition.** The SHARED core nodes (dependency-direction,
   no-cross-wagon) and registry-mirror collapses (§4) are a *core* atomization concern
   (core plan Slice 2), not this repo's. This migration must reference the deduped core
   node ids, so it is **sequenced after** core atomization lands those ids. Confirm the
   core ids before authoring extension edges that target them.

7. **xlang-* host runtime.** `coder.boundaries.xlang-{entity,enum,contract}` are
   cross-language parity detectors (python↔dart↔ts). Provisionally hosted on PYP.
   **Decision:** keep on python-pytest, or create a dedicated cross-language workspace?
   **Recommendation:** PYP host initially; revisit if dart/ts adapters need to drive it.

---

# Review Log

## Pass 1 — COMPLETENESS

Method: enumerated every canonical dotted `rule_id` via
`grep -rhoE 'id:\s*"?(coder|tester)\.[a-z0-9-]+\.[a-z0-9-]+"?'` over the source
convention files, deduped, then cross-checked each file's non-dotted sections.

**Coder totals:** 104 dotted rule_ids across 22 convention files, by file —
backend 3, boundaries 5, commons 3, coverage 2, dead-code 2, design 12, dto 3,
duplication 4, error-response 2, frontend 12, green 10, logging 5, performance 1,
presentation 7, refactor 19, security 8, technology 3, train 3. Plus 2 files with
no dotted rule_ids (composition, component-naming) captured at section level.
Sum check: 3+5+3+2+2+12+3+4+2+12+10+5+1+7+19+8+3+3 = **104**. ✔ each appears exactly
once in §1A.

**Tester totals:** 30 dotted rule_ids — acceptance-violation 9, coverage 4,
filename 1, migration 1, red 2, routing 1, security 2, smoke 7, telemetry 1,
test-isolation 1, train 1. Plus 2 files with no dotted rule_ids (contract, artifact)
captured at section level. Sum check: 9+4+1+1+2+1+2+7+1+1+1 = **30**. ✔ each appears
exactly once in §1B.

**Grand total: 134 dotted rule_ids + 4 no-dotted-id files**, all present, none
duplicated, none missed. Recipe files (`*.recipe.yaml`, `verification.protocol.yaml`)
carry no `coder./tester.`-dotted rule_ids; their content is CA protocol (per the core
plan) and is out of this migration's extension scope — noted, not tabled per-rule.

## Pass 2 — CORRECTNESS

Re-judged each call against the strict test: **core-agnostic only if the rule as
written has NO language/runtime/tool/platform dependency.** Fixes/confirmations made:

- **`-typescript` / `-python` / fastapi / aws / innerhtml / gsap / i18n suffixed ids:**
  all confirmed EXT — the stack is in the rule id itself. (complexity/quality/dup/
  dead-code typescript variants, security fastapi/aws/innerhtml, presentation gsap/i18n.)
- **Principle vs detector (the dominant split):** ids like `coder.dead-code.reachability`,
  `coder.duplication.no-structurally-identical-code`, `coder.performance.perf`,
  `coder.logging.*`, `coder.security.{xss,sql-injection,hardcoded-secret,no-raw-sql-string}`,
  `tester.test-isolation.*`, `tester.telemetry.emit`, `tester.acceptance-violation.{metric,live-smoke}`
  — kept **CA** (statement is agnostic) with the detector body explicitly peeled to a
  runtime. This is the only defensible reading: the assertion is universal, the matcher
  is not.
- **Reclassified toward EXT on closer reading:** `coder.boundaries.http-client` (React
  fetch realization, not the agnostic centralized-client principle); `tester.filename.urn`
  and `tester.routing.path` (both sit in per-runtime sections that bake in
  python/supabase/web paths — EXT, while their parent principles stay CA);
  `coder.green.runtime-declaration-runtime-python` (runtime: python literal).
- **Held as CA against temptation:** `coder.boundaries.xlang-naming` (planner naming
  authority, not a stack tie); all `coder.green.component-urn-*` (URN grammar → planner);
  `tester.red.naming` (header grammar → filename/planner); `coder.technology.*` governance
  rules (the *stack tree* migrates, the govern-the-choice rule does not).
- **Borderline flagged, not silently resolved:** `tester.smoke.harness-subprocess-failed-crash`
  (Open Decision 5); `coder.security.missing-auth` (FastAPI today, neutral principle is a
  design_candidate) — classified EXT/FA with the caveat recorded.

No misclassification left unresolved; every EXT row names a concrete stack hook in its
rationale, every CA row asserts the absence of one.

## Pass 3 — CONSISTENCY

Checked structure against `atdd.extension.github` and against the workspace precedent:

- **No core-style family templates.** The core repo organizes by monolithic
  `*.convention.yaml` + `nodes/`; github organizes by flat `conventions/<rule_id>.convention.yaml`
  + `implementations/<name>/` + `relationships.yaml` + `atdd.extension.yaml` + registry entry.
  §2 specifies the github shape exactly (conventions + implementations + manifest +
  relationships + registry), with NO `*.recipe.yaml` / family-template carryover.
- **Two precedent shapes respected.** Convention-owning packages mirror
  `atdd.extension.github/`; runtime packages mirror `atdd.workspace.python-pytest/`
  (adapter/discover.py+run.py, conformance/, runtime/, atdd.workspace.yaml — zero
  conventions). The conflation in the core plan's wording is raised as Open Decision 1
  rather than propagated.
- **Compression matches precedent.** §4 confirms 1 rule = 1 node = 1 relationships
  entry (github exhibits exactly this), flags the multi-assertion bundles to split
  (RP-01..04, green kernel, composition, contract) and the registry mirrors to dedup
  (logging/security/design, -python/-typescript pairs, shared dependency-direction /
  no-cross-wagon nodes). Implementations remain a separate many-to-some layer, as in
  github (5 impls for 14 nodes).
- **Manifest fields covered.** §2.1/2.2 enumerate `extension_id`, `role`,
  `owns{conventions,relationships,implementations}`, `depends_on.workspaces`, and the
  registry wiring — matching `atdd.extension.github/atdd.extension.yaml`.

Consistent. No core-isms leaked into the proposed extension structure.

DESIGN PASS COMPLETE
