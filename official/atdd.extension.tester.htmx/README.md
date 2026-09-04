# `atdd.extension.tester.htmx`

The **tester** half of the Bun + htmx pair. Sixteen rule nodes, realized by
`bun_tester_discipline_detector` in `atdd.workspace.bun`.

## Why a separate package

An ATDD extension is scoped to **one persona** — `role:` in the manifest, and the
third segment of the id (`<publisher>.extension.<persona>.<name>`, persona ∈
planner / tester / coder / coach). That is why every real stack in this hub ships a
pair, not a package:

| stack | coder | tester |
|---|---|---|
| Vite | `frontend.extension.vite-coder` | `frontend.extension.vite-tester` |
| Convex | `convex.extension.coder` | `convex.extension.tester` |
| Bun + htmx | `atdd.extension.coder.htmx` | **this** |

The split is not bookkeeping. The coder extension governs **source** — what the code
is and how it is built. This one governs the **suite** — what is proven, and how
honestly. They scan disjoint file sets: the five coder families never open a test
file, and this one opens nothing else. So the two can be adopted, ratcheted and
versioned independently.

## Identity and binding — what makes the coverage gate able to see anything

| rule | what it requires |
|---|---|
| `test-carries-urn-identity` | `// URN: test:{wagon}:{feature}:{ACCEPTANCE-ID}` |
| `acceptance-binding-declared` | `// Acceptance: acc:…` or `// Train: …` |
| `phase-declared` | `// Phase:` ∈ RED / UNIT / SMOKE / E2E |
| `covers-tag-well-formed` | per-`it()` `// @covers acc:…` tags are real URNs |

**Header, not filename.** Core's `tester.filename.test-carries-urn-identity` is
explicit that a test's authoritative identity is its header, and this realization
never parses a filename for identity. That is the same conclusion issue #1783
reached independently for backend TypeScript: a real suite's files are wagon-level
and cover several acceptances, so a one-acceptance-per-filename rule would force a
rename of the whole suite to satisfy a tool.

**Two levels.** The file header binds the *file*; a `// @covers` tag above an
`it()` binds *one case*. That gives many-cases-to-one-acceptance precision without
the rename — issue #1783's design, implemented.

Without this group the gate does not fail — it passes **vacuously**, reporting
acceptances as uncovered while the tests sit there passing. That is the specific
hole this package exists to close.

## Phase discipline

| rule | catches |
|---|---|
| `red-behavioral-assertion` | a RED test asserting only `toBeDefined()` — green against a stub |
| `smoke-observable-assertion` | a SMOKE test asserting on objects it built itself |
| `smoke-no-collaborator-substitution` | `spyOn` / `mock.module` in a SMOKE test |
| `no-self-skip` | `it.skip`, and `if (!process.env.X) return` — the same fault in disguise |
| `test-isolation-no-live-state` | `process.env` mutation, writes outside a temp dir |

`no-self-skip`'s environment-guard form is the one worth knowing about: a live smoke
that bails when `DATABASE_URL` is unset does nothing in exactly the environment
where nobody is watching, and reports green.

## The htmx-native rule

`fragment-asserts-markup` has **no counterpart in any other stack's tester
extension**, because no other stack puts the response contract in the markup.

```ts
expect(res.status).toBe(200);                 // route exists — proves nothing else
const html = await res.text();
expect(html).toContain('id="order-1"');       // the id a later oob swap targets
```

htmx swaps the response body into the live DOM, so the hx-attributes, the element
ids that subsequent out-of-band swaps target, and the structure itself *are* the
interface. A status-only test will not notice when a refactor drops the `id` that a
sibling fragment's `hx-swap-oob` needs — which fails silently at runtime, exactly as
`coder.htmx.oob-swap-carries-id` describes from the other side.

## Dispositions

Core's tester nodes are largely `documentation-only`, which core's `coverage_report`
treats as never-fails-the-build. Right for retrofitting, wrong for a new stack: a
coverage-binding rule that cannot fail is a rule that will not be adopted. The rules
here gate — `strict` where a violation is always a bug, `suppress-and-clean` where a
ratchet should hold an existing suite flat while it migrates.

## Install

```bash
atdd substrate add bun            # the runtime
atdd substrate add coder.htmx     # source obligations
atdd substrate add tester.htmx    # suite obligations
atdd substrate bind               # → 60 bound, 0 legacy-fallback
```
