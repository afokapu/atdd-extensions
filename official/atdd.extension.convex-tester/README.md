# atdd.extension.convex-tester

Test-surface (tester) conventions for the **Convex + Vitest** stack. Owns the
declarative obligations; the detectors that realize them live in the
`atdd.workspace.convex` provider (two-layer model).

## Status

SKELETON — `conventions: []`. The first node, the Vitest + `convex-test` filename
rendering of the acceptance URN (the Convex sibling of the official
`tester.filename.urn`), is authored once its `atdd.workspace.convex` detector
lands. See the coder package's [`PORTING-PLAN.md`](../atdd.extension.convex-coder/PORTING-PLAN.md)
for the full roadmap (tester section).

We keep `conventions` honestly empty until then: no obligation is declared without
a detector to enforce it.
