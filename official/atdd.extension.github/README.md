# atdd.extension.github

Official ATDD **GitHub platform extension**. It performs the GitHub-side
**post-merge side-effects** core triggers through provider-neutral signals, and
carries the label contract those side-effects read.

> **Boundary in one line:** *Core owns the lifecycle. This extension performs the
> GitHub effects core decides.* Core decides *when* a unit advances, closes, or
> releases; this package performs the provider effect (cut the tag + publish,
> sync the store from issues) and never owns the decision.

## Scope note — orchestration decommission

This package used to also ship a `gh` PATH shim, a forbidden-`gh`-command
classifier, and a family of PR/issue **lifecycle gates** (merge-blocks-on-pre-smoke,
auto-phase-on-merge, base-branch, mass-delete, closes-keyword, green-ships,
runtime-artifacts, issue-create, issue-tracking, projects-fallback, trailer).
Those enforced a coach-orchestration model core is retiring — the `atdd issue`
CLI was removed (core #1309), lifecycle moved into `atdd coach` (#1304–#1358),
and coach sub-worker orchestration is being decommissioned from core (#1487).
The gates and their implementations were removed here rather than carried as
cadavers. They remain recoverable from git history.

## Identity

```text
publisher : atdd
kind      : extension
name      : github
id        : atdd.extension.github
manifest  : atdd.extension.yaml
```

## What this package owns

- **Conventions** — three `github.*` nodes:
  - `github.release.version-decided-drains-to-tag-and-publish` — the post-merge
    release side-effect (drain core's neutral `version_decided` → git tag + PyPI
    publish + tag `external_ref`).
  - `github.state.sync-store-from-issues` — the GitHub-side sync provider that
    heals store↔GitHub in both directions (ingest issues → inbox; drain outbox →
    GitHub) for core's provider-agnostic sync seam (#1364).
  - `github.issue.label-taxonomy` — the `atdd:{PHASE}` label contract the sync
    provider reads.
- **Implementations** — two post-merge provider side-effect workers:
  `release_worker`, `state_sync_provider` (see `implementations/README.md`).

## Convention → core mapping

Every surviving behavior **realizes** a core node (the authority) — it does not
restate it.

| GitHub behavior (this extension) | Maps onto core node / signal (owns the rule) |
|----------------------------------|----------------------------------------------|
| `github.issue.label-taxonomy` (`atdd:<PHASE>` labels) | `coach.lifecycle.phase-machine` |
| `github.release.version-decided-drains-to-tag-and-publish` | core `version_decided` outbox signal (#1172) |
| `github.state.sync-store-from-issues` | core provider-agnostic sync seam (#1364) |

## Does NOT own

- **Core lifecycle.** *When* a unit may advance, close, or release — owned by
  core. This extension only performs the GitHub effect core decided.
- **Core graph semantics, core role semantics, any core coach node.** It
  *references* them (see the mapping table and
  `atdd.extension.yaml::depends_on.targets`) and must break if it tries to
  redefine them.
- **Core↔extension graph edges.** `relationships.yaml` carries **only**
  extension-internal edges under `graph_id: atdd.extension.github.relationships`.

## Layout

```text
atdd.extension.github/
  atdd.extension.yaml      # manifest: id, kind, role, owns, depends_on.targets/workspaces
  conventions/             # 3 github.* convention nodes
  relationships.yaml       # extension-internal edges only
  implementations/         # release_worker + state_sync_provider (post-merge workers)
  README.md
```

## Provenance

Each convention node carries `source.legacy_path` + `source.legacy_section`
(and `legacy_rule_id` where one existed) back to the core legacy convention it
was atomized from, with `extraction_mode: high_fidelity`.
