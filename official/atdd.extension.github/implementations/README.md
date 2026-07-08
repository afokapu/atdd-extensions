# `atdd.extension.github` — implementations

> **Built.** These implementations are real, discoverable, runnable units —
> each a directory with an `atdd.implementation.yaml` (declaring
> `targets_workspace: atdd.workspace.python-pytest` + `contract_version`) plus a
> uniquely-named pure decision module (e.g. `base_branch.py`) and its real pytest
> suite (`test_<module>.py`). Unique basenames let the suites run both
> per-directory (how the provider runs them) and in aggregate
> (`pytest implementations/`) without collision. The python-pytest provider
> **discovers** each manifest and **runs** its suite; CI exercises the full
> discover→run chain (see the `github-implementations` job in
> `.github/workflows/validate-packages.yml`).

Each `check.py` is a **pure decision function** — no GitHub API, no host coupling.
The caller supplies the facts (a PR base ref, deletion counts, a command string,
an argv, an issue phase) and the function returns violations in the ATDD
violation-output contract (`rule_id` + `location` + `evidence`). The platform
plumbing that gathers those facts (gh, the PATH shim, pre-commit) is the runtime
wagon's job; the decision logic and its tests live here.

| Implementation | Type | Realizes convention node | Decision core |
|----------------|------|--------------------------|---------------|
| `gh_path_shim` | shim decision core | `github.shim.gh-issue-create-blocked` | `shim_decision(argv)` — blocks `gh issue create` by contiguous-argv match (flag-grammar-agnostic) |
| `forbidden_command_policy` | command-policy patterns | `github.command.forbidden-gh-patterns` | `classify_command(cmd)` — blocks `gh issue/pr create` + `gh pr` poll loops |
| `pr_merge_gate` | PR-merge gate | `github.pr.merge-blocks-on-pre-smoke-close` | `check_merge_gate(auto_closes, phase)` — blocks auto-close while issue is pre-SMOKE; fails closed on unknown phase |
| `pr_base_branch_validator` | validator | `github.pr.base-must-be-default-branch` | `check_base_branch(base, default)` |
| `pr_mass_delete_guard` | validator | `github.pr.mass-delete-guard` | `check_mass_delete(files, lines, …)` — >100 files / >10,000 lines, with title-prefix / `[mass-delete-approved]` escape hatches |
| `issue_advancement_gate` | post-merge gate | `github.issue.auto-phase-on-merge` | `check_issue_advancement(pr_merged, is_own_pr, auto_closes_issue, issue_phase, issue_state)` — own PR auto-closing an open issue still at INIT/PLANNED/RED/GREEN skips the lifecycle; SMOKE+ allowed, cross-PR advisory, unknown phase fails closed (migrates core COACH-PRGATE-0003) |

## Not yet built (deferred to a follow-up build slice)

- The remaining `pr_merge_gate` sibling rules (`github.pr.closes-keyword-discipline`,
  `github.pr.green-ships-without-smoke`, `github.pr.runtime-artifacts-blocked`) as
  their own decision cores.
- Issue/PR templates and the `atdd-auto-phase.yml` workflow asset
  (`github.issue.auto-phase-on-merge`, `github.issue.projects-access-fallback`).
- The `github_issue` / `github_pr` selector implementations.
- Commit-trailer `Issue:` enforcement wiring (`github.issue.trailer-required`),
  which would target `atdd.workspace.git-worktree`'s commit-trailers capability.
