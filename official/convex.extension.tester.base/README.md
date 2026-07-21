# convex.extension.tester

Test-surface (tester) conventions for the **Convex + Vitest** stack. Owns the
declarative obligations; the detectors that realize them live in the
`convex.workspace.runtime` provider (two-layer model).

## Status

SKELETON — `conventions: []`. The first node, the Vitest + `convex-test` filename
rendering of the acceptance URN (the Convex sibling of the official
`tester.filename.urn`), is authored once its `convex.workspace.runtime` detector
lands. See the coder package's [`PORTING-PLAN.md`](../convex.extension.coder/PORTING-PLAN.md)
for the full roadmap (tester section).

We keep `conventions` honestly empty until then: no obligation is declared without
a detector to enforce it.
