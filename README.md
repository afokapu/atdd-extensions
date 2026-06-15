# ATDD Extensions

This repository hosts the official ATDD extension hub.

It contains:

- official ATDD extensions
- extension templates
- a curated registry of known ATDD extensions
- examples for extension authors

## Repository Roles

The core [`atdd`](https://github.com/afokapu/atdd) repository defines the ATDD protocol, schemas, lifecycle machinery, validator runner, graph composition, and `atdd author`.

This `atdd-extensions` repository contains extension packages and extension ecosystem metadata.

```text
atdd            = protocol core (the engine)
atdd-extensions = extension hub (this repo)
```

## Extension Model

An ATDD extension is a self-contained use-case package.

An extension may own:

- conventions
- relationships
- validators
- schemas
- gates
- scopes
- selectors
- tests
- fixtures
- runtime files
- e2e checks

The extension manifest is the ownership boundary:

```text
atdd.extension.yaml
```

## Namespace Convention

Extension IDs use:

```text
<publisher>.<scope>.<artifact-name>
```

where `scope` is `core | extension`. Examples:

```text
atdd.extension.python-pytest
atdd.extension.component-header-validator
publisher-name.extension.opentofu-backend-policy
publisher-name.extension.github-pr-lifecycle
```

The `atdd` namespace is reserved for official, ATDD-governed artifacts.

## Directory Layout

```text
templates/   Extension templates for authors.
official/    Official ATDD-governed extensions.
registry/    Curated list of official and known external extensions.
examples/    Example extensions for learning and testing.
```

## Creating an Extension

Use the template in `templates/extension/`, or scaffold one with the core CLI:

```bash
atdd author extension init \
  --extension publisher-name.extension.my-extension \
  --flow-wagon validate-source-surface \
  --feature my-feature \
  --role coder
```

## Installing Extensions

Consumer repos install extensions into:

```text
.atdd/extensions/<extension-id>/<version>/
```

Installed extensions remain self-contained. They must not scatter files into ATDD core folders.
