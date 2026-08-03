# `atdd.extension.planner.controlled-language`

Binds the **prose** in authored ATDD artifacts to a controlled language: ASD-STE100 Simplified
Technical English plus an ATDD project-terms vocabulary.

Authored artifacts are read by humans *and* by agents. Their identifiers are already mechanically
governed — URN grammars, schema fields, rule-id patterns, relationship types. Their **English is
not**. Two authors can state the same obligation in two vocabularies and nothing notices. This
package closes that gap the same way every other ATDD surface is closed: an agnostic convention
node, a detector that realizes it, and a violation with a location you can act on.

## The two rules

| rule_id | Governs | A finding means |
|---|---|---|
| `planner.controlled-language.ste-conformance` | writing rules (sentence level) | rewrite the sentence |
| `planner.controlled-language.approved-vocabulary` | word choice (dictionary level) | use an approved word, or extend the reviewed vocabulary |

They are split because they **fail for different reasons and are fixed by different acts**. One
checker round-trip answers both; the detector routes each finding to whichever rule owns it.

## What this package does NOT do

- It does **not** implement STE rules. TechScribe's checker owns them; this package transports
  strings to it and reports what it answers.
- It does **not** call an LLM, run a repair loop, manage a checker process, emit SARIF, keep a
  baseline, or maintain a terminology database.
- It does **not** intercept writes. This is the bound-convention half: it scans authored YAML
  already on disk and reports through the normal enforce path. A core-side counterpart reuses
  these same two rule_ids.

## Boundary (CONTRIBUTING.md, "The Four Layers")

| Layer | Owner |
|---|---|
| Rules | this extension — `conventions/*.convention.yaml` |
| Implementation | this extension — `implementations/controlled-language-check/` |
| Runtime | `atdd.workspace.python-pytest`, referenced by id + contract range, never bundled |
| STE rules | the checker vendor, outside ATDD entirely |

No `capabilities:` block is declared. Extension manifests are not capability-validated
(`author_manifest.validate_extension_manifest` checks kind / id / owns / realizes / workspace deps
only), so declaring one buys nothing and risks tripping the transport forcing rule.
core↔extension references are narrative here, never relationship-graph edges (boundary spec §6.2).

## The detector

`implementations/controlled-language-check/controlled_language.py`. Pure stdlib + PyYAML; no
`atdd.*` imports, no third-party HTTP client.

### Inputs

| Env | Meaning |
|---|---|
| `ATDD_SCAN_ROOTS` | JSON array of roots to scan (v1.1 §2 scan-mount). Relative entries resolve against the implementation dir. |
| `ATDD_SCAN_EXCLUDES` | JSON array of exclusion globs. |
| `ATDD_STE_URL` | Checker endpoint. Default `http://127.0.0.1:8081/v2/check`. |
| `ATDD_VIOLATIONS_REPORT` | Path the RAW report is written to. |

The detector never calls `find_repo_root`, never reads `.atdd/config.yaml`, never touches global
state. Scope is supplied, not discovered.

### Prose only

`PROSE_KEYS` is the whole governed surface:

```
abstract, action, context, context_clarifier, description, goal, message,
notes, outcome, purpose, rationale, statement, text, title
```

Traversal walks the *entire* document to find those keys, but only a prose key's **value** becomes
checkable text — as a string, as each string in a list, or as each string value in a mapping.
Everything else (URNs, ids, paths, slugs, enums, statuses, relationship types, schema keys,
commands, code, numbers, contract refs, artifact names) is structure and is never sent.

That restraint is load-bearing. Feeding identifiers to an English style checker produces noise,
and noise is how a rule gets switched off.

### Locations

A violation's `location` is `` `<artifact path>:<dotted prose path>` `` —
`plan/wagons/foo.yaml:acceptances.0.identity.purpose`. The dotted path is the authored §8 form, not
a line offset, because a prose path survives reformatting and a line number does not.

The document is **composed** rather than loaded, so every extracted string still carries its
line/column. That is what lets one record satisfy two readers at once (below).

### Fail closed

A checker that is unreachable, times out, answers non-2xx, or answers unparseable JSON produces a
violation whose `evidence` starts `checker-unavailable:`. It never produces a clean pass — a
silent style gate is worse than no style gate, because the repo believes it is protected.

The scan stops at the first checker failure, after appending that violation: one unavailable
checker is one defect, not one per field, and the findings gathered before it are still facts.

### The report

Written to `$ATDD_VIOLATIONS_REPORT` in the PROVIDER-CONTRACT-v1.1 §3.1 envelope, because that is
what the provider's `run.py::_read_report` accepts:

```jsonc
{
  "contract_version": "1.1.0",
  "scan_roots": ["..."],
  "violations": [
    {
      "rule_id": "planner.controlled-language.ste-conformance",
      "location": "plan/wagons/foo.yaml:acceptances.0.identity.purpose",
      "evidence": "offset=18 length=7 lt_rule=STE_RULE_1_1 msg=\"Use an approved word.\" replacements=[\"use\"]",
      "file": "plan/wagons/foo.yaml",     // decomposed form run.py requires
      "line": 12,
      "col": 14,
      "source_line": "purpose: Utilise the interlocking to resolve the match."
    }
  ]
}
```

Each record is a **superset**: `rule_id` / `location` / `evidence` are the controlled-language
contract, and `file` / `line` / `col` / `source_line` are the six keys
`run.py::_read_report` validates before it will accept the structured channel. A record missing any
of those six is dropped, the provider falls back to v1.0.0 exit-code mapping, and a detector that
exits 0 then reads as **zero violations** — the exact fail-open this rule exists to prevent.

The detector emits RAW facts only. `strict` / `suppress-and-clean` disposition is the downstream
consumer's decision (v1.1 §1), so the suite passes even when it finds violations.

## The vocabulary

`ste/disambiguation-projectterms.xml` (93 terms) and `ste/grammar-projectterms.xml` (21 misuse
rules) — LanguageTool rule XML, the format the STE checker consumes. Install into
`<repo>/.atdd/ste/` so the checker loads them alongside the base ASD-STE100 dictionary.

The disambiguation file **adds** each ATDD Technical Name and Technical Verb to the approved word
list and pins it to one part of speech. The grammar file **reports** a declared term used outside
that sense, plus the spellings and casings the substrate has settled on. Both halves are needed:
widening a dictionary without pinning meaning is how a controlled language stops controlling
anything.

### It is derived, not invented

Every term was selected from the **207 `*.convention.yaml` nodes under `official/`** by *document
frequency* — how many separate convention nodes use the word. Each entry carries that count as
`[corpus df N]`, so a reviewer can see the evidence for admitting a word instead of taking it on
faith. Terms with no count are structural words the corpus uses in identifiers and headings rather
than in running prose.

| Group | Count | Examples (with corpus df) |
|---|---|---|
| Substrate Technical Names | 35 | `obligation` (197), `detector` (195), `realization` (195), `implementation` (166), `workspace` (145), `runtime` (143), `disposition` (109), `consumer` (76), `violation` (50), `scope` (43), `ratchet` (34), `URN` (33) |
| Train-model Technical Names | 14 | `wagon` (63), `feature` (55), `train` (39), `route` (35), `interlocking` (27), `contract` (25), `artifact` (16), `cargo`, `acceptance`, `WMBT`, `convention node`, `station master`, `journey map`, `smoke test` |
| Persona Technical Names | 4 | `coder` (152), `coach` (50), `tester` (30), `planner` |
| ATDD Technical Verbs | 11 | `delegate` (169), `enforce` (135), `flag` (131), `emit` (90), `realize` (47), `scan` (42), `resolve` (42), `compose` (22), `ratchet` (20), `bind` (18), `suppress` |
| Runtime class names | 5 | `TrainRunner` (23), `InterlockingRunner` (23), `InterlockingResolution` (6), `TrainResult` (5), `SyncProvider` (2) |
| Product / format proper names | 24 | `ATDD`, `GitHub`, `Python`, `pytest`, `TypeScript`, `YAML`, `JSON`, `LanguageTool`, `TechScribe`, `Convex`, `Vite`, `Astro`, `Supabase`, `FastAPI`, … |

A word already approved by base ASD-STE100 needs no entry; declaring one anyway is harmless,
because the only added effect is pinning its part of speech.

### The misuse rules

Three groups, all corpus-motivated:

1. **Technical Name used as a verb** — `train`, `contract`, `feature`, `gate`, `scope`, `coach`,
   and `interlocking` as a participle. English lets every one of these slip into a verb, and each
   slip changes what the sentence claims.
2. **Spelling** — `artefact`→`artifact`, `realise`→`realize` (matching `realizes_convention` in
   every implementation manifest), `convention-node`→`convention node`,
   `stationmaster`→`station master`, `work space`→`workspace`, `run time`→`runtime` as a noun,
   `cargos`→`cargo`, `suppress and clean`→`suppress-and-clean`.
3. **Casing** — `WMBT`, `URN`, `ATDD`, `YAML`/`JSON`/`XML`/`HTTP`/`AST`, vendor spellings
   (`TypeScript`, `GitHub`, `LanguageTool`, …) and PascalCase runtime names.

Every rule id is prefixed `ATDD_TERM_`, which is how a project-term finding routes to
`approved-vocabulary` rather than `ste-conformance` (`controlled_language.VOCABULARY_TOKENS`). A
test pins that agreement, because if the two ever drift a vocabulary defect gets reported as a
writing defect and fixed the wrong way. Two further tests guard the vocabulary itself: one asserts
it stays past 100 rules and still declares the ten baseline terms (a shrink back toward a stub is a
regression, not a cleanup), and one asserts every grammar rule ships a failing example *and* a
passing one, because a rule without both cannot be trusted to fire on what it claims to catch.

Adding a term is an authoring decision, not a suppression: it changes a reviewed artifact. A term
that needs more than one sentence to define is a term the prose should not use.

---

## Operator setup

The extension ships no checker and starts no process. You run one; the detector talks to it.

### 1. Run a checker

The endpoint is the LanguageTool HTTP API (`POST /v2/check`, form-encoded
`language=en-US&text=…`). Any server that speaks it works. Two options:

**LanguageTool alone** — catches general English style, no STE rules. Enough to smoke-test the
wiring:

```bash
# Docker (simplest)
docker run --rm -p 8081:8010 erikvl87/languagetool

# or from the standalone distribution (needs a JRE)
#   https://languagetool.org/download/  ->  LanguageTool-stable.zip
unzip LanguageTool-*.zip && cd LanguageTool-*
java -cp languagetool-server.jar org.languagetool.server.HTTPServer --port 8081
```

**LanguageTool + the TechScribe STE rules** — the real gate. TechScribe (<https://www.techscribe.co.uk>)
distributes an ASD-STE100 checker built on LanguageTool; follow *their* install instructions for the
rule set and the server it expects, then point `ATDD_STE_URL` at it. Check their current packaging
rather than trusting a path written here — TechScribe owns those rules, and this package neither
ships, mirrors, nor reimplements them.

### 2. Install the ATDD vocabulary

Copy this package's project terms next to the base dictionary so the checker loads both:

```bash
mkdir -p "$REPO/.atdd/ste"
cp official/atdd.extension.planner.controlled-language/ste/*.xml "$REPO/.atdd/ste/"
```

Point the server at that directory per your LanguageTool build's custom-rules mechanism
(`--rulesFile`, or by merging into the server's rule tree). Without this step the checker will
report every ATDD Technical Name as an unapproved word, and the gate becomes unusable noise rather
than a signal — which is exactly the failure mode the two-rule split exists to make visible.

### 3. Point the detector at it

```bash
export ATDD_STE_URL="http://127.0.0.1:8081/v2/check"   # default if unset
```

| Env | Required | Default |
|---|---|---|
| `ATDD_STE_URL` | no | `http://127.0.0.1:8081/v2/check` |
| `ATDD_SCAN_ROOTS` | supplied by the provider | — |
| `ATDD_SCAN_EXCLUDES` | supplied by the provider | — |
| `ATDD_VIOLATIONS_REPORT` | supplied by the provider | — |

Verify the endpoint before blaming the gate:

```bash
curl -s -d "language=en-US" --data-urlencode "text=We utilise the interlocking." \
  "$ATDD_STE_URL" | head -c 400
```

A JSON body with a `matches` array means you are wired up. Anything else — connection refused, an
HTML error page, a non-2xx status — is what the detector will report as `checker-unavailable`.

### 4. The gate fails closed — read this before you debug it

**If the checker is down, the gate reports a violation. It never reports a clean pass.**

| Condition | What you get |
|---|---|
| checker unreachable (not started, wrong port) | one violation, `evidence` starts `checker-unavailable: checker unreachable at …` |
| request times out (default 15s) | same, with the timeout detail |
| non-2xx status | `checker-unavailable: checker answered HTTP <code> at …` |
| unparseable body (an HTML error page) | `checker-unavailable: checker answered unparseable JSON at …` |
| 2xx JSON that is not an object | `checker-unavailable: checker answer is not a JSON object at …` |
| 2xx JSON with no `matches` array | `checker-unavailable: checker answer carries no 'matches' list at …` |
| `warnings.incompleteResults: true` | `checker-unavailable: checker reported incompleteResults (truncated answer) at …` |

All seven land under `planner.controlled-language.ste-conformance` and stop the scan after the first
one — **one unavailable checker is one defect, not one per prose field.** Findings gathered before
the failure are kept; they are still facts.

The last row was found by the live round trip, not by design: LanguageTool's real response carries a
`warnings.incompleteResults` flag the first cut ignored. A truncated answer is a *partial* answer, so
accepting it silently would under-report and call the shortfall clean — the exact fail-open this rule
exists to prevent.

This is deliberate. A silent style gate is worse than no style gate, because the repo believes it
is protected. **Do not suppress a `checker-unavailable` finding** — start the checker, or fix
`ATDD_STE_URL`. The finding is telling you the gate did not run, not that your prose is wrong.

Note that `passed=True` on the run is **run-health, not a verdict** (PROVIDER-CONTRACT-v1.1 §1): it
means the detector executed and emitted its report. The pass/fail decision is the consumer's, made
from `violations`.

### 5. CI

CI needs none of this. Every HTTP call in the test suite is mocked — no Java, no TechScribe, no
network. The checker is only needed where the gate actually runs against a real repository.

## Tests

`implementations/controlled-language-check/test_controlled_language.py`.

**Every HTTP call is mocked.** It needs no Java, no TechScribe install, and no network; the fake
opener is the only thing it ever talks to, so a test that forgot to mock fails closed rather than
dialling out. It covers extraction (prose in, structure out), exclusion globs, finding → rule
routing, evidence formatting, the `location` + v1.1 key shape, all six checker-failure modes, and
the emission job.

### Live smoke — `test_live_smoke.py`

Mocks prove our logic and **cannot prove the seam**: that a real server answers a shape we parse,
that its offsets land on the prose we sent, and that a real connection refusal fails closed. That
is what this file proves — nothing in it is mocked.

| Test | Proves |
|---|---|
| `test_live_checker_answers_the_v2_check_contract` | real socket → real `/v2/check` → a match carrying `offset`, `length`, `message`, `rule.id`, `replacements` |
| `test_evidence_is_computed_from_the_live_response` | every field of the emitted evidence equals the **server's own** value, and its offset/length slice the planted defect out of the prose |
| `test_evidence_varies_with_the_response_…` | two different live defects yield different evidence — the anti-constant control |
| `test_routing_follows_the_live_servers_own_taxonomy` | `rule_for` agrees with `VOCABULARY_TOKENS` applied to the **real** rule/category id |
| `test_live_violation_carries_our_location_and_real_positions` | whole chain on a real artifact; `location` is the dotted prose path, `line`/`col` are derived from the file, and the adjacent URN was never sent |
| `test_real_connection_refusal_fails_closed` | a genuine `ECONNREFUSED` against a bound-then-released port → exactly one `checker-unavailable` violation |
| `test_a_refused_checker_makes_the_consumer_verdict_fail` | the verdict a consumer computes from that violation is FAIL |

**Evidence is computed, never constant.** Every expectation is derived from the live response —
offsets are read back out of the emitted evidence and compared to the server's numbers, and the
flagged span is sliced out of the prose we sent. No test asserts a hard-coded evidence string. This
mirrors core's `tester.acceptance-violation.live-smoke-evidence-must-not-be-constant`: a harness
returning a constant dict passes for the wrong reason and hides a dead round trip.

**It cannot silently skip.** Locally these tests skip unless `ATDD_STE_URL` is set. In CI,
`ATDD_STE_LIVE=1` turns a skip into a **failure**, and the job has a final step that fails the
build if the word "skipped" appears at all. A live smoke that can quietly skip is theatre — the
badge still goes green while the round trip is unproven.

Run it locally against your own checker:

```bash
ATDD_STE_URL=http://127.0.0.1:8081/v2/check ATDD_STE_LIVE=1 \
  pytest official/atdd.extension.planner.controlled-language/implementations/controlled-language-check -v
```

CI job: **`controlled-language-live-smoke`** in `.github/workflows/validate-packages.yml` — the only
job in this repo that needs a container (`erikvl87/languagetool`, host `8081` → container `8010`).
The two fail-closed tests need no server and run everywhere.
