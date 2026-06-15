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
validators/
schemas/
gates/
scopes/
e2e/
```

## Extension ID Format

```text
<publisher>.<scope>.<artifact-name>
```

Example:

```text
publisher-name.extension.component-header-validator
```
