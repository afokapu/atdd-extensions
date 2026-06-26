# CODER + TESTER Extension Migration — SCAFFOLDING-pass review

**Status:** SCAFFOLDING ONLY. Structural skeletons of the new extension + workspace
packages, mirroring the existing precedents. **No convention node bodies, no
implementations, no relationship edges authored** (those need deduped core ids — a
later slice). **No commit.**

**Confirmed decisions honored:** (D1) conventions live in `atdd.extension.*`;
`atdd.workspace.*` host ONLY runtime/implementations. (D2) ONE `atdd.extension.coder`
+ ONE `atdd.extension.tester`.

**Precedents mirrored:** extensions → `official/atdd.extension.github/`; workspaces →
`official/atdd.workspace.python-pytest/`. Target map: `DESIGN.md` §2.

---

## Pass 1 — COMPLETENESS

Every package this scaffolding task covers (DESIGN §2.1–§2.3 + STEP 1/2 instructions)
exists with its full file set.

### Extensions (mirror `atdd.extension.github/`)

| Package | atdd.extension.yaml | README.md | conventions/.gitkeep | implementations/.gitkeep | relationships.yaml |
|---|---|---|---|---|---|
| `official/atdd.extension.coder`  | ✔ | ✔ | ✔ | ✔ | ✔ |
| `official/atdd.extension.tester` | ✔ | ✔ | ✔ | ✔ | ✔ |

### Workspace runtimes (mirror `atdd.workspace.python-pytest/`, ZERO conventions)

| Package | atdd.workspace.yaml | adapter/discover.py | adapter/run.py | conformance/ | runtime/ | README.md |
|---|---|---|---|---|---|---|
| `official/atdd.workspace.typescript`    | ✔ | ✔ | ✔ | ✔ (test + README) | ✔ (.gitkeep) | ✔ |
| `official/atdd.workspace.dart-flutter`  | ✔ | ✔ | ✔ | ✔ (test + README) | ✔ (.gitkeep) | ✔ |
| `official/atdd.workspace.supabase`      | ✔ | ✔ | ✔ | ✔ (test + README) | ✔ (.gitkeep) | ✔ |
| `official/atdd.workspace.fastapi`       | ✔ | ✔ | ✔ | ✔ (test + README) | ✔ (.gitkeep) | ✔ |

Each workspace additionally carries `e2e/.gitkeep` and `conformance/README.md` for full
fidelity to the python-pytest precedent (which ships `e2e/.gitkeep` + `conformance/README.md`).

### Registry

| Entry | exists | listed in registry.yaml |
|---|---|---|
| `entries/atdd.extension.coder.yaml`     | ✔ | ✔ |
| `entries/atdd.extension.tester.yaml`    | ✔ | ✔ |
| `entries/atdd.workspace.typescript.yaml`   | ✔ | ✔ |
| `entries/atdd.workspace.dart-flutter.yaml` | ✔ | ✔ |
| `entries/atdd.workspace.supabase.yaml`     | ✔ | ✔ |
| `entries/atdd.workspace.fastapi.yaml`      | ✔ | ✔ |

**6 new packages = 2 extensions + 4 workspaces, complete.**

### Deliberately OUT of this scaffolding pass (not in STEP 1–3)

- **Convention node bodies, implementations, relationship edges** — deferred; need
  the deduped core `coder.*` / `tester.*` ids (DESIGN §3, §5 Open Decision 6).
  `conventions/` + `implementations/` ship as empty `.gitkeep` dirs; `owns.conventions`
  / `owns.implementations` are `[]`; `relationships.yaml` has empty `nodes`/`edges`.
- **`atdd.extension.consumer-stack`** (DESIGN §2.4) — flagged lowest-priority /
  possibly product-coupled in DESIGN §5 Open Decision 4, and NOT in this task's STEP 1–3.
- **The +1 `smoke.ci_integration` convention on the existing `atdd.extension.github`**
  (DESIGN §2.4) — a convention-authoring task, not scaffolding.
- **Workspace `runtime/` and `shared_runtime.files`** — language-specific manifests
  (package.json/pubspec/deno.json/pyproject) authored in the build slice; `runtime/`
  exists (`.gitkeep`), `shared_runtime.files: []` for now.

---

## Pass 2 — PRECEDENT-FIDELITY

Each manifest's field set / shape matches its precedent. No invented or missing
required fields.

### Extension manifest — matched against `atdd.extension.github/atdd.extension.yaml`

Precedent top-level field set (the shape I matched):
`schema_version, extension_id, version, kind, role, flow_wagon, feature,
owns{conventions, relationships, implementations, schemas, gates, scopes},
depends_on{core, workspaces}, removal_policy`.

- All present in both new manifests, identical keys/nesting.
- `owns` carries all **six** github keys (`conventions, relationships, implementations,
  schemas, gates, scopes`) — `conventions`/`implementations` are `[]` (authored later),
  `relationships: [relationships.yaml]`, the rest `[]` — same as the empty github subsets.
- `depends_on` uses the `{core, workspaces}` shape. **Deliberately omitted** github's
  `targets`/`design_candidates` blocks: those enumerate concrete core *coach* node ids
  that a github behavior realizes; coder/tester have no resolvable core node ids yet
  (the whole point of the deferral), and the generic extension template
  (`templates/extension/atdd.extension.yaml`) likewise omits them. Omitting an OPTIONAL
  block is not a missing *required* field — `atdd validate package` confirms (below).
- `depends_on.core` uses the canonical new-extension list from
  `templates/extension/atdd.extension.yaml` (`convention-node-schema, relationship-schema,
  workspace-schema, implementation-schema, violation-output-schema`) — `workspace-schema`
  is included because these extensions declare `depends_on.workspaces`.
- `role` / `flow_wagon` / `feature`: `coder` → `validate-source-surface` (the established
  pairing in `templates/extension/`, `examples/minimal-extension`, `examples/component-header-validator`);
  `tester` → `validate-test-surface` (**skeleton value**: no tester-role precedent exists
  in-repo; role-consistent and confirmed valid by the composition gate — revisit when the
  canonical tester wagon name is fixed). `feature: coder-extension-conventions` /
  `tester-extension-conventions` mirror github's descriptive `<x>-binding` slug style.

### Workspace manifest — matched against `atdd.workspace.python-pytest/atdd.workspace.yaml`

Precedent field set (the shape I matched):
`schema_version, workspace_id, kind, version, contract_version,
capabilities[{capability_id, domain, type, contract, runtime{language, runner,
package_manager, command}}], shared_runtime{files}, discovers{implementations,
requires_contract}, conformance{suite}, governed_by_conventions`.

- All four new manifests carry this exact field set / nesting.
- Used python-pytest's **newer `capabilities` shape** (typed `domain: execution`,
  `type: test-runner`, `contract: atdd.workspace.capability.execution.command-runner.v1`,
  nested `runtime{}`) — **not** the older flat `runtime:` block in
  `templates/workspace/atdd.workspace.yaml` — because the task said mirror python-pytest
  EXACTLY and python-pytest is the live precedent.
- `shared_runtime.files: []` (template default; runtime manifests are build-slice work).
- `governed_by_conventions: []` — workspaces own zero conventions by D1; python-pytest
  lists three only because those core nodes already exist, which is not yet true here.
- Per-runtime `runtime{}` values (**skeleton, build-slice-confirmable**): typescript
  `vitest/pnpm`, dart-flutter `flutter-test/pub`, supabase `deno-test/deno`, fastapi
  `pytest/pip` (kept distinct from python-pytest per DESIGN §5 Open Decision 3).

### Adapter signatures — matched against `python-pytest/adapter/{discover,run}.py`

- `discover.py`: same public surface — `Implementation` frozen dataclass
  (`implementation_id, contract_version, manifest_path, targets_workspace`),
  `contract_compatible(impl_version, provider_version=CONTRACT_VERSION) -> bool`,
  `discover_implementations(instance_root, *, provider_version=CONTRACT_VERSION) -> list[Implementation]`.
- `run.py`: same public surface — `RunResult` frozen dataclass
  (`implementation_id, passed, exit_code, violations, stdout`) + `ran` property,
  `run_implementation(implementation_id, test_path, *, env=None) -> RunResult`.
- Bodies are documented `NotImplementedError` stubs (no logic authored); all eight
  modules `py_compile` clean.

### Conformance / relationships / registry shapes

- `conformance/test_provider_contract.py` mirrors python-pytest's import-the-sibling-adapter
  pattern; tests `pytest.mark.skip` until the adapter is built. `conformance/README.md`
  mirrors the precedent README.
- `relationships.yaml` matches github's shape: `schema_version, <comment>, graph_id,
  nodes, edges` — `nodes`/`edges` empty.
- Registry entries: extension entries mirror `entries/atdd.extension.github.yaml`
  (`...source{repository,type}, version, compatible_atdd_core{minimum}, requires_workspaces[],
  categories[], description`); workspace entries mirror
  `entries/atdd.workspace.python-pytest.yaml` (`...version, contract_version,
  compatible_atdd_core{minimum}, categories[], description` — `contract_version` present,
  `requires_workspaces` absent, exactly as the precedent distinguishes the two kinds).

---

## Pass 3 — REGISTRY + YAML

- **Every new YAML parses.** `yaml.safe_load` over all 15 new/modified YAML files
  (2 extension manifests + 2 extension relationships + 4 workspace manifests +
  6 registry entries + `registry/registry.yaml`) → **0 failures**.
- **registry.yaml lists all 6 new packages.** Verified present:
  `atdd.workspace.{typescript,dart-flutter,supabase,fastapi}`,
  `atdd.extension.{coder,tester}` — added alongside the existing 3 entries (9 total).
- **Entries well-formed.** Each mirrors the correct precedent's field set for its `kind`
  (extension vs workspace), confirmed in Pass 2.
- **Composition gate (the repo's real validator, `atdd validate package` v3.134.0 — the
  same CLI the `validate-packages` CI workflow runs):** all 6 new packages
  `✓ valid against core`; the full `official/*` loop (10 packages incl. precedents)
  passes. Extensions report `realizes 0 core node(s) [targets-only]` — correct for an
  unauthored skeleton.
- **Conformance stubs:** run per-directory (as CI invokes them — one `pytest` call per
  conformance dir, matching python-pytest), each collects and reports `2 skipped`, no
  errors. (Aggregating all four in one `pytest` call collides on the shared
  `test_provider_contract.py` basename — same as python-pytest's own per-dir run model;
  not a defect.)
- Core `atdd` test suite **not** run (per instructions). Transient
  `__pycache__`/`.pytest_cache` from the collection check were removed; `git status`
  shows only the intended new packages + the `registry.yaml` edit.

SCAFFOLD REVIEW COMPLETE
