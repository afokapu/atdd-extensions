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

`ste/disambiguation-projectterms.xml` and `ste/grammar-projectterms.xml` — LanguageTool rule XML,
the format the STE checker consumes. Install them into `<repo>/.atdd/ste/` so the checker loads
them alongside the base ASD-STE100 dictionary.

The disambiguation file **adds** each ATDD Technical Name to the approved word list and pins it to
one part of speech. The grammar file **reports** a declared term used outside that sense, plus the
spellings the substrate has settled on. Both halves are needed: widening a dictionary without
pinning meaning is how a controlled language stops controlling anything.

Declared terms: `acceptance`, `artifact`, `cargo`, `contract`, `convention node`, `feature`,
`interlocking`, `train`, `wagon`, `WMBT` ("What Must Be True").

Every rule id is prefixed `ATDD_TERM_`, which is how a project-term finding routes to
`approved-vocabulary` rather than `ste-conformance`
(`controlled_language.VOCABULARY_TOKENS`). A test pins that agreement, because if the two ever
drift a vocabulary defect gets reported as a writing defect and fixed the wrong way.

Adding a term is an authoring decision, not a suppression: it changes a reviewed artifact. A term
that needs more than one sentence to define is a term the prose should not use.

## Tests

`implementations/controlled-language-check/test_controlled_language.py`.

**Every HTTP call is mocked.** CI needs no Java, no TechScribe install, and no network; the fake
opener is the only thing the suite ever talks to, so a test that forgot to mock fails closed rather
than dialling out. The suite covers extraction (prose in, structure out), exclusion globs, finding
→ rule routing, evidence formatting, the `location` + v1.1 key shape, all six checker-failure
modes, and the emission job.
