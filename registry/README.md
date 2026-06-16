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
