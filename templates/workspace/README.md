# Workspace provider template

Copy this directory to author a **first-class workspace provider** — a reusable,
domain-agnostic runtime that many extensions target (e.g. `python-pytest`,
`node-vitest`, `go-test`).

A provider owns runtime machinery only. It does **not** own conventions, scopes,
gates, or domain semantics — those belong to the extensions that depend on it.

```text
<publisher>.workspace.<name>/
  atdd.workspace.yaml   # id, contract_version, runtime, discovers
  runtime/              # shared runtime files materialized into each instance
  adapter/              # discover + run — the contract implementation
  conformance/          # proves the provider satisfies its contract_version
```

Choosing between a provider and an embedded runtime:

- **Default — provider.** Any runtime meant to be shared by more than one
  extension should be a provider from day one.
- **Escape hatch — embedded.** A private or experimental runtime may live inside
  a single extension under `validators/workspaces/<name>/`. Promote it to a
  provider before a second extension needs it.
