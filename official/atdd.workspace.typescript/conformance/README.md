# Provider conformance suite — `atdd.workspace.typescript`

**SKELETON.** Mirrors the `atdd.workspace.python-pytest` conformance shape. These
tests assert that this provider satisfies the **workspace-provider contract**
(`contract_version: 1.0.0`): it discovers `atdd.implementation.yaml` units, runs
them with the declared command, and emits results in the ATDD violation-output
contract (`rule_id` + location).

The suite is currently **skipped** — the adapter halves (`../adapter/discover.py`,
`../adapter/run.py`) are documented `NotImplementedError` stubs. The real tests
(discover + run, mirroring python-pytest's suite) are authored in the build slice
alongside the adapter bodies.

A new runtime that wants to offer the same contract proves equivalence by passing
an equivalent conformance suite. Conformance tests stay **with the provider**,
never inside the extensions that consume it.
