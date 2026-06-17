# atdd.extension.github

Official ATDD **GitHub platform extension**. It maps GitHub concepts onto the
ATDD lifecycle.

> **Boundary in one line:** *Core owns the lifecycle. This extension maps GitHub
> concepts onto the lifecycle.* The extension never owns *when* a unit may
> advance or close — that is core. It owns *how GitHub expresses* advancement and
> closure (labels, PR keywords, Projects, the auto-phase workflow), plus two
> platform-safety rules that have no core counterpart.

Authored conventions-first per the boundary spec
(`docs/atdd-extension-github-boundary.md` in core, afokapu/atdd#1118). This slice
ships the convention layer, manifest, and extension-internal relationships;
implementations are **stubs** (`implementations/README.md`) — no runtime is
ported.

## Identity

```text
publisher : atdd
kind      : extension
name      : github
id        : atdd.extension.github
manifest  : atdd.extension.yaml
```

## What this package owns

- **GitHub conventions** — 14 `github.<area>.<slug>` nodes covering issue
  tracking, the label taxonomy, auto-phase-on-merge, the Projects-access
  fallback, issue-create enforcement, the PR-merge/keyword/runtime-artifact
  rules, the two platform-safety PR rules, the gh PATH shim, the forbidden gh
  command patterns, and the `Issue:` commit trailer.
- **Selectors** — the `github_issue` and `github_pr` selector types.
- **Implementations (to be built)** — gh shims, the forbidden-command policy,
  the PR-merge gate, and the PR base-branch / mass-delete validators.
- **Assets (to be built)** — issue/PR templates and the `atdd-auto-phase.yml`
  workflow.

## Convention → lifecycle mapping

Every GitHub behavior in the left column **realizes** a core node (the
authority) in the right column — it does not restate it. The two bottom rows are
genuinely platform-local and owned outright by this extension.

| GitHub behavior (this extension) | Maps onto core node (owns the rule) |
|----------------------------------|-------------------------------------|
| `github.issue.label-taxonomy` (`atdd:<PHASE>` labels) | `coach.lifecycle.phase-machine` |
| `github.issue.auto-phase-on-merge` (`atdd-auto-phase.yml`, `closingIssuesReferences`) | `coach.lifecycle.single-step-advance-on-delivery` |
| `github.pr.merge-blocks-on-pre-smoke-close`, `github.pr.closes-keyword-discipline`, `github.pr.green-ships-without-smoke` | `coach.lifecycle.no-terminal-before-lifecycle-satisfied` |
| `github.pr.runtime-artifacts-blocked` (diff inspection) | `coach.execution.runtime-state-not-a-delivery-artifact` |
| `github.issue.create-via-atdd-not-gh`, `github.shim.gh-issue-create-blocked` (manifest registration on issue create) | `coach.execution.atomic-registry-write` |
| `github.issue.trailer-required` (Issue trailer interpretation) | `coach.execution.work-provenance` (design_candidate, #1122) |
| `github.pr.base-must-be-default-branch`, `github.pr.mass-delete-guard` | platform safety rules — extension-owned, no core counterpart |
| `github.command.forbidden-gh-patterns` (ATDD-FORBID-GH-*, ATDD-LOOP-GH-PR-POLL) | enforcement of the create/PR-base rules above on the GitHub command surface |

## Does NOT own

- **Core lifecycle.** *When* a unit may advance or close — owned by
  `coach.lifecycle.*`. This extension only expresses it on GitHub.
- **Core graph semantics, core role semantics, any core coach node.** It
  *references* them (see the mapping table and
  `atdd.extension.yaml::depends_on.targets`) and must break if it tries to
  redefine them.
- **Core↔extension graph edges.** Graph composition is unproven (boundary spec
  §6.2). `relationships.yaml` carries **only** extension-internal edges under
  `graph_id: atdd.extension.github.relationships`.
- **A runtime move.** Legacy `*.convention.yaml` stay the source of truth in core
  until a consuming loader reads extension-owned nodes (boundary spec §6.3).

## Layout

```text
atdd.extension.github/
  atdd.extension.yaml      # manifest: id, kind, role, owns, depends_on.targets/workspaces
  conventions/             # 14 high-fidelity github.* convention nodes (schema 1.1.0)
  relationships.yaml       # extension-internal edges only
  implementations/         # STUBS — names the validators/shims to be built later
  README.md
```

## Provenance

Each convention node carries `source.legacy_path` + `source.legacy_section`
(and `legacy_rule_id` where one existed) back to the core legacy convention it
was atomized from, with `extraction_mode: high_fidelity`.
