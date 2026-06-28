# atdd.workspace.fastapi

Official ATDD **workspace provider** — a reusable, domain-agnostic runtime that
validator implementations run inside.

> **SKELETON.** This slice ships the structural skeleton only: the provider
> manifest, adapter signatures (`adapter/discover.py` + `adapter/run.py` as
> documented `NotImplementedError` stubs), a skipped conformance suite, and empty
> `runtime/` + `e2e/` directories. Real discovery+run logic and shared runtime
> files are authored in the build slice, mirroring `atdd.workspace.python-pytest`.

This is a *provider*, not a use-case extension. It owns runtime machinery only
(language, runner, package manager, command, discovery + run contract). It does
**not** own conventions, scopes, gates, or any backend/frontend/domain semantics
— those live in the extensions that depend on it (`atdd.extension.coder` /
`atdd.extension.tester`).

## Contract

- **id:** `atdd.workspace.fastapi` (scope segment `workspace`)
- **contract_version:** `1.0.0` — the discovery + run contract implementations
  must satisfy. The resolver checks an implementation's `contract_version`
  against this with SemVer (`^1.0.0`) and refuses on mismatch.

## How extensions use it

An extension declares the dependency in its `atdd.extension.yaml`:

```yaml
depends_on:
  workspaces:
    - id: atdd.workspace.fastapi
      contract: "^1.0.0"
```

Each `atdd.implementation.yaml` the extension ships declares
`targets_workspace: atdd.workspace.fastapi` and the `contract_version` it satisfies.

## Layout

```text
atdd.workspace.fastapi/
  atdd.workspace.yaml      # provider manifest (id, contract_version, capabilities, discovers)
  runtime/                 # shared runtime files materialized into each instance (build slice)
  adapter/                 # discover.py + run.py — the contract implementation (stubs)
  conformance/             # proves this provider satisfies contract_version 1.0.0 (skipped stub)
```
