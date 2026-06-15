# Provider conformance suite — `atdd.workspace.python-pytest`

These tests assert that this provider satisfies the **workspace-provider contract**
(`contract_version: 1.0.0`): it discovers `atdd.implementation.yaml` units, runs
them with the declared command, and emits results in the ATDD violation-output
contract (`rule_id` + location).

A new runtime that wants to offer the same contract (e.g.
`atdd.workspace.node-vitest`, `atdd.workspace.go-test`) proves equivalence by
passing an equivalent conformance suite. Conformance tests stay **with the
provider**, never inside the extensions that consume it.
