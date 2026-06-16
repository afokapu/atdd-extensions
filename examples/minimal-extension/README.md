# Minimal ATDD Extension Example

This is the smallest valid extension shape.

It exists to show the required extension boundary:

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

It owns no implementations yet, so it targets no runtime
(`depends_on.workspaces: []`). As soon as it ships a validator under
`validators/<name>/atdd.implementation.yaml`, it declares the workspace provider
that validator runs inside. For a complete, runnable shape see
[`../component-header-validator/`](../component-header-validator/).
