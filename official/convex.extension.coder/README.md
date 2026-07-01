# convex.extension.coder

Source-surface (coder) conventions for the **Convex** backend stack. Owns the
declarative obligations; the detectors that realize them live in the
`convex.workspace.runtime` provider (two-layer model). Targets that provider by id +
contract range — it contains no runtime of its own.

## Conventions

| rule_id | severity | disposition | detector | status |
|---|---|---|---|---|
| `coder.convex.no-server-console-log` | 2 | strict | `convex.workspace.runtime` → `convex_no_server_console_log` | **active** (Phase 0 detector, proven) |

More nodes are ported from the `frg-app/atdd-js/coder/conventions/` drafts — see
[`PORTING-PLAN.md`](PORTING-PLAN.md). Each lands only with a real detector behind
it (no obligation is declared without something to enforce it).

## Relationship to core

Each Convex convention is the stack-bound realization of an agnostic core
obligation, declared narratively in the node body (e.g.
`coder.convex.no-server-console-log` is the Convex sibling of the agnostic
`coder.logging.print`). Core↔extension edges are NOT graph-authored (boundary spec
§6.2); only intra-extension edges live in `relationships.yaml`.
