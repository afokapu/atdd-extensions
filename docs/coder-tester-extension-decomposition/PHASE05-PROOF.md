# Phase 0.5 — Harden the contract, RE-PROVE with a NON-STRICT validator

**Status:** ✅ PASS — non-strict re-proof green; disposition cleanly separable;
Phase-0 strict proof + provider conformance still green (regression).
**Date:** 2026-06-28
**Builds on:** PHASE0-PROOF.md (strict `coder.logging.print`). Contract spec:
PROVIDER-CONTRACT-v1.1.md.

Phase 0 proved ONE *strict* validator runs in the extension but found the
`atdd.workspace.python-pytest` v1.0.0 contract too thin for ~49/50 of the fleet.
Phase 0.5 hardens the contract to **v1.1.0** (the three gaps below) and re-proves
it with a **`suppress-and-clean`** validator — the disposition class a naive
`assert violations == []` cannot serve.

---

## 1. The three gaps, and how v1.1 closes each

| Gap (Phase 0) | v1.1 fix | Where |
|---|---|---|
| **1. Disposition coupling** — run knew only green/red; proof dropped `disposition_gate` and used `assert violations==[]` (strict-only). | **Provider emits RAW factual violations; consumer applies disposition.** The pytest exit code becomes run-health, not a verdict. A `suppress-and-clean` enforcement test MUST NOT assert emptiness. | CONTRACT §1; `run.py` (zero disposition logic); `_consumer_disposition.py` (the stand-in) |
| **2. Scan scope** — `find_repo_root` + `.atdd/config.yaml` excludes in 49/50. | **Scan scope supplied, never auto-discovered.** `run.py` injects `ATDD_SCAN_ROOTS` (JSON list, multi-root) + `ATDD_SCAN_EXCLUDES` (JSON globs). Detector obeys; never calls `find_repo_root`. | CONTRACT §2; `run.py`; `structured_logging.py::scan_roots` |
| **3. Violation granularity** — one `rule_id` at location `"."`. | **Structured JSON report channel:** a list of `{rule_id,file,line,col,evidence,source_line}`, supporting MULTIPLE distinct `rule_id`s from one run. `CONTRACT_VERSION` 1.0.0 → **1.1.0**. | CONTRACT §3; `run.py` report channel; `structured_logging.py` (emits 2 rule_ids) |

The structured detector emits BOTH `coder.logging.structured` (suppress-and-clean)
AND `coder.logging.print` (strict) from one run — directly exercising gap 3 and a
mixed-disposition downstream.

---

## 2. The disposition boundary, demonstrated (not asserted)

The provider emits RAW; a SEPARATE consumer stand-in
(`e2e/_consumer_disposition.py`) applies disposition AFTER the run. The adapter
never imports the stand-in; the stand-in never imports the adapter. Only the RAW
violation list crosses between them.

The crux is the `all_suppressed` fixture: the provider emits a **non-empty** raw
list, yet the verdict is **PASS** — the flip happens entirely in the consumer.

| Fixture | RAW emitted by provider | Disposition verdict (downstream) |
|---|---|---|
| `clean` | `[]` | **PASS** — 0 unsuppressed |
| `dirty` | 3 over 2 rule_ids (print + bare-info + MARKED bare-warning) | **FAIL** — 2 unsuppressed (strict print + unmarked s&c), 1 suppressed |
| `all_suppressed` | **2 (NON-EMPTY)** — both bare logs | **PASS** — both markers absorbed, 0 unsuppressed |

`_consumer_disposition.is_suppressed` mirrors core
`suppression_scanner.is_suppressed` verbatim (`"atdd:suppress(<rule_id>)" in
line`); unknown rule_ids default to `strict` exactly as
`disposition_gate._DEFAULT_DISPOSITION`. UNTIL staleness is intentionally NOT
decided here — the core gate also absorbs on marker-present regardless of UNTIL
(staleness is `test_no_stale_suppressions`' separate job).

---

## 3. PROOF — exact commands + output

Environment: Python 3.14.5, pytest 9.0.3 (provider pins `pytest>=8.0`,
`pyyaml>=6.0`; detector is pure stdlib).

### 3a. Non-strict RE-PROOF — `coder.logging.structured` end-to-end

```
$ python3 official/atdd.workspace.python-pytest/e2e/prove_structured_logging.py

=== 1. discover_implementations(implementations/)  [provider contract 1.1.0] ===
  provider CONTRACT_VERSION = 1.1.0
  found: coder.logging.print  contract=1.0.0
  found: coder.logging.structured  contract=1.1.0
  PASS: discovered 'coder.logging.structured'

=== 2. fixtures/clean  -> expect RAW=[] -> disposition PASS ===
  structured=True ran=True passed=True exit=0  RAW violations=0
  consumer disposition verdict: PASS  (unsuppressed=0, suppressed=0)
  PASS: clean -> no raw violations -> PASS

=== 3. fixtures/dirty  -> expect RAW=3 over 2 rule_ids -> disposition FAIL ===
  structured=True ran=True passed=True exit=0  RAW violations=3
    - [coder.logging.print] service.py:15:4  src='print("debugging make")'
    - [coder.logging.structured] service.py:16:4  src='logger.info("user created")'
    - [coder.logging.structured] service.py:17:4  src='logger.warning("retrying create")  # atdd:suppress(coder.logging.structured) UNTIL=2099-01-01'
  consumer disposition verdict: FAIL  (unsuppressed=2, suppressed=1)
      coder.logging.print [strict]: 1 unsuppressed, 0 suppressed
      coder.logging.structured [suppress-and-clean]: 1 unsuppressed, 1 suppressed
  PASS: 3 raw (print+structured) -> FAIL, 2 unsuppressed / 1 suppressed

=== 4. fixtures/all_suppressed  -> expect RAW NON-EMPTY -> disposition PASS ===
  structured=True ran=True passed=True exit=0  RAW violations=2
    - [coder.logging.structured] service.py:15:4  src='logger.info("user created")  # atdd:suppress(coder.logging.structured) UNTIL=2099-01-01'
    - [coder.logging.structured] service.py:16:4  src='logger.warning("retrying create")  # atdd:suppress(coder.logging.structured) UNTIL=2099-01-01'
  consumer disposition verdict: PASS  (unsuppressed=0, suppressed=2)
      coder.logging.structured [suppress-and-clean]: 0 unsuppressed, 2 suppressed
  PASS: provider emits 2 RAW, consumer absorbs both -> PASS
        ^ disposition decided ENTIRELY downstream — separability proven

=== RESULT ===
  ALL PASS — non-strict re-proof green; disposition cleanly separable
DRIVER_EXIT=0
```

### 3b. Print REGRESSION — Phase-0 strict proof still GREEN (back-compat)

The print impl is unchanged (contract 1.0.0). It writes no report → `run.py`
falls through to the **identical v1.0.0 exit-code mapping**. Output verbatim to
Phase 0:

```
$ python3 official/atdd.workspace.python-pytest/e2e/prove_logging_print.py
... discovered 'coder.logging.print' (alongside the new structured impl) ...
  2. default env  -> ran=True passed=True exit=0 violations=[]            PASS
  3. ATDD_SCAN_TARGET=fixtures/dirty -> violations=[{'rule_id': 'coder.logging.print',
                                          'location': '.', ...}]          PASS
  ALL PASS — end-to-end contract proven
DRIVER_EXIT=0
```

### 3c. Provider conformance — v1.0.0 + v1.1.0 (regression + new)

```
$ python3 -m pytest official/atdd.workspace.python-pytest/conformance/ -q
............                                                              [100%]
12 passed in 0.66s
```

8 original v1.0.0 tests (unchanged) + 4 new v1.1.0 tests: structured report
channel; multi-rule emission; malformed-report → fallback (never a silent pass);
scan-roots/excludes injection.

### 3d. Structured impl pytest — detector health + emission

```
$ python3 -m pytest official/atdd.workspace.python-pytest/implementations/structured_logging_detector/ -q
.......                                                                   [100%]
7 passed in 0.01s
```

6 detector self-tests + 1 emission test (writes the RAW report; asserts run-health
only, NOT emptiness).

---

## 4. Every adaptation made to decouple `coder.logging.structured` from core

Same four core couplings as the print validator; the disposition one is now
handled honestly rather than dropped.

| Core dependency | Adaptation | Fidelity impact |
|---|---|---|
| `bind_rule("coder.logging.structured"/"coder.logging.print")` | Module constants `RULE_STRUCTURED` / `RULE_PRINT`. Metadata lives in the convention nodes. | None for detection. |
| `Violation` | Plain dict `{rule_id,file,line,col,evidence,source_line}` (v1.1 §3.2) — a structural superset of core `Violation`; `severity`/`fix_hint_ref` rejoined from the node by the consumer. | None — same fields, different home. |
| `find_repo_root` + dual-dir scan (`python/` + `src/atdd/`) | Removed. Explicit `ATDD_SCAN_ROOTS` (+ excludes). The `src/atdd/` dogfood scan + vendored-path guard are consumer scan-policy now, not detector logic. | Behavioral improvement — hermetic. |
| `assert_disposition_satisfied` (suppress-and-clean) | **NOT dropped this time — RE-HOMED to the consumer.** Detector emits RAW (incl. marked calls); `_consumer_disposition.apply_disposition` makes the verdict. | **Faithful.** Verdict matches what the core gate would produce (dirty→FAIL/2, all_suppressed→PASS). |

The AST detection (`detect_print_calls`, `detect_bare_log_calls`, `is_excluded`)
is behavior-preserving against core (same predicates, same `LOG_METHODS` /
`LOGGER_RECEIVER_NAMES`, same exclusions).

---

## 5. Honest assessment — is disposition cleanly separable?

**YES**, with direct evidence (§2, §3a step 4): the provider emits a NON-EMPTY raw
list for `all_suppressed` and the consumer turns it into PASS, while for `dirty`
the same provider path yields FAIL — the verdict lives entirely in a module the
provider does not import. The suppression decision, the strict-vs-s&c split, and
the final aggregation are all downstream. The two-place split is real, not cosmetic.

**Caveats (honest):**
- The stand-in is a *faithful reduction*, not the core gate itself. It does not
  exercise advisory warnings, ratchet baselines, GH annotations, or
  `ValidatorReport` emission — those are core's, and out of scope for proving
  *separability*. What it proves: the RAW→disposition boundary is sufficient and
  the data contract (`source_line` especially) carries everything the gate needs.
- `source_line` lets the consumer apply markers WITHOUT re-reading files —
  stronger separation than core (which re-reads via `_read_line`). This is a
  deliberate contract choice (v1.1 §3.2), not an accident.

---

## 6. Remaining gaps before bulk migration of the 109 validators

The contract is now sufficient for the **disposition + granularity + scan-scope**
axes. What still blocks the bulk:

1. **Real consumer wiring (not a stand-in).** This proof's disposition is a local
   stand-in. Bulk needs core/coach to actually call the provider, collect RAW
   violations, and run the *real* `disposition_gate` over them — including the
   rule registry build, ratchet baselines, advisory, and `ValidatorReport`
   persistence. The boundary is proven; the production wire is not built.
2. **Scan-policy authoring.** v1.1 *accepts* scan-roots/excludes but nothing yet
   *produces* them from a consumer's `.atdd/config.yaml` + repo shape
   (`python/` + `web/src/`, the `src/atdd/` dogfood carve-out, vendored-path
   guards). A resolver step must translate repo config → `scan_roots`/`excludes`.
3. **`bind_rule` fan-out for genuinely multi-rule validators.** Proven for 2
   rule_ids from one detector. The heavy cases (`test_security_patterns` →
   several, `test_complexity` → 3) need each rule_id wired to its node; the
   `implementation_id == rule_id` shortcut no longer holds (this impl already
   uses `emits_rule_ids:` to declare the set — that field needs resolver support).
4. **`-python` / `-typescript` split across two workspace packages.** One
   obligation node, two impls (PYP vs a TS provider). The TS provider must prove
   the SAME contract via its own conformance suite. Not started.
5. **Long-tail substrate (schedule LAST).** `graph.urn` / `manifest` /
   `coverage_phase` / `train_spec_phase` / `locale_phase` / `shared_fixtures`
   reach into URN/graph/plan substrate; those validators are not self-contained
   AST scans and each needs a vendor-slice-or-keep-in-core decision.
6. **Structured-channel adoption by the strict impls.** The print impl still uses
   the v1.0.0 fallback. Migrating it to the structured channel (so strict rules
   also surface `file:line:col` instead of `"."`) is mechanical but unstarted;
   the fallback is a back-compat bridge, not the end state.

---

## 7. Files created / changed

**Created:**
- `docs/coder-tester-extension-decomposition/PROVIDER-CONTRACT-v1.1.md` — the v1.1 contract spec.
- `docs/coder-tester-extension-decomposition/PHASE05-PROOF.md` — this document.
- `official/atdd.extension.coder/conventions/coder.logging.structured.convention.yaml` — obligation node (suppress-and-clean).
- `official/atdd.workspace.python-pytest/implementations/structured_logging_detector/atdd.implementation.yaml` — v1.1 manifest (`emits_rule_ids`).
- `.../structured_logging_detector/structured_logging.py` — pure-AST detector, emits RAW multi-rule + `source_line`.
- `.../structured_logging_detector/test_structured_logging.py` — detector self-tests + RAW report emission (no verdict).
- `.../structured_logging_detector/fixtures/{clean,dirty,all_suppressed}/service.py` — three fixtures.
- `official/atdd.workspace.python-pytest/e2e/_consumer_disposition.py` — faithful consumer disposition stand-in.
- `official/atdd.workspace.python-pytest/e2e/prove_structured_logging.py` — non-strict e2e re-proof driver.

**Changed:**
- `official/atdd.workspace.python-pytest/adapter/discover.py` — `CONTRACT_VERSION` 1.0.0 → 1.1.0 (back-compat preserved).
- `official/atdd.workspace.python-pytest/adapter/run.py` — scan-mount injection + structured report channel + v1.0.0 fallback + `RunResult.structured`.
- `official/atdd.workspace.python-pytest/atdd.workspace.yaml` — `contract_version` 1.1.0.
- `official/atdd.workspace.python-pytest/conformance/test_provider_contract.py` — +4 v1.1 conformance tests.
- `official/atdd.extension.coder/relationships.yaml` — registered `coder.logging.structured`.

**Untouched (read-only, as required):** all of `/Users/alecfokapu/Github/atdd`
core; the Phase-0 print implementation + its e2e proof (regression-tested only).
