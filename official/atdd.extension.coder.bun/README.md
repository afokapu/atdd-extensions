# `atdd.extension.coder.bun`

Coder-role conventions for the **Bun / TypeScript runtime**. 38 rule nodes, realized
by five detector families in `atdd.workspace.bun`.

This is the package a Bun repo installs whether or not it serves hypermedia. Pair it
with `atdd.extension.tester.bun`; add `coder.htmx` / `tester.htmx` only if the app
returns fragments.

| family | rules | covers |
|---|---|---|
| `bun_clean_architecture_detector` | 12 | layering, composition, DTOs, boundaries, layer naming |
| `bun_green_traceability_detector` | 10 | GREEN/URN headers — extended to `.html` templates |
| `bun_security_hygiene_detector` | 7 | secrets, SQL injection, missing auth, logging, error responses |
| `bun_ts_metrics_detector` | 7 | complexity, MI, comment ratio, dead code, duplication |
| `bun_fullstack_detector` | 2 | `Bun.serve` over node-compat servers; one lockfile |

**No Python in the toolchain.** The seven metric rules are ported natively from the
`python-pytest` detectors and verified numerically identical — MI agrees to ten
decimal places. `dead-code-reachability` is deliberately *more* accurate than its
sibling: it builds the import graph with Bun's in-process TypeScript parser, so a
type-only import — erased at compile time — no longer keeps a dead module alive.

## The relationship graph says something

32 authored edges across five types, not an alphabetical chain. A few that carry
real information:

- `quality-comments` **co-extracted-from** `quality-mi` — the comment ratio is
  literally a term in the MI formula.
- `commons-domain-no-outbound` **specializes** `design-hierarchy-import` — the
  general inward-only rule, narrowed to one tree.
- `layer-naming` **complements** `design-hierarchy-import` — the layering rules can
  only read a layer the naming rule guarantees is declared.
- `server-uses-bun-serve` **relates-to** `composition-root` — `server.ts` is a
  composition root precisely because `Bun.serve` is the assembly point.

## Install

The procedure, its two non-obvious steps, and the ratchet adoption path are
documented once in [`atdd.workspace.bun`](../atdd.workspace.bun/README.md#installing-into-a-consumer-repo)
— the runtime must be installed first, and `atdd substrate add` needs `--path` until
core resolves a registry entry's `source` against the registry root rather than the
consumer root.
