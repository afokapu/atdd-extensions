# `atdd.extension.planner.docs`

The opinionated documentation model ATDD **recommends**, shipped as an extension so
that it is **policy, not a lifecycle-core dependency**.

A consumer that installs ATDD core without this extension gets the lifecycle
obligation and no opinion about AsciiDoc, ADRs or taxonomy. That is the
absent-capability rule of the core contract: **no capability installed →
`NOT_APPLICABLE` → permits**. Core must not force a documentation system onto a
consumer that has not installed one.

This package implements handoff spec **2 of 2**, *Standard documentation extension*.
Its companion, *Documentation lifecycle contract*, is the core unit. Parent issue
**#1782**.

## Naming

The id follows core's persona-aware grammar (#1343):
`<publisher>.extension.<persona>.<name>`, persona ∈ {`planner`, `tester`, `coder`,
`coach`}. Documentation is an **authored-surface** concern, so the persona is
`planner` and every rule id shares that prefix — matching
`atdd.extension.planner.controlled-language`, the closest sibling in the hub, which
likewise governs authored artifacts rather than source or tests.

`atdd validate package` refuses a four-segment id whose persona is not in that set,
so the name is enforced rather than conventional.

## What this owns, and what core owns

Core owns the lifecycle: the declaration recorded at RATIFY, and four
declaration-integrity checks that need zero documentation knowledge. The heaviest is
*every declared artifact path appears in the change set* — **you said you would touch
these paths, did you?** — which is path-agnostic and format-agnostic.

This extension owns everything core is forbidden to name:

| Surface | Rule |
|---|---|
| Authored format | `planner.docs.asciidoc-only` |
| Document identity | `planner.docs.identity-required`, `planner.docs.doc-id-unique` |
| Relationship graph | `planner.docs.graph-target-resolves` |
| Canonical tree | `planner.docs.area-index-required` |
| ADRs | `planner.docs.adr-registry-derived` |
| Declaration shape | `planner.docs.artifact-path-shape` |
| The undeclared-change inverse | `planner.docs.undeclared-change` |
| Rendering | `planner.docs.reference-integrity` |

The companion spec carries an **anti-theatre test**: grep core for `asciidoc`,
`adoc`, `adr`, `doc-id`, `purpose/`, `architecture/`, `delivery/`, `archive/` and
require zero hits. Every one of those tokens lives here instead. That test is what
keeps the boundary honest over time.

### The undeclared-change rule lives here on purpose

Detecting that a change *should have been* declared is semantic and not
deterministically decidable. The deterministic **inverse** is enforceable — a diff
touching `docs/**` that no declared artifact covers — and it requires knowing
`docs/`, which is why it is the extension's and not core's. Core's half and this half
are the two directions of one question, and neither closes the loop alone.

## The seam

Core discovers at most one installed documentation capability over an entry-point
group and never names a concrete extension:

```
[project.entry-points."atdd.documentation"]
standard = "atdd_ext_docs.capability:StandardDocumentationCapability"
```

```python
def check(
    self,
    declaration: DocumentationDeclaration,  # as stored by core
    change_set: ChangeSet,                  # paths added/modified/deleted
    repo_root: Path,
) -> DocumentationCheck: ...
```

Core passes the declaration and the change set, and reads back a verdict and
findings. **Core interprets nothing else.** This is not the CLI-subcommand seam and
does not depend on #1623 — only the operator verbs (`atdd docs build|check`) do, and
they are deliberately not shipped here so that the operator surface cannot block the
gate.

### The verdict distinction that matters most

| Verdict | Meaning | Effect |
|---|---|---|
| `PASS` | Obligation discharged | permits |
| `FAIL` | Declared and demonstrably not discharged; or the capability crashed, timed out, or raised | **blocks** |
| `NOT_APPLICABLE` | Genuinely nothing to check | permits |
| `COULD_NOT_CHECK` | Installed and ran to completion but **could not answer** | **blocks** |

*There is no obligation here* and *I could not see whether the obligation was met*
must never collapse into one another. This repository has merged them in at least
three places — #1745 (a lookup failure reported as a pass), #1774 ("no mirror found"
read as "nothing to lose"), #1716 (checks that pass when they cannot observe) — and
`src/atdd_ext_docs/verdict.py` exists to keep them apart here. An absent asciidoctor
is not a clean corpus; it is an unexamined one.

## Resolve or report — never invent

The relationship graph is **derived, not stored**: edges live in the `.adoc`
attributes and the graph is a projection rebuilt on demand, because a persisted graph
is a second registry and a second registry drifts.

Every relationship target is resolved against the set of **declared** `doc-id`s. A
target outside that set is a reported finding. It is never fabricated into a node,
and never silence.

This is not a stylistic preference. Reproduced live on the ATDD working tree,
2026-09-06 (#1758): of 3208 nodes in the traceability graph, 44 are fabricated; of
168 `feature -> component` containment edges, **147 (87.5%) point at features no file
declares**, hanging off 28 invented parents. The mechanism is `_ensure_node` at
`graph_builder.py:215`, called on both endpoints of every edge.

Fabrication is worse than absence: an absent parent leaves a node *orphaned*, which
an orphan check catches, while a fabricated parent makes it look *connected*. That is
why `tests/` asserts the **node count** directly and not merely the presence of a
finding — and why `graph_builder.py` is not reused. There is exactly **one**
documentation resolver (`src/atdd_ext_docs/graph.py`), which is the discipline #1755
found missing when the same lifecycle resolution turned up implemented seven times.

## Rollout is a measurement, not a phase

All nine rules ship `disposition: advisory` with a concrete `escalate_when` **from
birth**, recorded the way core records it — in a `disposition_rationale` term whose
`values` carry the measurement under a **date-stamped key**
(`measured_2026_09_06:`), following `coach.issue.feature-binding-must-resolve`, the
one existing precedent and the node #1782 cites. The date in the key is the
anti-staleness mechanism: it is what let #1782 notice a recorded `638 of 808`
against a live `478 of 908`. Rollout is a measurement checkpoint that flips dispositions once the corpus
is compatible — not a later build slice that forces every earlier slice to ship with
no escalation story and then re-opens all of them.

Every one here carries a measurement **taken on 2026-09-06**, not a recalled one. On `afokapu/atdd @ main`: **71** markdown beneath `docs/`, **18**
non-dotfile markdown at the repository root (**89** total, 90 counting
`.atdd-launch-prompt.md`), and **0** `.adoc` anywhere. The corpus is 0% compatible,
which is precisely why advisory is the only honest disposition today. Re-take the
measurement at the checkpoint; do not escalate on the number recorded here.

Escalation to strict is a **MAJOR** change class, released separately from this
additive landing.

## Layout

```
atdd.extension.planner.docs/
├── atdd.extension.yaml
├── conventions/                 # the nine obligations (declarative)
├── scopes/docs-corpus.scope.yaml
├── gates/docs-capability.gate.yaml
├── relationships.yaml           # extension-internal edges only (boundary spec §6.2)
└── implementations/docs-capability/
    ├── atdd.implementation.yaml
    ├── pyproject.toml           # the atdd.documentation entry point
    ├── src/atdd_ext_docs/
    │   ├── verdict.py           # the four meanings, kept from collapsing
    │   ├── corpus.py            # format, identity, area indexes
    │   ├── graph.py             # THE resolver — resolve or report
    │   ├── adr.py               # ADRs and the derived registry
    │   ├── declaration.py       # path shape + the undeclared-change inverse
    │   ├── render.py            # asciidoctor, and what its absence means
    │   └── capability.py        # the seam, and the report channel
    ├── fixtures/                # clean + one dirty tree per corpus rule
    └── tests/
```

The extension **does not own its runtime**. It targets `atdd.workspace.python-pytest`
by id and contract range (`^1.0.0`); the provider is never bundled here.

## Running the checks

```sh
cd implementations/docs-capability && python3 -m pytest tests -q
```

`asciidoctor` is a Ruby dependency and is not required to run the suite — every test
whose subject is not the renderer stubs it, so the suite's verdicts do not silently
change with the toolchain's presence.

## Not in this package

- **The 89-file migration.** Spec 2 §1 puts ATDD's own adoption inside this unit, and
  it is right that it belongs with the extension: ATDD is the only consumer, and its
  corpus is the only one large enough to exercise the archive path, `doc-id`
  uniqueness at scale, the resolver and the reference validator. But the corpus lives
  in the **core repository**, not in this hub, so the migration is executed there
  against this extension. **This package is the enforcement; the migration is its
  acceptance evidence and is still outstanding.**
- **Promoting archived documents into `purpose/`, `architecture/` or `delivery/`.**
  Migration preserves history and does not classify it as current truth. Spec 2 §2
  names this as the rule most likely to be violated under time pressure, and
  violating it recreates the exact problem #1782 exists to solve.
- **The `refines` verb.** Its meaning overlaps containment, which the filesystem
  already expresses by nesting. Four verbs that each do distinct work beat five where
  one is decorative; it ships when someone produces a concrete pair of documents where
  `refines` says something the directory structure does not.
- **Operator verbs** (`atdd docs build`, `atdd docs check`), which require #1623.
