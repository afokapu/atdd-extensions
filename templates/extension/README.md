# ATDD Extension Template

Use this template to create a self-contained ATDD extension.

Replace:

```text
publisher-name.extension.example-extension
```

with your own extension ID.

## Required Structure

```text
atdd.extension.yaml
conventions/
relationships/
validators/          # implementations: validators/<name>/atdd.implementation.yaml
schemas/
gates/
scopes/
e2e/
```

## Targeting a runtime

This extension does not bundle a runtime. Declare the shared workspace provider
its implementations run inside, in `atdd.extension.yaml`:

```yaml
depends_on:
  workspaces:
    - id: atdd.workspace.python-pytest
      contract: "^1.0.0"
```

Each implementation echoes the target in `validators/<name>/atdd.implementation.yaml`
(`targets_workspace` + `contract_version`). To author a new runtime instead, use
`templates/workspace/`.

## Extension ID Format

```text
<publisher>.<scope>.<artifact-name>     # scope ∈ {core, extension, workspace}
```

Example:

```text
publisher-name.extension.component-header-validator
```
