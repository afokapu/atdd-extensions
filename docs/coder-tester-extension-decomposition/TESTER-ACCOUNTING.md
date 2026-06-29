# Tester Decomposition — Full Row Accounting (extension + workspace half)

> Proof-of-completeness for the **tester EXTENSION / WORKSPACE** half of the
> tester convention decomposition (branch `tester-extension-atomize`). The CORE
> half (47 `core` rows → 22 consolidated CORE obligation nodes) was done in the
> core slice and stays on core main; this slice closes the **`extension` (1)** +
> **`workspace` (10)** rows, **verifies the 13 `legacy_redirect`** owners, and
> **defers the 2 `design_candidate`** rows.
>
> Source of truth: `atdd/main/docs/tester-convention-decomposition-plan.md`
> (read-only). Legacy rule wording read via `git show origin/main:src/atdd/tester/
> conventions/<file>` on core main. Nothing in core was modified.

## Buckets & counts

| Bucket | Count | This slice's action |
|--------|------:|---------------------|
| `core` | 47 | Owned by the CORE slice (22 consolidated nodes on core main). Out of scope here; listed for completeness. |
| `extension` | 1 | **Flagged** — the one `extension` row targets `atdd.extension.github`, **not** `atdd.extension.tester` (see Flags). |
| `workspace` | 10 | **2 fully authored** (node+detector+e2e), **1 partial** (ext doc-only node; detector deferred to a not-yet-built workspace), **7 routed/stale** (flagged with destination). |
| `legacy_redirect` | 13 | **12 VERIFIED** (10 owner-found + 2 verified-drop), **1 UNRESOLVED** (`tester.routing.path` — flagged loudly). |
| `design_candidate` | 2 | Deferred (recorded, nothing authored). |
| **Total** | **73** | |

## What was AUTHORED in this slice

**Extension obligation nodes** — `official/atdd.extension.tester/conventions/`
1. `tester.filename.urn` — validator; the per-stack test-FILENAME rendering of a
   test's acceptance/test URN. `implementation.ref: tester.filename.urn`.
2. `tester.migration.naming` — **doc-only** (no `implementation`); migration tests
   named after & colocated with their migration. Enforcing detector is a
   PostgreSQL/Supabase concern → deferred to `atdd.workspace.supabase`.

**Workspace detectors** — `official/atdd.workspace.python-pytest/implementations/`
1. `pytest_test_filename_detector/` (impl id `tester.filename.urn`) — realizes the
   **extension** node above. Flags intended test files (URN header or top-level
   `def test_*`) that are not pytest-collectable. e2e: `prove_pytest_test_filename.py`.
2. `metric_implementation_detector/` (impl id
   `tester.acceptance-violation.metric-implementation-must-exist`) — realizes the
   **CORE** node of the same id (the `metric-implementation.recipe` workspace row).
   Flags a declared `signal.metric` with no backing `compute()`/`passes()` module
   in the two-root lookup. e2e: `prove_metric_implementation.py`.

**Edges** — `docs/coder-tester-extension-decomposition/tester-ext-edges.yaml`
(no-orphan: both authored ext nodes carry ≥1 edge).

---

## Per-row table (every legacy tester row)

Legend: ✅ done · 🟡 partial · 🚩 flag · ▶ routed elsewhere · ⏸ deferred

### red.convention.yaml
| # | source_section | class | disposition / outcome |
|---|----------------|-------|-----------------------|
| R1 | assertion_classification | core | core-slice (`tester.red.behavioral-assertion-required`) |
| R2 | red_patterns / fails-first | core | core-slice (`tester.red.test-must-fail-first`) |
| R3 | contract_schema_validation | core | core-slice (`tester.red.contract-schema-first-assertion`) |
| R4 | mock_discipline | core | core-slice (`tester.red.spec-enforced-test-doubles`) |
| R5 | architecture / intent_structure | design_candidate | ⏸ deferred (generator-internal; no agnostic rule text) |
| R6 | harness_classification … handoff | workspace | ▶ **not authored here** — generator-internal + MULTI-RUNTIME (dart/ts/go/java/kotlin route to their own workspace pkgs). The python-pytest-relevant kernel is subsumed by CORE filename placement + the authored `tester.filename.urn`. Residual = pure generator scaffolding → decommission. |
| R7 | runtime_placement.header_documentation / file_patterns / `tester.red.naming` | legacy_redirect | 🚩→✅ VERIFIED — owner: planner URN authority (`planner.acceptance.urn-generation`, `planner.artifact-naming.urn-structure`) + `filename.convention` (now the authored `tester.filename.urn`). |

### smoke.convention.yaml
| # | source_section | class | disposition / outcome |
|---|----------------|-------|-----------------------|
| S1 | purpose / testing_pyramid | core | core-slice |
| S2 | lifecycle | core | core-slice |
| S3 | rules (must/must_not) | core | core-slice |
| S4 | coverage | core | core-slice |
| S5 | collaborator_substitution_rules | core | core-slice — CORE node `tester.smoke.no-collaborator-substitution`; detector already in workspace (`no_collaborator_substitution_detector`, core slice). |
| S6 | feedback_loop | core | core-slice |
| S7 | synthetic_fixture_anti_patterns | core | core-slice (`tester.smoke.operator-observable-assertion`, `…cross-component-handoff-gap`) |
| S8 | file_structure … presentation_smoke_rules | workspace | ▶ **not authored here** — preact/`.tsx`-bound (mount-train.mjs render harness) → routes to `atdd.workspace.typescript` (**not yet built**). NOT decommission-ready. |
| S9 | ci_integration | **extension** | 🚩 **MIS-TARGETED for this slice** — belongs to `atdd.extension.github` (validate-smoke GH Actions job, SMOKE_BASE_URL secret, dorny/paths-filter, Playwright/Chromium), NOT `atdd.extension.tester`. See Flags. |
| S10 | header / planner.smoke.* blocks | legacy_redirect | ✅ VERIFIED — owner: `planner.feature.feedback-loop-close-the-loop`, `planner.feature.feedback-loop-suppression`. |

### acceptance-violation.convention.yaml — all 9 `core` (core-slice)
measurable · declare-phase · disposition-must-not-be-declared · validator-binding-bidirectional ·
security-rule-acceptance-ref-resolved · **metric-implementation-must-exist** · hermetic-fake-contract ·
hermetic-live-smoke-paired · live-smoke-must-execute.
> Note: `metric-implementation-must-exist` (CORE) is the obligation that this
> slice's `metric_implementation_detector` realizes (its mechanism row is the
> `metric-implementation.recipe`, RC9 below).

### contract.convention.yaml
| # | source_section | class | disposition / outcome |
|---|----------------|-------|-----------------------|
| C1 | agent_responsibilities | core | core-slice |
| C2 | schema_structure | core | core-slice |
| C3 | composite_contracts | core | core-slice |
| C4 | contract_versioning | core | core-slice |
| C5 | artifact_metadata + validation | core | core-slice |
| C6 | persistence_traceability / api_structure / generation_workflow / enforcement | workspace | ▶ **not authored here** — api_structure = REST/HTTP → `atdd.workspace.http-rest`/`fastapi` (**not built**) and overlaps the existing coder `contract_driven_http_detector`; persistence = JSONB/Supabase → `atdd.workspace.supabase` (**not built**); generation/enforcement = stale pytest plumbing. Plan explicitly says *resist core promotion*. NOT decommission-ready. |
| C7 | naming_authority / directory_structure / removed_concepts / references | legacy_redirect | ✅ VERIFIED — owner: `planner.artifact-naming.*` (`contract-file-mapping`, `logical-physical-mapping`, `naming-pattern`). |

### artifact.convention.yaml
| # | source_section | class | disposition / outcome |
|---|----------------|-------|-----------------------|
| A1 | ownership | core | core-slice (`tester.artifact.producer-owns-consumers-reference`) |
| A2 | naming / versioning / … / examples | legacy_redirect | ✅ VERIFIED — header says "Aligned with canonical artifact-naming v2.1"; owner: `planner.artifact-naming.*`. |

### filename.convention.yaml
| # | source_section | class | disposition / outcome |
|---|----------------|-------|-----------------------|
| F1 | test_file_header | core | core-slice (`tester.filename.test-carries-urn-identity`) |
| F2 | feature_discovery / acceptance_to_feature_mapping | core | core-slice (`tester.filename.test-placed-in-owning-feature`) |
| F3 | slug_transformations / languages / pytest `test_` prefix / `tester.filename.urn` | workspace | ✅ **AUTHORED** — ext node `tester.filename.urn` + `pytest_test_filename_detector` + `prove_pytest_test_filename.py`. (Per-language dart/ts/go/java/kotlin renderings route to their own workspace pkgs — python only here.) |
| F4 | urn_format / references | legacy_redirect | ✅ VERIFIED — owner: `planner.acceptance.urn-generation`, `planner.artifact-naming.urn-structure`. |

### migration.convention.yaml
| # | source_section | class | disposition / outcome |
|---|----------------|-------|-----------------------|
| M1 | validation (coverage / todos / type_mapping) | core | core-slice (`tester.migration.persistent-contract-requires-backing-store`) |
| M2 | workflow / table_naming / … / `tester.migration.naming` | workspace | 🟡 **PARTIAL** — ext **doc-only** node `tester.migration.naming` authored; enforcing detector is Supabase-specific → deferred to `atdd.workspace.supabase` (**not built**). Obligation captured; enforcement blocked on the supabase workspace. |
| M3 | changelog_v1_1 / references | legacy_redirect | ✅ VERIFIED-DROP — changelog metadata + external Supabase doc pointers; no owner node needed, safe to drop. |

### coverage.convention.yaml
| # | source_section | class | disposition / outcome |
|---|----------------|-------|-----------------------|
| CV1 | every-acceptance-criterion-must | core | core-slice (`tester.coverage.every-acceptance-has-test`) |
| CV2 | bidirectional-coverage-between-contracts | core | core-slice |
| CV3 | bidirectional-coverage-between-telemetry | core | core-slice |
| CV4 | tracking-manifest / coverage_graph / exception_handling | core | core-slice |
| CV5 | test_discovery | workspace | ▶ **not authored here** — python/supabase/dart discovery mechanics; subsumed by the authored `tester.filename.urn` (pytest naming) + CORE coverage nodes. Per-runtime split; residual → decommission. |
| CV6 | rollout | legacy_redirect | ✅ VERIFIED-DROP — stale Phase-2 strictness note; disposition now walker-set by the substrate. |

### security.convention.yaml
| # | source_section | class | disposition / outcome |
|---|----------------|-------|-----------------------|
| SE1 | SPEC-TESTER-SEC-0001 | core | core-slice (`tester.security.secured-ops-declare-auth-headers`) |
| SE2 | SPEC-TESTER-SEC-0002 | core | core-slice |
| SE3 | SEC-0003 / `tester.security.auth` / `tester.security.input` | core | core-slice — CORE nodes `tester.security.auth`, `tester.security.input`. |
| SE4 | SEC-0004 / sensitive_data_detection | core | core-slice |
| SE5 | enforcement / references | workspace | ▶ **DECOMMISSION** — `ATDD_SECURITY_ENFORCE` + pytest.xfail plumbing; plan: *"doubly stale — disposition now walker-set; decommission candidate, not just relocation."* Nothing authored (correct). |
| SE6 | threat_modeling / acceptance_coverage | legacy_redirect | ✅ VERIFIED — owner: `planner.acceptance.*` (abuse_cases schema) + CORE `tester.acceptance-violation.security-rule-must-have-acceptance-ref-resolved`. |

### telemetry.convention.yaml
| # | source_section | class | disposition / outcome |
|---|----------------|-------|-----------------------|
| T1 | `tester.telemetry.emit` | core | core-slice — CORE node `tester.telemetry.emit`. |
| T2 | schema / required_fields / id_vs_urn / artifact_naming_grammar | legacy_redirect | ✅ VERIFIED — owner: `planner.acceptance.signal-telemetry-naming` + `planner.artifact-naming.*` + CORE `tester.coverage.bidirectional-coverage-between-telemetry`. |
| T3 | metrics_by_plane / data_sources / thresholds | design_candidate | ⏸ deferred (illustrative catalogs + TODO placeholders). |
| T4 | tracking_structure.validation / validation_levels / testing | workspace | ▶ **not authored here** — python validator mechanics; subsumed by CORE `tester.telemetry.emit` + the T2 redirects. Residual → decommission. |

### routing.convention.yaml
| # | source_section | class | disposition / outcome |
|---|----------------|-------|-----------------------|
| RT1 | test_routing_rules / routing_examples | core | core-slice (`tester.routing.layer-keyword-taxonomy`) — ⚠️ **no `tester.routing.*` node found in the migrated core set** (see Flags). |
| RT2 | `tester.routing.path` | legacy_redirect | 🚩 **UNRESOLVED** — classified `legacy_redirect` but the reason describes *workspace* ("bakes in concrete runtimes — workspace, not agnostic") and names **no planner owner**. Its agnostic-taxonomy sibling (RT1) is also absent from core. **NOT safe to delete the legacy routing rule.** |

### train.convention.yaml
| # | source_section | class | disposition / outcome |
|---|----------------|-------|-----------------------|
| TR1 | journey_tests.urn_format / required_header / harness | core | core-slice (`tester.train.journey-test-header`) |
| TR2 | mutual_exclusion / validation_rules / `tester.train.coverage` | core | core-slice — CORE node `tester.train.coverage`. |
| TR3 | journey_tests.file_locations | workspace | ▶ **not authored here** — `e2e/{train_id}/` path globs owned by the CORE train header obligation; residual = path mechanics → decommission. |

### test-isolation.convention.yaml
| # | source_section | class | disposition / outcome |
|---|----------------|-------|-----------------------|
| TI1 | `tester.test-isolation.no-polluting-patterns` | core | core-slice — CORE node `tester.test-isolation.no-polluting-patterns`; detector already in workspace (`no_polluting_patterns_detector`, core slice). |

### recipes (9)
| # | recipe | class | disposition / outcome |
|---|--------|-------|-----------------------|
| RC1 | acceptance-test-headers | core | core-slice (`tester.acceptance-test-headers.bidirectional-binding`) |
| RC2 | hermetic-integration-contract | core | core-slice |
| RC3 | hermetic-live-smoke-pairing | core | core-slice |
| RC4 | live-smoke-execution | core | core-slice — detector already in workspace (`live_smoke_execution_detector`, core slice). |
| RC5 | security-acceptance-binding | core | core-slice |
| RC6 | acceptance-measurability | legacy_redirect | ✅ VERIFIED — owner: CORE `tester.acceptance-violation.acceptance-must-be-measurable` + `planner.acceptance.authoring-guidelines`. |
| RC7 | acceptance-phase | legacy_redirect | ✅ VERIFIED — owner: CORE `tester.acceptance-violation.acceptance-must-declare-phase` + phase_machine canon. |
| RC8 | acceptance-rule-block | legacy_redirect | ✅ VERIFIED — owner: CORE `tester.acceptance-violation.disposition-must-not-be-declared` + substrate (walker-set). |
| RC9 | metric-implementation | workspace | ✅ **AUTHORED** — `metric_implementation_detector` realizes CORE `tester.acceptance-violation.metric-implementation-must-exist` + `prove_metric_implementation.py`. |

---

## 🚩 Flags (do not silently fix — raised for the overseer)

1. **The one `extension` row is mis-targeted for this slice (S9 `smoke.ci_integration`).**
   It is classified `extension` but its `target_package_id` is **`atdd.extension.github`**
   (GH Actions validate-smoke job, SMOKE_BASE_URL secret, dorny/paths-filter,
   Playwright/Chromium) — a GitHub-CI concern, **not** a tester-stack obligation.
   It does **not** belong in `atdd.extension.tester`. Recorded, not authored here;
   the `atdd.extension.github` package (which exists) should own it. **This is why
   `atdd.extension.tester` had zero `extension`-classified rows to author** — the
   stack-bound tester obligations this slice authored come from the **`workspace`**
   rows (per DESIGN §1B/§2.2: the tester extension owns "test filename mechanics,
   Postgres/Supabase migration naming, … contract bindings").

2. **`tester.routing.path` (RT2) is UNRESOLVED.** Classified `legacy_redirect`, but
   the reason text describes a *workspace* concern and names no planner owner, and
   its agnostic-taxonomy sibling `tester.routing.layer-keyword-taxonomy` (RT1) is
   **absent from the migrated core node set** (`git ls-tree origin/main … tester/
   conventions/nodes/` shows no `tester.routing.*`). Until either a core routing
   taxonomy node or a python-pytest routing detector exists, the legacy routing
   rule is **NOT safe to delete**.

3. **Several `core` candidate_rule_ids have no 1:1 node in the migrated core set.**
   The core slice consolidated 47 rows → 22 nodes, so some folded — expected. But
   `tester.red.*`, `tester.filename.*`, `tester.contract.*`, and `tester.routing.*`
   candidate ids do not appear as standalone nodes on core main. Verifying the core
   1:1 mapping is **core-slice scope**, not this slice; noted because it gates the
   full decommission of `red`, `filename`, `contract`, and `routing` legacy files.

## Decommission-readiness

| Legacy file | Ready? | Blocker |
|-------------|:------:|---------|
| acceptance-violation, coverage, security(SE1-4), train, test-isolation, smoke(core), recipes(RC1-8) | ✅ (core-slice) | core nodes own them; redirects verified |
| **filename.convention.yaml** | ✅* | F3 authored, F4 verified; *pending core F1/F2 node confirmation (flag 3) |
| **migration.convention.yaml** | 🟡 | M2 obligation node authored; **detector blocked on `atdd.workspace.supabase`** |
| security.convention.yaml (SE5) | ✅ | SE5 is a decommission candidate (stale) — nothing to relocate |
| smoke.convention.yaml (S8), contract.convention.yaml (C6) | ❌ | workspace rows route to **unbuilt** `atdd.workspace.typescript` / `http-rest` / `supabase` |
| **routing.convention.yaml** | ❌ | RT2 UNRESOLVED + RT1 core node missing (flag 2) |
| telemetry (T4), coverage (CV5), red (R6), train (TR3) | ✅* | subsumed by CORE + authored nodes; residual is pure mechanics → decommission |

## Verification

- New unit suites: `pytest_test_filename_detector` (11) + `metric_implementation_detector` (10) — green.
- New e2e: `prove_pytest_test_filename.py`, `prove_metric_implementation.py` — exit 0.
- `pytest official/atdd.workspace.python-pytest/conformance/ implementations/ -q` → **216 passed**.
- Pre-existing, out-of-scope: `e2e/prove_logging_print.py` fails on the base branch
  (its coder logging fixture has 2 prints but the proof asserts 1) — unmodified by
  this slice.
