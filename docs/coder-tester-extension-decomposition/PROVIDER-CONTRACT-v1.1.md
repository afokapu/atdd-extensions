# `atdd.workspace.python-pytest` provider contract — v1.1.0

**Status:** authored Phase 0.5. Supersedes v1.0.0 (Phase 0) without breaking it.
**Date:** 2026-06-28
**Bumps:** `CONTRACT_VERSION` `1.0.0` → `1.1.0` (MINOR — additive, back-compatible).

Phase 0 proved ONE *strict* validator (`coder.logging.print`) runs in the
extension. It also surfaced three gaps that make the v1.0.0 contract too thin for
~49/50 of the fleet:

1. **Disposition coupling** — the run contract knew only green/red, so the proof
   dropped `disposition_gate` and used a naive `assert violations == []`. That is
   correct *only* for `strict` rules.
2. **Scan scope** — the detector scanned a single `$ATDD_SCAN_TARGET`. Real
   consumers are multi-root (`python/` + `web/src/`) with `.atdd/config.yaml`
   excludes (49/50 validators auto-discover via `find_repo_root`).
3. **Violation granularity** — `run.py` emitted ONE `rule_id` at root location
   `"."`. The fleet emits many `file:line:col` sites and several validators bind
   **multiple** distinct `rule_id`s from one run.

v1.1 fixes all three. The three sections below are the normative contract; §4 is
the back-compat statement; §5 is the worked example this phase proves.

---

## 1. The disposition boundary — *provider emits RAW, consumer decides*

This is the load-bearing architectural rule (Phase 0.5 decision 2):

> The **workspace provider emits RAW factual violations only.** It NEVER decides
> pass/fail by disposition. A downstream consumer (coach core's
> `disposition_gate`, or a faithful local stand-in) applies disposition AFTER the
> run.

Disposition (`strict` / `suppress-and-clean` / `advisory` /
`UNTIL=<date>` markers / ratchet baselines / `documentation-only`) is **generic
ATDD substrate** that lives in core/coach. It is NOT a workspace concern. Keeping
it out of the provider is what lets ONE python-pytest runtime serve 100+ rules of
every disposition without re-homing the suppression/ratchet engine into each
runtime.

### What "RAW factual" means precisely

A violation is a statement of *physical fact about the source* — "there is a bare
`logger.info()` call at `service.py:12:8`, and the text of that line is
`<...>`". That is raw.

A *disposition decision* is everything that interprets those facts against
policy:

| Decision | Who owns it | Why it is NOT raw |
|---|---|---|
| Does rule `X` honor `# atdd:suppress(X)` markers? | consumer | only `suppress-and-clean` rules do; `strict` ignores markers entirely |
| Is *this* line's marker valid for *this* rule_id? | consumer | requires the rule→disposition map |
| Is an `UNTIL=<date>` marker stale? | consumer (separate validator) | `disposition_gate` absorbs on marker-present regardless of date; staleness is `test_no_stale_suppressions`' job |
| Final pass/fail aggregation | consumer | strict + unsuppressed-s&c → fail; all-suppressed / advisory → pass |

The provider emits the facts (including, for self-containment, the **raw text of
the offending line** — see `source_line` in §3). The consumer reads `source_line`
+ its rule registry and decides. The provider never imports the consumer; the
consumer never imports the provider's adapter.

### Consequence for the pytest exit code

In v1.0.0 the pytest exit code WAS the verdict (`assert violations == []`). That
conflates "the run executed" with "disposition satisfied" — valid only for
strict. In **v1.1 the exit code is run-health, not a verdict**:

- `exit 0` / `passed=True` ⇒ the detector self-tests are green and the scan
  completed and emitted its report. It does **not** mean "no violations."
- The **disposition verdict is computed downstream** from `violations`.

A `suppress-and-clean` enforcement test therefore MUST NOT `assert violations ==
[]` — doing so would be the provider silently applying `strict`. It scans, writes
the raw report, and passes.

---

## 2. The scan-mount model — *scope is supplied, never auto-discovered*

v1.0.0 detectors called `find_repo_root()` (49/50 of the fleet) or read a single
`$ATDD_SCAN_TARGET`. Both are *implicit global discovery*. v1.1 makes the
**code-under-inspection an explicit input** the consumer/resolver mounts into the
run.

### Inputs (provider → subprocess env)

`run_implementation(...)` accepts and injects:

| Field | Env var | Shape | Meaning |
|---|---|---|---|
| `scan_roots` | `ATDD_SCAN_ROOTS` | JSON array of path strings | The roots of the code under inspection. Multi-root is a multi-element list: `["python", "web/src"]`. Relative paths resolve against the implementation dir (so fixtures work); absolute paths are used verbatim (so a resolver mounts a real consumer repo). |
| `exclude_globs` | `ATDD_SCAN_EXCLUDES` | JSON array of glob strings | Exclusion globs the consumer's `.atdd/config.yaml` would carry, passed IN rather than read from disk. e.g. `["**/migrations/**", "**/_generated/*.py"]`. |

`$ATDD_SCAN_TARGET` (single relative path, v1.0.0) is still honored as a legacy
single-root fallback so the Phase-0 print impl is untouched.

The detector NEVER calls `find_repo_root`, never reads `.atdd/config.yaml`, never
touches global state. The resolver/consumer decides "which roots, which
excludes"; the provider transports that decision; the detector obeys it. This is
hermetic and is the only model that supports a multi-root consumer
(`python/` + `web/src/`) without baking repo shape into the runtime.

---

## 3. Structured violation output — *multi-rule, line-level, machine channel*

v1.0.0 mapped exit-code → ONE `{rule_id=impl_id, location="."}`. v1.1 adds a
**JSON report channel**: the detector writes a structured report, `run.py` reads
it back. This lets one run carry many `file:line:col` sites under **multiple
distinct `rule_id`s**.

### 3.1 The report file (detector writes → run.py reads)

`run.py` allocates a temp path and passes it as `ATDD_VIOLATIONS_REPORT`. If the
detector writes a parseable report there, `run.py` returns its violations; if no
report appears, `run.py` falls back to the v1.0.0 exit-code mapping (§4).

```jsonc
// $ATDD_VIOLATIONS_REPORT  — written by the detector, read by run.py
{
  "contract_version": "1.1.0",
  "scan_roots": ["fixtures/dirty"],          // echo of what was scanned (provenance)
  "violations": [
    {
      "rule_id": "coder.logging.print",       // MAY differ per entry — multi-rule
      "file": "service.py",                    // path relative to its scan root
      "line": 7,
      "col": 4,
      "evidence": "print() call in production code (use a structured logger)",
      "source_line": "    print(\"debugging make\")"   // RAW text of the offending line
    },
    {
      "rule_id": "coder.logging.structured",
      "file": "service.py",
      "line": 9,
      "col": 4,
      "evidence": "logger.info() without extra= keyword argument",
      "source_line": "    logger.info(\"user created\")"
    }
  ]
}
```

### 3.2 Violation record schema (the unit the consumer applies disposition to)

| Field | Type | Required | Notes |
|---|---|---|---|
| `rule_id` | string | yes | Canonical convention id (`coder.logging.structured`). One run MAY emit several. |
| `file` | string | yes | Path relative to the scan root the file was found under. |
| `line` | int ≥ 1 | yes | 1-based line of the offending site. |
| `col` | int ≥ 0 | yes | 0-based column (AST `col_offset`). |
| `evidence` | string | yes | Human-readable detail — maps to core `Violation.detail`. |
| `source_line` | string | yes (v1.1) | RAW text of `line`. Lets the consumer apply marker-based disposition WITHOUT re-reading the file (stronger separation than core, which re-reads). Factual, never interpreted by the provider. |

This is a faithful structural superset of core
`Violation{rule_id, severity, location, detail, fix_hint_ref}`:
- `location` (`path:line:col`) is decomposed into `file`/`line`/`col`.
- `detail` → `evidence`.
- `severity` / `fix_hint_ref` are NOT emitted — they live in the **convention
  node** (authoritative) and are joined back by the consumer via the rule
  registry, exactly as `disposition_gate._format_failure_block` already does.

### 3.3 What `run.py` returns

```python
RunResult(
  implementation_id = "coder.logging.structured",
  passed     = True,        # run-health (exit 0), NOT a disposition verdict (§1)
  exit_code  = 0,
  violations = [ {rule_id, file, line, col, evidence, source_line}, ... ],  # RAW
  stdout     = "...",
)
```

`run.py` performs ZERO disposition logic. `violations` is the raw channel.

---

## 4. Back-compatibility statement

v1.1 is a **MINOR** bump: every v1.0.0 implementation keeps working unchanged.

- **discover** — `CONTRACT_VERSION="1.1.0"`. `contract_compatible` keeps the
  same-major, `impl<=provider` rule, so a `1.0.0` impl on a `1.1.0` provider is
  compatible (older impl, newer provider). The Phase-0 print impl (declares
  `1.0.0`) is still discovered. A `1.1.0` impl is discovered too.
- **run** — the structured report channel is *opt-in*. An impl that writes no
  `$ATDD_VIOLATIONS_REPORT` (the print impl) falls through to the **identical
  v1.0.0 exit-code → single `{rule_id=impl_id, location="."}`** mapping. The
  Phase-0 `prove_logging_print.py` proof stays green verbatim.
- **conformance** — the v1.0.0 conformance suite stays green; v1.1 adds new
  conformance tests for the structured channel + scan-mount.

The print impl is intentionally LEFT at v1.0.0 to *prove* back-compat. Migrating
it forward to the structured channel is mechanical (write the same report the
structured detector writes) and is documented as a follow-up, not a requirement.

---

## 5. Worked example proved this phase — `coder.logging.structured`

`coder.logging.structured` (disposition **`suppress-and-clean`**, the sibling of
the strict `coder.logging.print`) is the non-strict re-proof. Its detector also
emits `coder.logging.print` sites, exercising **multi-rule** output (gap 3) and a
**mixed disposition** downstream (strict + suppress-and-clean).

```
LAYER 1  atdd.extension.coder/conventions/
           coder.logging.structured.convention.yaml   disposition: suppress-and-clean
                  │ realized-by ▼
LAYER 2  atdd.workspace.python-pytest/implementations/structured_logging_detector/
           structured_logging.py   bare-log + print AST detectors → RAW {rule_id,file,line,col,evidence,source_line}
           test_structured_logging.py   scans ATDD_SCAN_ROOTS, writes ATDD_VIOLATIONS_REPORT, does NOT decide
           fixtures/{clean,dirty,all_suppressed}/service.py
                  │ discovered + run by ▼
           adapter/discover.py + run.py   contract 1.1.0 → RAW violations
                  │ consumed AFTER the run by ▼
CONSUMER (core/coach stand-in, OUTSIDE the provider)
           e2e/_consumer_disposition.py   applies suppress-and-clean / strict → final pass/fail
```

The proof (`e2e/prove_structured_logging.py`) asserts the separation directly:

| Fixture | RAW violations the provider emits | Disposition verdict (downstream) |
|---|---|---|
| `clean` | `[]` | **PASS** (0 unsuppressed) |
| `dirty` | 3 — `print` + bare-`info` + marked bare-`warning` | **FAIL** (2 unsuppressed: strict print + unmarked s&c) |
| `all_suppressed` | 2 — both bare logs (NON-EMPTY) | **PASS** (0 unsuppressed — every marker absorbed) |

The `all_suppressed` row is the crux: the provider emits a **non-empty** raw list,
yet the verdict is **PASS** — the flip happens entirely in the consumer. That is
disposition being cleanly separable, demonstrated, not asserted.
