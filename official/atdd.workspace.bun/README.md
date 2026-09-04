# `atdd.workspace.bun`

Full-stack **Bun** workspace provider — a *real*, non-stub v1.1 runtime.

Bun here is not merely the test runner: it is the server (`Bun.serve`), the
bundler, the package manager and the test runner. That breadth lives in the
runtime descriptor and in the conventions the extensions own — **not** in new
capability contracts. The engine speaks exactly one execution contract
(`atdd.workspace.capability.execution.command-runner.v1`); a provider that invented
a second would be unresolvable by core's binder. So this provider claims the same
single capability every other runtime claims, and simply runs its detectors under
`bun`.

## Why a fork of `frontend.workspace.runtime`, not of `atdd.workspace.typescript`

`atdd.workspace.typescript` is a skeleton: six files of `NotImplementedError`
wired to vitest/pnpm assumptions. `frontend.workspace.runtime` is a working v1.1
adapter with a real detector corpus. Forking the working one made the delta small
enough to state in a sentence:

```python
RUN_COMMAND = ("bun",)      # adapter/run.py — was ("node",)
```

Everything else — discovery, the scan-mount env channel, the JSON report channel,
the CLI boundary, the run-health exit codes — is contract, and contract is what
makes runtimes interchangeable. Because Bun executes `.mjs` **and** `.ts` natively
with no build step, there is also no "Phase 0.5" to graduate to: a detector needing
real TypeScript semantics can be authored as `.ts` today and this same command runs
it.

## Layout

```
adapter/discover.py   find implementations whose contract this provider satisfies
adapter/run.py        run one detector under `bun`; read back RAW v1.1 violations
cli/scan.py           the subprocess boundary core shells out to
lib/scan.mjs          shared scan-mount plumbing (walk, mask, locate, emit)
lib/imports.mjs       module import graph + architectural layer resolution
implementations/      the detector corpus, one directory per family
conformance/          130 tests: the shared contract, per-RULE fires-on-dirty/
                      silent-on-clean, the .atdd substrate exclusion, and the
                      persona boundary
```

`lib/` is this provider's one structural departure from its parent. The
node-runtime detectors each re-implement their own directory walk; here the walk,
the literal/comment masker and the report emitter are factored once, so a check
contains only its detection logic — and so the checks stay under the duplication
convention the coder extension itself enforces.

## Implementations

| family | rules | scans |
|---|---|---|
| `bun_green_traceability_detector` | 10 × `coder.bun.green-*` | JS/TS source **and `.html` templates** — dual comment syntax |
| `bun_ts_metrics_detector` | 7 × complexity / quality / dead-code / duplication | `.ts`, `.tsx` — native port of the python-pytest detectors |
| `htmx_hypermedia_detector` | 6 × `coder.htmx.*` | `.html`, `.htm`, and JS/TS source (htmx markup lives in template literals) |
| `bun_fullstack_detector` | 2 × `coder.bun.*` | JS/TS source and repo lockfiles |
| `bun_security_hygiene_detector` | 7 × security / logging / error-response | JS/TS source and templates |
| `bun_tester_discipline_detector` | 16 × `tester.bun.*` | **test files only** — the persona boundary |
| `bun_clean_architecture_detector` | 12 × layering / composition / DTO / boundaries | `.ts`, `.tsx` — reads the import graph |

All three declare their full rule set in `realizes_convention` as a **list**. A scalar
would bind one rule and leave the rest unenforced while still appearing to work —
the failure mode the conformance suite's `test_every_declared_rule_id_actually_fires`
exists to catch. The Vite sibling `vite_green_traceability_detector` declares a
scalar while emitting ten rule ids, so nine of its ten rules bind to nothing.

The conventions those rules belong to are owned by **`atdd.extension.coder.htmx`**
(source) and **`atdd.extension.tester.htmx`** (suite), never here: the extension owns the obligation, the
provider owns the realization. That split is what lets a second runtime satisfy the
same nine obligations without this package changing.

## No Python in the toolchain

The seven TypeScript metric rules (cyclomatic, nesting, length, MI, comment ratio,
dead-code reachability, intra-layer duplication) were previously reachable only
through `atdd.workspace.python-pytest`, which meant a "full-stack Bun" repo still
needed a Python interpreter to enforce its own code quality. `bun_ts_metrics_detector`
ports all four of those detectors natively.

The port is sound because each Python detector states in its own manifest that it
"inspects TypeScript SOURCE via regex normalization, it does not execute TS" — no
radon, no tree-sitter, no AST. They are deterministic string algorithms, so
transcribing them changes the host language and nothing else. Parity is verified,
not assumed: on identical input both produce `cyclo=13 nest=6 loc=19`, and the
maintainability index agrees to ten decimal places (`28.2109881642`).

One rule is deliberately **more accurate** than its Python sibling.
`dead-code-reachability` builds its import graph with Bun's in-process TypeScript
parser instead of five regexes. A regex cannot tell `import type { T }` from a value
import, so a module whose only referrer is a type-only import — erased at compile
time, therefore not a runtime edge — is counted as reachable. On the shipped
fixture the Python detector finds one dead file; this one finds two. Same
obligation, measured correctly, and possible only because the runtime is Bun.

## Running it

```bash
# through the CLI boundary, exactly as `atdd enforce` does
ATDD_SCAN_ROOTS='["src"]' python3 cli/scan.py --impl htmx_hypermedia_detector

# conformance (requires bun on PATH)
python3 -m pytest conformance/ -q
```

Exit `0` means the provider *ran*, not that the code is clean — violations are the
RAW factual channel and the verdict is the consumer's. Exit `2` is an honest
resolution failure with empty stdout, never a fake-green pass.
