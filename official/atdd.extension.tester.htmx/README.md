# `atdd.extension.tester.htmx`

Tester-role conventions for **htmx endpoint tests**. Three rule nodes, realized by
`htmx_tester_detector` in `atdd.workspace.bun`. The tester half of the pair whose
coder half is `atdd.extension.coder.htmx`.

| rule | mirrors | catches |
|---|---|---|
| `endpoint-coverage` | `tester.convex.interlocking-route-coverage` | an `hx-` endpoint declared in markup that no test exercises |
| `fragment-asserts-markup` | — | a test asserting status and never reaching the body |
| `oob-target-asserted` | `tester.convex.interlocking-trace-binds-declared-route` | a test confirming `hx-swap-oob` is present but never asserting the destination id |

## Why the markup is this stack's route space

`endpoint-coverage` is the direct counterpart of Convex's route-coverage rule, and
the one adaptation is where the declaration lives. A Convex route is declared in
`plan/_trains/_interlockings/**/*.yaml`; an htmx endpoint is declared in the
**markup**, because `hx-get="/orders"` *is* the request. So the templates are the
route space, and reading them is the honest location of the declaration rather than
a boundary violation.

It **no-ops on a mount with no test files** — a coverage rule needs both sides, and a
tester-persona rule must not produce findings on a tree that contains no tests. Same
shape as the frontend provider's design-no-op pattern.

## One defect, two personas

`oob-target-asserted` and `coder.htmx.swap-oob-carries-id` are the same failure seen
from source and from suite, and neither closes it alone:

- the **coder** rule makes the server *emit* an id on an out-of-band element
- the **tester** rule makes a test prove it is the id the page will *match*

htmx drops an oob element whose id matches nothing — no error, no console warning, no
swap. A test that asserts the response merely contains `hx-swap-oob` has confirmed
the server's half and nothing about the destination, which is the half a template
refactor breaks.

## Three rules is the minimum, not a coincidence

Core refuses an orphan convention node (`compose.extension_orphan_nodes`, extending
`planner.relationship.no-orphan-nodes`) and admission refuses cross-package edges. A
**one-rule stack extension is therefore structurally impossible** — its only node can
never be an endpoint of an intra-package edge. An earlier cut of this package shipped
a single rule and `atdd validate package` rejected it outright.

## Install

The procedure, its two non-obvious steps, and the ratchet adoption path are
documented once in [`atdd.workspace.bun`](../atdd.workspace.bun/README.md#installing-into-a-consumer-repo)
— the runtime must be installed first, and `atdd substrate add` needs `--path` until
core resolves a registry entry's `source` against the registry root rather than the
consumer root.
