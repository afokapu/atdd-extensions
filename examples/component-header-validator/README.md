# Example: `acme.extension.component-header-validator`

A complete, minimal example of the **four-layer** model.

- **Extension** (`atdd.extension.yaml`) — the use case *"source files must declare
  a component header"*. Owns the rule and the validator implementation; declares
  it targets the shared `atdd.workspace.python-pytest` provider.
- **Workspace provider** — `atdd.workspace.python-pytest` (in `../../official/`).
  Not copied here; referenced by id + contract range.
- **Workspace instance** — materialized at resolve time under
  `.atdd/resolved-workspaces/…` in the consumer repo. Not committed.
- **Implementation** (`validators/component-header/atdd.implementation.yaml`) —
  the validator code that emits `coder.source.component-header-required`.

```text
acme.extension.component-header-validator/
  atdd.extension.yaml                          # EXTENSION — owns the use case
  conventions/
    coder.source.component-header-required.convention.yaml   # the RULE
  scopes/                                       # which files it applies to
  gates/                                        # when it runs
  validators/
    component-header/
      atdd.implementation.yaml                  # IMPLEMENTATION — targets the provider
      src/        # the checker code
      tests/
      fixtures/
```

The runtime (`python-pytest`) lives **outside** this extension as a shared
provider — that is the whole point of first-classing it.
