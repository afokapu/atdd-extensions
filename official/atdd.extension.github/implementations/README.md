# `atdd.extension.github` — implementations (STUBS)

> **Slice 3 (afokapu/atdd#1118) is conventions-first.** This directory enumerates
> the executable units this extension will ship. **No runtime is ported here** —
> per the boundary spec §6.3, the legacy `*.convention.yaml` and their validators
> stay the source of truth in core until a consuming loader reads extension-owned
> nodes. These are placeholders that name the implementations a later build slice
> will author.

Each implementation, when built, will live under
`implementations/<name>/atdd.implementation.yaml`, declare
`targets_workspace: atdd.workspace.python-pytest` + the `contract_version` it
satisfies (see `../atdd.extension.yaml::depends_on.workspaces`), and emit
violations under the matching `github.*` convention rule_id.

| Planned implementation | Type | Realizes convention node | Legacy source to port |
|------------------------|------|--------------------------|-----------------------|
| `gh_path_shim` | shim + pre-commit | `github.shim.gh-issue-create-blocked` | `path_shim_gh.convention.yaml` (L3a/L3b) |
| `forbidden_command_policy` | command-policy patterns | `github.command.forbidden-gh-patterns` | `forbidden_commands.convention.yaml` (ATDD-FORBID-GH-*, ATDD-LOOP-GH-PR-POLL) |
| `pr_merge_gate` | validator (PR-merge gate) | `github.pr.merge-blocks-on-pre-smoke-close`, `github.pr.closes-keyword-discipline`, `github.pr.green-ships-without-smoke`, `github.pr.runtime-artifacts-blocked` | `pr.convention.yaml` rules |
| `pr_base_branch_validator` | validator | `github.pr.base-must-be-default-branch` | `rule-id.convention.yaml::coach.pr.base-must-be-default-branch` |
| `pr_mass_delete_guard` | validator | `github.pr.mass-delete-guard` | `rule-id.convention.yaml::coach.pr.mass-delete-guard` |

## Not yet built (deferred to a follow-up build slice)

- Issue/PR templates and the `atdd-auto-phase.yml` workflow asset
  (`github.issue.auto-phase-on-merge`, `github.issue.projects-access-fallback`).
- The `github_issue` / `github_pr` selector implementations.
- Commit-trailer `Issue:` enforcement wiring (`github.issue.trailer-required`).
