# Convex ↔ Core Convention Parity Matrix (full, atomic — no grouping)

> **STATUS: BUILT (2026-07-01).** All 34 nodes (30 MIRROR/NATIVE/tester + 4 prior)
> are authored — convention nodes generated via `atdd author` (normalized to schema
> 1.1.0), validators hand-built. 132 conformance tests pass; both extensions + the
> workspace pass `atdd validate package` (schema + no-orphan graph + composition).

**Goal:** mirror every Core `atdd.extension.coder` (48) + `atdd.extension.tester` (2)
convention into the Convex TS use case at **the same atomic granularity and node
detail as Core** — full decomposition, atomization, graph relationships, and
convention-node body. No node is grouped or approximated. Each in-scope Core rule
becomes exactly ONE atomic Convex node (`coder.convex.*` / `tester.convex.*`) with
its own convention YAML **and** its own validator/detector under
`convex.workspace.runtime/implementations/`.

**Detector runtime decision (this wave):** zero-dependency Node ESM detectors
(regex/heuristic over source), matching Phase 0 and Core's own method (Core enforces
its TS rules with Python regex-over-source — no TS runtime). A future AST upgrade can
raise fidelity without changing the v1.1 contract.

**Fidelity rule for authors:** each Convex node MUST be adapted from its Core source
node (path given per row) and preserve Core's depth — `statement`,
`content.summary/normative_text/fix_hint/exceptions`, `metadata`
(severity/disposition/aliases), and `terms`. Mirror Core's severity + disposition
unless the Convex semantics demand otherwise (noted per row).

Legend — **Class:** `MIRROR` (build a Convex node, bucket A) · `NATIVE` (Convex-only,
no Core equivalent) · `FRONTEND` (Vite/React — belongs in a future
`atdd.extension.vite-coder`, NOT convex-coder) · `N/A` (not meaningful for a
single-language Convex backend, with reason).

---

## 0. Status of what already exists (4 nodes, done)
| node | class | status |
|---|---|---|
| `coder.convex.no-server-console-log` | MIRROR (logging.print) | ✅ active |
| `coder.convex.schema-at-root` | NATIVE | ✅ active |
| `coder.convex.http-router-at-root` | NATIVE | ✅ active |
| `tester.convex.filename-urn` | MIRROR (tester.filename.urn) | ✅ active |

---

## 1. CODER — full per-rule decision (all 48 Core rules)

### MIRROR → build now (atomic, one Convex node each)
| Core rule (source node to adapt) | Convex node | sev | disp | Validator checks | Worker |
|---|---|---|---|---|---|
| security.missing-auth | `coder.convex.security-missing-auth` | 4 | strict | exported query/mutation/action whose handler reads `ctx.db` but never references `ctx.auth`/`getUserIdentity` | W1 |
| security.hardcoded-secret | `coder.convex.security-hardcoded-secret` | 4 | strict | secret-shaped string literals (`sk_`, `AKIA`, long hex/base64, `Bearer `) in convex source; require `process.env` | W1 |
| error-response.bare-string | `coder.convex.error-response-bare-string` | 4 | strict | `throw "..."` or `throw new Error('plain')` in server code; require `ConvexError`/coded error | W1 |
| error-response.code-format | `coder.convex.error-response-code-format` | 4 | strict | `ConvexError({code})` / error code string matches canonical `SCREAMING_SNAKE` / dotted format | W1 |
| refactor.nplus1 | `coder.convex.nplus1-db-in-loop` | 3 | strict | `ctx.db.get`/`ctx.db.query` inside `for`/`while`/`.map(`/`.forEach(` (N+1 over Convex docs) | W2 |
| logging.structured | `coder.convex.logging-structured` | 2 | suppress-and-clean | server log calls that pass a bare interpolated string vs a structured payload | W2 |
| logging.coach-silent-swallow | `coder.convex.logging-silent-swallow` | 4 | suppress-and-clean | `catch (e) {}` / catch block that neither logs nor rethrows | W2 |
| performance.perf | `coder.convex.performance-perf` | 3 | documentation-only | advisory perf smells (e.g. `await` in a loop, full-table `collect()` without index) | W2 |
| refactor.complexity-cyclomatic-typescript | `coder.convex.complexity-cyclomatic` | 3 | strict | per-function cyclomatic count over threshold (count decision keywords) | W3 |
| refactor.complexity-length-typescript | `coder.convex.complexity-length` | 2 | strict | function body line count over threshold | W3 |
| refactor.complexity-nesting-typescript | `coder.convex.complexity-nesting` | 3 | strict | max block-nesting depth over threshold | W3 |
| refactor.complexity-cognitive | `coder.convex.complexity-cognitive` | 3 | strict | cognitive-complexity score (nesting-weighted) over threshold | W3 |
| refactor.complexity-params | `coder.convex.complexity-params` | 2 | strict | function parameter count over threshold | W3 |
| refactor.quality-comments-typescript | `coder.convex.quality-comments` | 2 | strict | commented-out code / TODO-debt density heuristics | W4 |
| refactor.quality-duplication | `coder.convex.quality-duplication` | 2 | strict | duplicated token-window blocks within a file/layer | W4 |
| refactor.quality-file-length | `coder.convex.quality-file-length` | 2 | strict | file line count over threshold | W4 |
| refactor.quality-mi-typescript | `coder.convex.quality-mi` | 2 | strict | maintainability-index proxy below threshold | W4 |
| refactor.quality-naming | `coder.convex.quality-naming` | 2 | strict | identifier naming (camelCase fns, PascalCase types) violations | W4 |
| coder.dead-code.reachability-typescript | `coder.convex.dead-code-reachability` | 2 | strict | `*.ts` under `convex/` unreachable from a graph root (schema/http/index/exported fn) | W5 |
| coder.design.foundations | `coder.convex.design-foundations` | 2 | strict | required layer-foundation files present per feature | W5 |
| coder.design.hierarchy-import | `coder.convex.design-hierarchy-import` | 3 | strict | inward dependency direction (presentation→application→domain; domain imports nothing upward) | W5 |
| coder.design.orphan-export | `coder.convex.design-orphan-export` | 2 | strict | exported symbol never imported and not a Convex API entry | W5 |
| coder.duplication.no-intra-layer-code-typescript | `coder.convex.duplication-no-intra-layer` | 2 | strict | identical helper duplicated across sibling files in one layer | W5 |
| refactor.composition-root | `coder.convex.composition-root` | 3 | strict | wiring/instantiation confined to `composition.ts`/`wagon.ts` roots | W5 |
| refactor.composition-consumer | `coder.convex.composition-consumer` | 3 | strict | consumers receive deps by injection, not by constructing them | W5 |

### NATIVE → build now (Convex-only, no Core equivalent)
| Convex node | sev | disp | Validator checks | Worker |
|---|---|---|---|---|
| `coder.convex.api-no-underscore-dir` | 3 | strict | exported query/mutation/action must not sit under an `_`-prefixed dir (excluded from API surface) | W6 |
| `coder.convex.layer-naming` | 2 | suppress-and-clean | per-feature layer files named `api/application/domain/integration.ts` | W6 |
| `coder.convex.domain-no-convex-import` | 3 | strict | `domain.ts`/`domain/**` must not import `convex/*`, `./_generated`, or `ctx` | W6 |
| `coder.convex.feature-layout-promotion` | 1 | advisory | a single-file layer > 150 lines OR > 3 exports should promote to a dir | W6 |

### FRONTEND → defer to a future `atdd.extension.vite-coder` (NOT convex-coder)
Documented individually (not grouped away): each is a Vite/React frontend obligation
with no Convex-backend surface. Tracked for a sibling extension, not built here.
| Core rule | Why not convex |
|---|---|
| coder.boundaries.http-client | centralized browser fetch client (React) |
| coder.design.orphan-ui | unused UI component detection |
| coder.design.primitives | design-system primitive usage |
| coder.design.token-color | color-token usage |
| coder.design.token-hardcoded | hardcoded design tokens |
| coder.presentation.gsap-commons | GSAP animation layering |
| coder.presentation.gsap-layer | GSAP layer placement |
| coder.presentation.i18n-config | i18n config |
| coder.presentation.i18n-switcher | i18n switcher |
| coder.refactor.coach-ratchet-pres | presentation ratchet (frontend) |

### N/A → not meaningful for a single-language Convex backend (with reason)
| Core rule | Reason |
|---|---|
| coder.boundaries.xlang-naming | cross-language parity — only meaningful in multi-language repos |
| coder.boundaries.xlang-entity | cross-language entity parity (python↔dart↔ts) |
| coder.boundaries.xlang-enum | cross-language enum parity |
| coder.boundaries.xlang-contract | cross-language contract parity |
| coder.security.sql-injection | Convex has no SQL; its document query API is not string-built |
| coder.dead-code.reachability (non-ts) | language-neutral sibling; the `-typescript` variant is the one we mirror |
| coder.duplication.no-intra-layer-code-python | python sibling; TS variant mirrored |
| coder.refactor.complexity-cyclomatic (non-ts) | python/neutral sibling; TS variant mirrored |
| coder.refactor.complexity-length (non-ts) | python/neutral sibling; TS variant mirrored |
| coder.refactor.complexity-nesting (non-ts) | python/neutral sibling; TS variant mirrored |
| coder.refactor.quality-comments (non-ts) | python sibling; TS variant mirrored |
| coder.refactor.quality-mi (non-ts) | python sibling; TS variant mirrored |

---

## 2. TESTER — full per-rule decision (both Core rules)
| Core rule (source node) | Convex node | sev | disp | Validator checks | Worker |
|---|---|---|---|---|---|
| tester.filename.urn | `tester.convex.filename-urn` | 2 | documentation-only | ✅ DONE | — |
| tester.migration.naming | `tester.convex.migration-naming` | 2 | documentation-only | files under `convex/migrations/**` named deterministically from migration id (mirror Core's supabase-stack naming, adapted to Convex migrations) | W6 |

---

## 3. Graph relationships (assembled by orchestrator after merge — NOT by workers)
Workers author nodes only. The orchestrator wires `relationships.yaml` so the graph
mirrors Core's intra-extension structure. Planned edges:
- Each `coder.convex.complexity-*` node `relates-to` its complexity siblings (one
  cohesive complexity facet, mirroring Core's complexity cluster).
- Each `coder.convex.quality-*` node `relates-to` its quality siblings.
- `coder.convex.composition-root` ↔ `coder.convex.composition-consumer` (`relates-to`).
- `coder.convex.error-response-bare-string` ↔ `coder.convex.error-response-code-format`.
- `coder.convex.design-hierarchy-import` → `coder.convex.domain-no-convex-import`
  (`refines`: the Convex-specific realization of inward dependency direction).
- `coder.convex.dead-code-reachability` ↔ `coder.convex.design-orphan-export`
  (`relates-to`: reachability vs export-orphan, two facets of dead code).
- `tester.convex.migration-naming` ↔ `tester.convex.filename-urn` (`relates-to`:
  both deterministic-naming-from-identity, mirroring Core's tester edge).
Core↔extension edges are NOT graph-authored (boundary spec §6.2) — declared
narratively in each node body.

---

## 4. Worker partition (≈6 workers, add-only, own conformance file each)
| Worker | Theme | Nodes |
|---|---|---|
| **W1** | Security + error-response (sev4) | security-missing-auth, security-hardcoded-secret, error-response-bare-string, error-response-code-format |
| **W2** | Data-access + logging + perf | nplus1-db-in-loop, logging-structured, logging-silent-swallow, performance-perf |
| **W3** | Complexity tier | complexity-cyclomatic, complexity-length, complexity-nesting, complexity-cognitive, complexity-params |
| **W4** | Quality/maintainability tier | quality-comments, quality-duplication, quality-file-length, quality-mi, quality-naming |
| **W5** | Architecture / dead-code / duplication / composition | dead-code-reachability, design-foundations, design-hierarchy-import, design-orphan-export, duplication-no-intra-layer, composition-root, composition-consumer |
| **W6** | Convex-native coder + tester | api-no-underscore-dir, layer-naming, domain-no-convex-import, feature-layout-promotion, tester-migration-naming |

**Totals:** 30 new nodes (25 MIRROR + 4 NATIVE + 1 tester) → with the 4 already done =
**34 Convex nodes**, covering 100% of the MIRROR-class Core surface + all NATIVE +
both tester rules. FRONTEND (10) and N/A (12) are explicitly catalogued above, not
silently dropped.
