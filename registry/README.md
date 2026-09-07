# ATDD Artifact Registry

This directory lists official and known ATDD artifacts — both **extensions**
(use-case packages) and **workspace providers** (reusable runtimes).

The registry is not required to create or install an artifact.

It is used for discovery, review, and ecosystem indexing.

## Rules

- Official artifacts use the reserved `atdd` publisher (`atdd.extension.*`,
  `atdd.workspace.*`).
- External artifacts use their own publisher namespace.
- An extension entry may declare the workspace providers it requires
  (`requires_workspaces`), so consumers can resolve runtimes ahead of install.
- Registry listing does not imply official ATDD ownership unless the artifact
  uses the `atdd` namespace.

## What is listed, and what is not

`registry.yaml` is a **curated catalog**, not a mirror of `official/`. Listing is
deliberate: an entry is a claim that an artifact is ready for a consumer to resolve
and install by reference.

Today 16 of the 25 packages in `official/` are listed. The unlisted ones are the
`convex.*` and `frontend.*` families, `atdd.extension.planner.controlled-language`,
`atdd.workspace.cmux-claude` and `atdd.workspace.git-worktree`. If you add a package
and do not list it, that is a decision — record it, because the difference between
"deliberately unlisted" and "someone forgot" is invisible from the file alone.

**An entry's `source` must exist.** `tools/build_registry_index.py --check` fails on a
dangling one, and CI runs it. This is enforced because it broke once: a persona split
removed `atdd.extension.train-interlocking-enforcement` and deferred the registry
update, so `index.yaml` — the file core reads to resolve `atdd substrate add <ref>` —
went on advertising a directory that no longer existed. Only index-vs-entries drift
was checked, never entry-vs-disk.
