# `atdd.extension.coder.htmx`

Coder-role conventions for the **full-stack Bun + htmx** stack. Forty-five rule
nodes, realized by the six detector families in `atdd.workspace.bun` — with **no
Python anywhere in the toolchain**.

> **This is the CODER half.** An ATDD extension is scoped to one persona (`role:` ∈
> planner / tester / coder / coach), which is why every real stack in this hub ships
> a *pair*. The tester half is **`atdd.extension.tester.htmx`** (10 rules); install
> both. The two scan disjoint file sets — these five families never open a test
> file.

## GREEN traceability — `coder.bun.green-*`

The mirror of an obligation Python and Vite already realize: **every implementation
file carries a header binding it to the plan graph.**

```
URN: component:{wagon}:{feature}:{Name}:{side}:{layer}
Tested-By:
- test:{wagon}:{feature}:{ACCEPTANCE-ID}
Runtime: bun | browser | isomorphic
Purpose: <= 80 chars
```

Python writes it with `#`, Vite with `//`, and this realization with `//` in source
**and `<!-- … -->` in `.html` templates**. Only the comment syntax is per-stack; the
keywords, the six-segment URN and the field order are one obligation with three
detectors, linked by the shared `GREEN-URN-00n` / `GREEN-HEADER-00n` aliases.

Ten rules: `urn-marker`, `urn-pattern`, `urn-wagon-feature`, `urn-name-matches`,
`urn-side`, `urn-layer`, `header-runtime`, `header-purpose`, `header-tested-by`,
`header-order`.

**Two deliberate departures from the Vite sibling:**

1. **`.html` templates are implementation.** htmx moves behaviour *into* markup — an
   `hx-post` on a button *is* the request. A traceability layer that read only `.ts`
   would leave the behavioural half of an htmx app unbound to the plan graph.
2. **`suppress-and-clean`, not `documentation-only`.** Core treats
   `documentation-only` as never-fails-the-build, which is right when retrofitting a
   large existing codebase and wrong for a new one: a traceability rule that cannot
   fail is a rule that quietly does not get adopted. Adopting in an existing repo
   still works — `--record-ratchet` a baseline and the debt is held flat while new
   untraceable files are blocked. One field per rule reverts to exact Vite parity.

## TypeScript metrics — native, no Python

| rule | alias | threshold |
|---|---|---|
| `complexity-cyclomatic` | `COMPLEXITY-CYCLOMATIC-TS-001` | <= 10 per function |
| `complexity-nesting` | `COMPLEXITY-NESTING-TS-001` | <= 4 depth |
| `complexity-length` | `COMPLEXITY-LENGTH-TS-001` | <= 50 code lines |
| `quality-mi` | `REFACTOR-QUALITY-MI-TS-001` | MI >= 20 |
| `quality-comments` | `REFACTOR-QUALITY-COMMENTS-TS-001` | ratio >= 10% |
| `dead-code-reachability` | `DEAD-CODE-REACHABILITY-TS-001` | reachable from a structural root |
| `duplication-intra-layer` | `DUPLICATION-TS-001` | no 7-line repeat within a layer |

Ported from the `python-pytest` detectors and verified to produce identical numbers
(MI agrees to ten decimal places). New rule ids rather than the existing
`*-typescript` ones, because two implementations claiming one convention raises
`DuplicateConventionError` the moment a polyglot repo installs both providers; the
shared aliases above carry the lineage instead.

`dead-code-reachability` is the one rule that is *better* than its sibling — it uses
Bun's real TypeScript parser, so a type-only import no longer keeps a dead module
alive.

## Security, logging, error responses

| rule | alias | ported? |
|---|---|---|
| `security-hardcoded-secret` | `SECURITY-HARDCODED-SECRET-001` | **port** — the patterns are language-neutral |
| `security-sql-injection` | `SECURITY-SQL-INJECTION-001` | re-realized — Bun sinks, tagged-template aware |
| `security-missing-auth` | `SECURITY-MISSING-AUTH-001` | re-realized — `Bun.serve` routes, no decorators |
| `logging-console` | `LOGGING-PRINT-001` | re-realized — `console.*`, not `print()` |
| `logging-structured` | `LOGGING-STRUCTURED-001` | re-realized — context object, not `extra=` |
| `error-response-bare-string` | `ERROR-BARE-STRING-001` | re-realized — `Response`, not `HTTPException` |
| `error-response-code-format` | `ERROR-CODE-FORMAT-001` | **port** — the payload is JSON |

Only **two of seven** port verbatim. The rest had to be re-realized because the
python-pytest siblings read a Python AST for FastAPI decorators, `Depends()`,
`print()` and `HTTPException(detail=)` — constructs this stack does not have. The
obligation is shared; the detector is not. That asymmetry is the whole reason a
stack extension is a package rather than a translation of another package.

The sharpest example is `security-sql-injection`, where two nearly identical lines
differ in safety and the distinction has no Python analogue at all:

```ts
sql`SELECT * FROM orders WHERE id = ${id}`        // safe — Bun.sql BINDS the value
db.query(`SELECT * FROM orders WHERE id = ${id}`) // injectable — the value is spliced
```

## Clean architecture — `coder.bun.{commons,design-hierarchy,composition,dto,boundaries,layer}-*`

Twelve rules, mirrored rule-for-rule from `coder.convex.*` and `coder.vite.*`:
layering (`commons-domain-no-outbound`, `commons-application-no-integration`,
`commons-cross-feature-imports-in`, `commons-domain-no-framework-import`,
`design-hierarchy-import`), composition (`composition-root`,
`composition-consumer`), DTOs (`dto-purity`, `dto-placement`, `dto-mapper`),
boundaries (`boundaries-http-client`) and naming (`layer-naming`).

These read the **declared** dependency, so they include type-only imports: an
`import type` from domain into integration is erased at runtime but is still a
design coupling a reader must follow. That is the opposite call from
`dead-code-reachability`, deliberately — the two rules ask different questions of
the same graph.

Two places the stack changes the reading rather than the obligation:

- `commons-domain-no-framework-import` — Vite forbids react/preact/gsap because
  those are *its* frameworks. Here the machinery is `bun:*`, `node:*` and the `Bun.`
  global. The practical test is unchanged: the domain must be runnable with no
  server started.
- `composition-root` — `server.ts` is a root because `Bun.serve` **is** the assembly
  point of a full-stack Bun app. Convex has no equivalent; its function tree has no
  single entry.

## What is still missing

- **No planner or coach extension** — and by decision, not oversight: those
  obligations are stack-agnostic, so a Bun-specific realization would add nothing.

## Hypermedia discipline — `coder.htmx.*`

| rule | disposition | what it catches |
|---|---|---|
| `fragment-interpolation-escaped` | strict (sev 1) | raw `${value}` interpolated into an HTML fragment — stored XSS |
| `endpoint-not-absolute-url` | strict | a verb attribute hardcoding a foreign origin |
| `oob-swap-carries-id` | strict | `hx-swap-oob` with no `id` — htmx drops it silently |
| `destructive-verb-confirms` | strict | `hx-delete` with no `hx-confirm`/`hx-prompt` |
| `mutation-signals-progress` | suppress-and-clean | a mutating request with no `hx-indicator`/`hx-disabled-elt` |
| `no-inline-event-handler` | suppress-and-clean | `onclick="…"` in htmx markup — dies on swap |

## Runtime discipline — `coder.bun.*`

| rule | disposition | what it catches |
|---|---|---|
| `server-uses-bun-serve` | strict | Express/Fastify/Koa/`node:http` instead of `Bun.serve` |
| `single-lockfile` | strict | an npm/Yarn/pnpm lockfile beside Bun's |
| `test-imports-bun-test` | strict | a test importing `vitest`/`jest` when the declared runner is `bun` |

## The through-line

Three of these rules exist because **htmx removes the place the obligation used to
live**, and the migration loses it silently:

- A component framework escapes `{value}` automatically. htmx renders fragments as
  template literals and inserts them via `innerHTML`, so escaping stops being
  automatic exactly where the code looks most familiar.
- A destructive action used to pass through a handler, and the confirmation lived
  in that handler where a reviewer saw it. htmx removes the handler — the point of
  the stack — and the confirmation goes with it unless it is relocated onto the
  element and enforced there.
- A full page navigation gave the user a free progress signal. Swapping a fragment
  in place gives none, which is why users double-submit and orders duplicate.

`test-imports-bun-test` is the ATDD-specific one. A phase gate reports coverage in
terms of the runner it declared; a test bound to a harness that runner never
executes is coverage the gate believes in and that never ran — a green gate over an
unexercised acceptance, which is the failure ATDD exists to prevent.

## Install

```bash
atdd substrate add bun          # the runtime that realizes these rules
atdd substrate add coder.htmx   # the obligations themselves
atdd substrate bind             # → 33 bound, 0 legacy-fallback
```

The workspace must be installed first: the conventions declare obligations, and
without a provider to realize them they bind to nothing.
