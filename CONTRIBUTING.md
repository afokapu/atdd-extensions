# Contributing ATDD Extensions

Anyone may create an ATDD extension or a workspace provider.

However:

- creating an extension or provider is open
- installing by direct source is open
- listing in this registry is reviewed
- official `atdd.extension.*` / `atdd.workspace.*` status is governed by ATDD maintainers

## Artifact kinds

This hub holds two authored artifact kinds (see the README's "The Four Layers"):

- **Extension** — a use-case package (`atdd.extension.yaml`), id scope `extension`.
- **Workspace provider** — a reusable runtime (`atdd.workspace.yaml`), id scope
  `workspace`. Providers are shared and targeted by extensions; they own runtime
  machinery only — no conventions, scopes, gates, or domain semantics.

## Submission Types

### Official artifact

Official extensions and providers live under:

```text
official/
```

They use the reserved `atdd` publisher:

```text
atdd.extension.*
atdd.workspace.*
```

### External Extension Registry Entry

External extensions usually live in their own repositories. They are listed under:

```text
registry/entries/
```

External extensions must use their own publisher namespace:

```text
publisher-name.extension.extension-name
```

## Required Files

Every extension must include its manifest:

```text
atdd.extension.yaml
```

Each validator the extension ships is an implementation with its own manifest:

```text
validators/<name>/atdd.implementation.yaml
```

An implementation declares `targets_workspace` + `contract_version`; the
extension declares the provider it targets under `depends_on.workspaces`. The
runtime itself is **not** bundled — it is a separate workspace provider:

```text
atdd.workspace.yaml      # lives in the provider package, not the extension
```

## Extension-Owned Artifact Folders

An extension may include:

```text
conventions/
relationships/
validators/      # implementations: validators/<name>/atdd.implementation.yaml
schemas/
gates/
scopes/
e2e/
```

(A private/experimental runtime may be embedded under
`validators/workspaces/<name>/` as an escape hatch — but a shared runtime should
be a first-class provider in `official/` instead.)

## Registry Submission

To list an external extension:

1. Add a file under `registry/entries/`.
2. Use the extension ID as the filename.
3. Open a pull request.
4. Include repository URL, version, publisher, compatibility, and verification status.

Example:

```text
registry/entries/publisher-name.extension.opentofu-backend-policy.yaml
```
