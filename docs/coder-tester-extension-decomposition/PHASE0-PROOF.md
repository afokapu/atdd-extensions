# Phase 0 — De-Risk Proof: one coder validator hosted & run by the extension

**Status:** ✅ PASS — end-to-end proven (discover → run GREEN → run RED with the
correct `rule_id`).
**Date:** 2026-06-28
**Scope:** ONE validator, proving the mechanism. NOT bulk migration.

This phase answers one question: *can the `atdd-extensions` two-layer model
(agnostic obligation node in `atdd.extension.coder` + stack-specific detector in
`atdd.workspace.python-pytest`) actually host and RUN a real coder validator
end-to-end, decoupled from ATDD core?* Yes.

---

## 1. Target chosen — `coder.logging.print`

**Why this one** (justification against the §1 selection criteria):

| Criterion | `coder.logging.print` |
|---|---|
| Clear `bind_rule("coder.<area>.<id>")` | Yes — `bind_rule("coder.logging.print")` in `test_structured_logging.py` |
| Minimal core substrate coupling | **Best in class** — its *detection core* (`detect_print_calls`) is a pure `ast` walk with **zero** `atdd.coach.*` imports. Only the surrounding harness touches core. |
| Small | Detector is ~15 lines of real logic; AST `Call` where `func.id == "print"`. |
| Ideal shape (logging / security / single-file) | A single-file logging detector — exactly the §1 ideal. |
| Named in the plan | DESIGN §4 explicitly lists `coder.logging.print` (dedup of the `coder.logging.no-print-calls-in` registry mirror) as a clean 1-rule→1-node case. |

**Authoritative source metadata** (core
`src/atdd/coder/conventions/logging.convention.yaml`, `canonical_rules.rules`,
blob `b5999f8489b06e20`):

```yaml
- id: "coder.logging.print"
  validator: "test_structured_logging::test_no_print_in_production_code"
  aliases: ["LOGGING-PRINT-001"]
  severity: 2
  disposition: strict
  description: "No print() calls in non-test production Python code (use logger)"
  introduced_in: "1.67.0"
```

Detector logic ported from `src/atdd/coder/validators/test_structured_logging.py`
(blob `112cb0d5f4234487`).

---

## 2. End-to-end path (obligation → implementation → adapter run)

```
atdd.extension.coder/                          ← LAYER 1: agnostic obligation
  conventions/
    coder.logging.print.convention.yaml        "use a logger, not the console"
                                                (15-field v1.1.0 node; severity 2;
                                                 disposition strict; references the impl)
        │  realized-by ▼  (implementation.ref / realizes_convention back-pointer)
atdd.workspace.python-pytest/                  ← LAYER 2: stack-specific detector
  implementations/logging_print_detector/
    atdd.implementation.yaml                   implementation_id: coder.logging.print
    logging_print.py                           pure-AST detector (no atdd.coach.*)
    test_logging_print.py                      runnable pytest enforcement
    fixtures/clean/service.py                  print-free → GREEN
    fixtures/dirty/service.py                  has print() → RED
        │  discovered + run by ▼
  adapter/discover.py + adapter/run.py         contract_version 1.0.0
        discover_implementations() finds the manifest
        run_implementation()       runs `python -m pytest`, maps exit→violation
```

The provider contract (unchanged, read-only to this phase): `discover.py` rglobs
`**/atdd.implementation.yaml` and keeps contract-compatible ones; `run.py` runs
`python -m pytest --tb=no -q <impl_dir>` and maps **exit 0 → no violation**,
**exit 1 → one violation `{rule_id == implementation_id, location, evidence}`**.
By setting `implementation_id == coder.logging.print`, a RED run surfaces a
violation carrying the **convention's** rule_id — closing the loop.

---

## 3. Every adaptation made to decouple from core

The core validator imports four `atdd.coach.*` substrate modules. **None** are
carried into the extension. Each was replaced or dropped:

| Core dependency | What it did | Adaptation in the extension | Fidelity impact |
|---|---|---|---|
| `bind_rule("coder.logging.print")` (`coach.utils.rule_binding`) | Bound severity/disposition/fix-hint from convention YAML at validator import; raised if drift. | Replaced by `RULE_ID = "coder.logging.print"` constant in `logging_print.py`. The authoritative metadata now lives in the **convention node** (severity 2, disposition strict, alias LOGGING-PRINT-001), not bound at runtime. | None for detection. Drift-guard moves from import-time to node/impl-id equality (both say `coder.logging.print`). |
| `Violation` (`coach.validators._violation`) | Structured violation record (rule_id, severity, location, detail, fix_hint_ref). | Replaced by a plain dict `{"rule_id","location","evidence"}` — the **python-pytest run contract's** violation-output shape (`run.py::_to_violations`). | None — severity/fix-hint live in the node; the runtime only needs rule_id+location. |
| `find_repo_root` (`coach.utils.repo`) | Discovered the consumer repo root, then scanned `repo/python/`. | Removed. The detector scans an **explicit caller-supplied path** (`scan_path(target)`); the workspace instance or a fixture decides scope, not a global discovery. | Behavioral *improvement* — hermetic, no hidden global state. Scan-scope policy (which roots) is deferred to the workspace/coach layer. |
| `assert_disposition_satisfied` (`coach.utils.disposition_gate`) | Applied the rule's disposition (strict / suppress-and-clean / advisory) incl. `# atdd:suppress(...) UNTIL=` markers + ratchet baseline → decided pass/fail. | **Dropped.** Pass/fail is now the plain pytest assertion (`violations == []`). `coder.logging.print` is `disposition: strict`, so "any violation fails" == "assert empty" — a faithful 1:1 for THIS rule. | **None for a strict rule.** For suppress-and-clean rules this gate is load-bearing and must be re-homed — see GAPS §5.1. |

Also dropped: `import atdd` (only used for `atdd.__file__` package-dir resolution
and the `src/atdd/` dogfood scan — both irrelevant once scope is caller-supplied).

The ported detection logic itself (`detect_print_calls`, `is_excluded`) is
behavior-preserving: same AST predicate, same exclusions (`test_*`, `*/tests/`,
`__pycache__`, `__init__.py`).

---

## 4. PROOF — exact commands + output

### 4a. Plain `pytest` — default run is GREEN (clean fixture)

```
$ python3 -m pytest official/atdd.workspace.python-pytest/implementations/logging_print_detector/ -q
.......                                                                  [100%]
7 passed in 0.01s
EXIT=0
```

### 4b. Plain `pytest` — RED when pointed at the dirty fixture

```
$ ATDD_SCAN_TARGET=fixtures/dirty python3 -m pytest \
      official/atdd.workspace.python-pytest/implementations/logging_print_detector/ -q
......F                                                                  [100%]
...
E   AssertionError: 2 coder.logging.print violation(s) under .../fixtures/dirty:
E       - service.py:15:4: print() call in production code (use a structured logger)
E       - service.py:21:4: print() call in production code (use a structured logger)
1 failed, 6 passed in 0.01s
EXIT=1
```

### 4c. THROUGH THE PROVIDER ADAPTER (the real proof) — discover + run + map

```
$ python3 official/atdd.workspace.python-pytest/e2e/prove_logging_print.py

=== 1. discover_implementations(implementations/) ===
  found: coder.logging.print  contract=1.0.0  targets=atdd.workspace.python-pytest
  PASS: discovered 'coder.logging.print'

=== 2. run_implementation(default env)  -> expect GREEN, no violations ===
  ran=True passed=True exit=0 violations=[]
  --- pytest summary ---
  7 passed in 0.01s
  PASS: clean target -> no violation

=== 3. run_implementation(ATDD_SCAN_TARGET=fixtures/dirty)  -> expect RED + violation ===
  ran=True passed=False exit=1
  violations=[{'rule_id': 'coder.logging.print', 'location': '.', 'evidence': '1 failed, 6 passed in 0.01s'}]
  --- pytest summary ---
  1 failed, 6 passed in 0.01s
  PASS: dirty target -> violation rule_id='coder.logging.print'

=== RESULT ===
  ALL PASS — end-to-end contract proven
DRIVER_EXIT=0
```

### 4d. Regression — provider conformance still green (adapter untouched)

```
$ python3 -m pytest official/atdd.workspace.python-pytest/conformance/ -q
........                                                                 [100%]
8 passed in 0.23s
```

Environment: Python 3.14.5, pytest 9.0.3 (provider pins `pytest>=8.0`,
`pyyaml>=6.0`; the detector itself is pure stdlib).

**One honest caveat on the contract granularity** (visible in 4c step 3): the
provider maps a failing run to **one** violation with `location: "."` and the
pytest summary line as `evidence` — it does NOT yet surface the two precise
`file:line:col` locations the detector computed (those appear in the pytest
assertion body, 4b). `run.py::_to_violations` is `rule_id + impl-root` only by
design ("line-level mapping is the runner wagon's job"). So the rule_id round-trips
perfectly; per-site locations do not yet. Noted in GAPS §5.4.

---

## 5. GAPS / RISKS for bulk migration (the other ~validators)

Census of core coupling across the **50** `coder/validators/test_*.py` files
(`grep` over origin/main):

| Core import | # of 50 validators |
|---|---|
| `coach.utils.repo` (`find_repo_root`) | **49** |
| `coach.validators._violation` (`Violation`) | 25 |
| `coach.utils.disposition_gate` | 25 |
| `coach.utils.rule_binding` (`bind_rule`) | 21 |
| `coach.utils.config` (`.atdd/config.yaml`) | 10 |
| `coach.utils.graph.urn` / `manifest` / `coverage_phase` / `train_spec_phase` / `locale_phase` / `diagnostics` / `shared_fixtures` | 1–2 each (long tail) |

`coder.logging.print` was deliberately the **easiest** case (pure-AST core, strict
disposition, single file). The fleet is harder. Top risks:

### 5.1 — `disposition_gate` is load-bearing and was DROPPED (top risk)
25/50 validators decide pass/fail via `assert_disposition_satisfied`, which
implements `suppress-and-clean`, `advisory`, ratchet baselines, and inline
`# atdd:suppress(<rule>) UNTIL=<date>` markers. I got away with dropping it
because `coder.logging.print` is `strict` (violations==0). **Any
suppress-and-clean rule** (e.g. its sibling `coder.logging.structured`) breaks
under a naive `assert violations == []`. **Decision needed before bulk:** does the
suppression/ratchet engine become a shared `atdd.workspace.python-pytest` library
(re-homed core code), or does the coach layer apply disposition *after* the
runtime returns raw violations? The current contract (`run.py`) only knows
green/red — it has nowhere to express "3 suppressed, 0 new" today.

### 5.2 — scan-scope / repo-shape coupling (`find_repo_root` in 49/50)
Almost every validator assumes a consumer repo layout — `repo/python/`,
`web/src/`, `src/atdd/` dogfooding, `.atdd/config.yaml` exclusion lists (10
validators). The python-pytest provider has **no notion of "the consumer repo
root"** yet — `discover.py`/`run.py` operate on a *workspace instance*. Bulk
migration must define how a scan target (the code under inspection) is mounted
into the instance and how multi-root scopes (`python/` + `web/src/`) and
config-driven excludes are expressed. This is the single most pervasive coupling.

### 5.3 — `bind_rule` ↔ many-rules-per-file fan-out
21/50 validators call `bind_rule`, and several bind **multiple** rules
(`test_security_patterns.py` → 3, `test_complexity.py` → 3, `test_design_*` → 3+).
The clean `implementation_id == rule_id` trick used here only holds for
**one rule per implementation**. Multi-rule validators must be split into N
implementations (one per rule_id) OR the run contract must grow a way to emit
**several distinct rule_ids from one run** (see 5.4). The `-python`/`-typescript`
detector pairs (duplication, dead-code, complexity, quality) also split across
two *different* workspace packages (PYP vs TS) — one obligation node, two impls.

### 5.4 — run contract emits one rule_id + root location, not per-site findings
`run.py::_to_violations` returns a single `{rule_id=impl_id, location="."}`. It
cannot (a) emit multiple rule_ids from a multi-rule validator, nor (b) carry the
`file:line:col` sites the detectors actually compute. For parity with core
`Violation` output, the contract likely needs a structured machine channel (e.g.
a JSON report file the detector writes and `run.py` parses) — a **contract_version
bump**. Acceptable for a strict single-rule detector; insufficient for the fleet.

### 5.5 — fixtures + heavier substrate (the long tail)
8/50 validators ship their own `fixtures/` trees (and one imports
`coach.validators.shared_fixtures`) that must travel with the detector. The
long-tail imports (`graph.urn`, `manifest`, `coverage_phase`, `train_spec_phase`,
`locale_phase`) reach into the toolkit's URN/graph/plan substrate — those
validators are **not** self-contained AST scans and will each need a substrate
decision (vendor a slice, or keep in core as a non-coder concern). These are the
ones to schedule LAST.

### 5.6 — UNCONFIRMED structural decision (implementation home)
Per DESIGN §5 open-decision 1 (still "confirm before authoring"), this proof put
the detector in the **workspace** package (`atdd.workspace.python-pytest/
implementations/`), while the existing **github** precedent puts implementations
in the **extension** (`atdd.extension.github/implementations/`). Both work under
the location-agnostic `discover.py` rglob, so the proof is valid either way — but
**bulk migration must lock one home first.** (Also note github uses
`implementation_id: <rule>.impl`; this proof uses `implementation_id: <rule>` so
the emitted violation carries the bare convention rule_id — pick one convention.)

---

## 6. Files created / changed

**Created:**
- `official/atdd.extension.coder/conventions/coder.logging.print.convention.yaml` — obligation node (15-field v1.1.0)
- `official/atdd.workspace.python-pytest/implementations/logging_print_detector/atdd.implementation.yaml` — implementation manifest
- `official/atdd.workspace.python-pytest/implementations/logging_print_detector/logging_print.py` — pure-AST detector (decoupled)
- `official/atdd.workspace.python-pytest/implementations/logging_print_detector/test_logging_print.py` — runnable pytest enforcement
- `official/atdd.workspace.python-pytest/implementations/logging_print_detector/fixtures/clean/service.py` — GREEN fixture
- `official/atdd.workspace.python-pytest/implementations/logging_print_detector/fixtures/dirty/service.py` — RED fixture
- `official/atdd.workspace.python-pytest/e2e/prove_logging_print.py` — end-to-end adapter proof harness
- `docs/coder-tester-extension-decomposition/PHASE0-PROOF.md` — this document

**Changed:**
- `official/atdd.extension.coder/relationships.yaml` — registered `coder.logging.print` in `nodes:`

**Untouched (read-only, as required):** all of `/Users/alecfokapu/Github/atdd`
core; the python-pytest `adapter/` and `conformance/`.
