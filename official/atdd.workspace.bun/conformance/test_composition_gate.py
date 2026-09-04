"""The repo's CI gate, runnable locally: `atdd validate package` on every package
this provider serves.

`.github/workflows/validate-packages.yml` runs exactly this against `official/*/`
on every push and PR — "continuously prove every package in this repo still COMPOSES
against installed ATDD core". It is the authority, and it catches things neither
`substrate add --dry-run` nor the JSON schemas do.

It caught one here that no other check did. A single-rule extension was shipped
(`atdd.extension.tester.htmx`, one node) and the gate refused it:

    package validation failed: orphan convention node(s) referenced by no
    relationship edge: tester.htmx.fragment-asserts-markup

`compose.extension_orphan_nodes` extends core's `planner.relationship.no-orphan-nodes`
to extensions with NO exemption for package size, and admission separately refuses an
authored cross-package edge. Together those make a one-rule stack extension
structurally impossible: its only node can never be an endpoint. That is why the one
htmx tester rule lives in `atdd.extension.tester.bun` rather than its own package.

Reproduced here so the gate runs in the same suite as everything else, instead of
first failing in CI after a merge.
"""
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

_WS = Path(__file__).resolve().parent.parent
_HUB = _WS.parent.parent

# The packages this provider serves. Other hub packages are CI's business, not this
# suite's — asserting on them would make this provider fail for a neighbour's bug.
OURS = ["atdd.workspace.bun", "atdd.extension.coder.bun",
        "atdd.extension.coder.htmx", "atdd.extension.tester.bun"]

_ATDD = shutil.which("atdd")
requires_atdd = pytest.mark.skipif(_ATDD is None, reason="atdd CLI not on PATH")


@requires_atdd
@pytest.mark.parametrize("pkg", OURS)
def test_package_composes_against_installed_core(pkg: str) -> None:
    path = _HUB / "official" / pkg
    if not path.is_dir():
        pytest.skip(f"{pkg} not present beside this workspace")
    proc = subprocess.run([_ATDD, "validate", "package", str(path)],
                          capture_output=True, text=True)
    assert proc.returncode == 0, (
        f"{pkg} does not compose:\n{proc.stdout[-1500:]}\n{proc.stderr[-500:]}")


@requires_atdd
def test_the_gate_still_has_teeth(tmp_path: Path) -> None:
    """A negative canary, mirroring the workflow's own.

    A gate that passes everything proves nothing, so break a copy the way core is
    documented to refuse — a `realizes` entry naming a core node that does not
    exist — and require a non-zero exit.
    """
    import yaml
    broken = tmp_path / "broken"
    shutil.copytree(_HUB / "official" / "atdd.extension.coder.htmx", broken)
    mf = broken / "atdd.extension.yaml"
    d = yaml.safe_load(mf.read_text())
    d.setdefault("realizes", []).append({
        "extension_node": "coder.htmx.oob-swap-carries-id",
        "core_node": "coach.bogus.does-not-exist",
    })
    mf.write_text(yaml.safe_dump(d, sort_keys=False))
    proc = subprocess.run([_ATDD, "validate", "package", str(broken)],
                          capture_output=True, text=True)
    assert proc.returncode != 0, "the composition gate accepted an unresolved core node"
