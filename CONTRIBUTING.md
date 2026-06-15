# Contributing ATDD Extensions

Anyone may create an ATDD extension.

However:

- creating an extension is open
- installing an extension by direct source is open
- listing an extension in this registry is reviewed
- official `atdd.extension.*` status is governed by ATDD maintainers

## Extension Submission Types

### Official Extension

Official extensions live under:

```text
official/
```

They use the reserved namespace:

```text
atdd.extension.*
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

Every extension must include:

```text
atdd.extension.yaml
```

Every validator workspace must include:

```text
atdd.workspace.yaml
```

Every validator implementation must include:

```text
atdd.implementation.yaml
```

## Required Extension-Owned Artifact Folders

An extension may include:

```text
conventions/
relationships/
validators/
schemas/
gates/
scopes/
e2e/
```

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
