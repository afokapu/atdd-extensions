"""A staged rule is DECLARED and PROVABLY not gated — never merely undeclared.

`emits_rule_ids` is the contract for what the family runner surfaces, and the rest of
this suite holds it to that: every entry needs a precision expectation and must fire
on a dirty fixture through `detect.mjs`. A staged rule cannot meet those, because
`detect.mjs` never collects it.

The tempting shortcut is to leave such a rule out of the manifests entirely. That is
worse, and this hub has fixed it twice already: an emitted rule id that no manifest
admits is unresolvable by anything downstream. So staged rules are declared in
`staged_rule_ids`, and this file makes the word mean something — a rule listed there
must be absent from the gated output AND produced by the staged entry point on a tree
that violates it. Without the second half, "staged" would be indistinguishable from
"broken".
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import pytest
import yaml

_WS = Path(__file__).resolve().parent.parent
requires_bun = pytest.mark.skipif(shutil.which("bun") is None, reason="bun not on PATH")

_STAGED: list[tuple[Path, str]] = []
for _impl in sorted(p for p in (_WS / "implementations").iterdir() if (p / "atdd.implementation.yaml").is_file()):
    for _rid in yaml.safe_load((_impl / "atdd.implementation.yaml").read_text()).get("staged_rule_ids") or []:
        _STAGED.append((_impl, _rid))


def _run(script: Path, root: Path) -> list[dict]:
    with tempfile.TemporaryDirectory() as tmp:
        report = Path(tmp) / "r.json"
        subprocess.run(
            [shutil.which("bun"), str(script)],
            env={**os.environ, "ATDD_SCAN_ROOTS": json.dumps([str(root.resolve())]),
                 "ATDD_VIOLATIONS_REPORT": str(report)},
            capture_output=True, text=True,
        )
        return json.loads(report.read_text())["violations"] if report.is_file() else []


@pytest.mark.skipif(not _STAGED, reason="no staged rules declared")
@pytest.mark.parametrize("impl,rid", _STAGED, ids=[f"{i.name}::{r}" for i, r in _STAGED])
def test_a_staged_rule_has_a_convention_node(impl: Path, rid: str) -> None:
    """Declared in a manifest is not enough; the obligation must exist somewhere."""
    nodes = list((_WS.parent).glob(f"*/conventions/{rid}.convention.yaml"))
    assert nodes, f"{rid} is declared staged but no convention node states it"
    node = yaml.safe_load(nodes[0].read_text())
    assert node["rule_id"] == rid
    # A staged rule claims no live enforcement, so it must not be marked active.
    assert node["status"] == "draft", (
        f"{rid} is staged but its node says status={node['status']!r}; a node claiming "
        f"live enforcement must be emitted by the gated runner"
    )


@requires_bun
@pytest.mark.skipif(not _STAGED, reason="no staged rules declared")
@pytest.mark.parametrize("impl,rid", _STAGED, ids=[f"{i.name}::{r}" for i, r in _STAGED])
def test_a_staged_rule_is_absent_from_the_gated_family(impl: Path, rid: str) -> None:
    """The half that makes `staged` a promise rather than a label."""
    for tree in sorted((impl / "fixtures").rglob("*")):
        if not tree.is_dir() or not any((tree / d).is_dir() for d in ("convex", "src", "plan", "e2e")):
            continue
        gated = {v["rule_id"] for v in _run(impl / "detect.mjs", tree)}
        assert rid not in gated, f"{rid} is declared staged but the gated family emits it on {tree.name}"


@requires_bun
@pytest.mark.skipif(not _STAGED, reason="no staged rules declared")
@pytest.mark.parametrize("impl,rid", _STAGED, ids=[f"{i.name}::{r}" for i, r in _STAGED])
def test_a_staged_rule_is_actually_produced_by_its_staged_entry(impl: Path, rid: str) -> None:
    """Without this, `staged` and `broken` are indistinguishable."""
    entry = impl / "scan_execution.mjs"
    assert entry.is_file(), f"{rid} is staged but {entry.name} does not exist"
    produced = set()
    for tree in sorted((impl / "fixtures").rglob("*")):
        if not tree.is_dir() or not any((tree / d).is_dir() for d in ("convex", "src", "plan", "e2e")):
            continue
        produced |= {v["rule_id"] for v in _run(entry, tree)}
    assert rid in produced, (
        f"{rid} is declared staged but its entry point produces it on no fixture — "
        f"a staged rule with no proof is indistinguishable from a broken one"
    )
