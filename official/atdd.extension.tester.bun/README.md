# `atdd.extension.tester.bun`

Tester-role conventions for a **`bun test`** suite. 15 rule nodes, realized by
`bun_tester_discipline_detector` in `atdd.workspace.bun`.

Mirrors `convex.extension.tester.base` rule for rule where the obligation applies to
this stack.

**Identity and binding** — what makes the coverage gate able to see the suite at all:
`test-carries-urn-identity`, `acceptance-binding-declared`, `phase-declared`,
`covers-tag-well-formed`, `routing-runtime-family`, `imports-bun-test`.

Header, not filename. Core's `tester.filename.test-carries-urn-identity` is explicit
that a test's authoritative identity is its header — and the two-level model (file
header binds the file, a per-`it()` `// @covers` tag binds one case) is issue
#1783's design, which lets a real suite adopt ATDD without a rename.

**Phase discipline** — `red-fails-first`, `red-behavioral-assertion`,
`smoke-observable-assertion`, `smoke-no-collaborator-substitution`, `no-self-skip`,
`test-isolation-no-live-state`, `security-auth`, `security-input`, `telemetry-emit`.

`no-self-skip` catches `it.skip` **and** `if (!process.env.X) return` — the same
fault in disguise, and the more common one. It deliberately does *not* flag
`.fails` / `.failing`, because core's RED vocabulary lists those as accepted
guaranteed-fail markers; the graph records that constraint as an explicit edge.

## The htmx half is a separate package

`atdd.extension.tester.htmx` carries the three hypermedia tester rules — endpoint
coverage, fragment assertions, and out-of-band destination ids. A Bun repo serving
JSON installs this package and not that one.

## Install

The procedure, its two non-obvious steps, and the ratchet adoption path are
documented once in [`atdd.workspace.bun`](../atdd.workspace.bun/README.md#installing-into-a-consumer-repo)
— the runtime must be installed first, and `atdd substrate add` needs `--path` until
core resolves a registry entry's `source` against the registry root rather than the
consumer root.
