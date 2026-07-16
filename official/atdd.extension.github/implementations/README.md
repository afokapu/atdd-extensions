# `atdd.extension.github` — implementations

> **Built.** These implementations are real, discoverable units — each a
> directory with an `atdd.implementation.yaml` (declaring
> `targets_workspace: atdd.workspace.python-pytest` + `contract_version`) plus a
> module and its pytest suite. The python-pytest provider **discovers** each
> manifest and **runs** its suite; CI exercises the full discover→run chain (see
> the `github-implementations` job in `.github/workflows/validate-packages.yml`).

After the coach-orchestration decommission, this package ships only the two
**post-merge provider side-effect workers**. The PR/issue lifecycle gates, the
`gh` PATH shim, and the forbidden-command classifier were removed with their
conventions (recoverable from git history) — they enforced an orchestration
model core is retiring.

| Implementation | Type | Realizes convention node | What it does |
|----------------|------|--------------------------|--------------|
| `release_worker` | post-merge side-effect worker | `github.release.version-decided-drains-to-tag-and-publish` | drains core's neutral `version_decided` outbox signal → annotated git tag `vX.Y.Z` + PyPI publish (double-gated) + tag `external_ref`. Never imports `atdd` (duck-typed store; structural `SyncProvider` conformance). |
| `state_sync_provider` | store↔GitHub sync provider | `github.state.sync-store-from-issues` | heals store↔GitHub both ways — ingest polls issues → canonical inbox events; push drains the outbox → GitHub. Reads the `atdd:{PHASE}` label (`github.issue.label-taxonomy`). Never imports `atdd`. |

Both are **workers, not file-scanning validators**: they act on core's outbox
signals and the live `gh` API, so they declare no v1.1 `report:` channel (there
is no consumer file tree to scan). Their pytest suites are unit tests of the
drain / sync logic, run by the provider's discover→run chain.
