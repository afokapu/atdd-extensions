# atdd.workspace.git-worktree

Official ATDD **workspace provider** — a reusable, domain-agnostic *isolation
boundary* built on git worktrees, plus the source-control mechanics that run
inside it.

This is a *provider*, not a use-case extension, and it is **not a runner**. It
owns no execution capability: it provides the environment in which work happens
and the git plumbing for that work to be committed safely. It owns no
conventions, scopes, gates, GitHub/cmux/agent semantics, or test runner — those
live in the extensions and runner-workspaces that depend on it.

## Capabilities

| capability | domain | contract |
|------------|--------|----------|
| `environment.git-worktree` | `environment` | `atdd.workspace.capability.environment.isolation.v1` |
| `source_control.commit-trailers` | `source_control` | `atdd.workspace.capability.source-control.commit-trailers.v1` |

### environment.isolation

Each unit of work gets its own git worktree — a flat-sibling checkout of a
single branch. Worktrees share the object store but isolate the working tree and
index, so parallel branches never collide. The provider **never mutates the
shared git directory**: per-worktree config is written with `git config
--worktree` only, and `core.bare` / `core.worktree` / `core.hooksPath` are
guarded because setting them on the shared config corrupts sibling worktrees.

- **layout:** flat sibling of the main checkout
- **boundary:** one worktree per branch
- **create:** `git worktree add ../<prefix>-<slug> -b <prefix>/<slug>`
- **remove:** `git worktree remove <path>` — only **after** the branch's PR lands

### source_control.commit-trailers

The *mechanism* for appending machine-readable trailers to commit messages —
idempotent insertion into the message footer via `git interpret-trailers`. This
capability owns no trailer schema: **which** trailers are required is policy
owned by the consuming extension (e.g. `atdd.extension.github`). Re-applying the
same key/value never duplicates a trailer.

## Contract

- **id:** `atdd.workspace.git-worktree` (scope segment `workspace`)
- **contract_version:** `1.0.0` — versions this provider's capability contracts
  as a set.

## How extensions use it

An extension declares the dependency in its `atdd.extension.yaml`:

```yaml
depends_on:
  workspaces:
    - id: atdd.workspace.git-worktree
      contract: "^1.0.0"
```

At resolve time the provider supplies the isolation boundary the extension's
work runs in and the commit-trailer mechanics it commits with. Worktree
instances are generated and never committed.

## Layout

```text
atdd.workspace.git-worktree/
  atdd.workspace.yaml   # provider manifest (id, contract_version, capabilities)
  adapter/              # isolate.py + trailer.py — the capability contract stubs
  conformance/          # proves this provider satisfies its capability contracts
```
