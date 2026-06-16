# atdd.workspace.python-pytest

Official ATDD **workspace provider** — a reusable, domain-agnostic Python/pytest
runtime that validator implementations run inside.

This is a *provider*, not a use-case extension. It owns runtime machinery only
(language, runner, package manager, command, discovery + run contract). It does
**not** own conventions, scopes, gates, or any backend/frontend/domain semantics
— those live in the extensions that depend on it.

## Contract

- **id:** `atdd.workspace.python-pytest` (scope segment `workspace`)
- **contract_version:** `1.0.0` — the discovery + run contract implementations
  must satisfy. The resolver checks an implementation's `contract_version`
  against this with SemVer (`^1.0.0`) and refuses on mismatch.

## How extensions use it

An extension declares the dependency in its `atdd.extension.yaml`:

```yaml
depends_on:
  workspaces:
    - id: atdd.workspace.python-pytest
      contract: "^1.0.0"
```

Each `atdd.implementation.yaml` the extension ships declares
`targets_workspace: atdd.workspace.python-pytest` and the `contract_version` it
satisfies. At resolve time the provider is materialized into a **workspace
instance** under `.atdd/resolved-workspaces/atdd.workspace.python-pytest/<version>/`
and the implementations are run there. Instances are generated, cacheable, and
never committed.

## Layout

```text
atdd.workspace.python-pytest/
  atdd.workspace.yaml      # provider manifest (id, contract_version, runtime, discovers)
  runtime/                 # shared runtime files materialized into each instance
  adapter/                 # discover.py + run.py — the contract implementation
  conformance/             # proves this provider satisfies contract_version 1.0.0
```
