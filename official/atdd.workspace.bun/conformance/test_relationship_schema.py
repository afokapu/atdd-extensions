"""Every extension graph this provider serves validates against CORE's edge schema.

Nothing else in the hub does this check, and the gap shows: at the time of writing
EVERY extension relationship graph uses `type` values outside core's enum — and so
does core's own `coach/graph/relationships.yaml`, which uses `refines`. The schema
is real (`src/atdd/planner/schemas/author/relationship.schema.json`, "ATDD
relationship edge (spec 6)") but admission never applies it to an extension, so an
invented vocabulary passes silently and the graph stops being machine-readable.

The enum is transcribed here rather than imported, because a workspace provider must
not depend on core internals — the same boundary discipline `cli/scan.py` keeps. The
docstring names the authoritative file so drift is traceable; `test_enum_matches_core`
below re-reads it whenever core happens to be importable, so the transcription cannot
rot unnoticed.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest
import yaml

_WS = Path(__file__).resolve().parent.parent
_HUB = _WS.parent.parent

# Transcribed from relationship.schema.json (spec 6).
EDGE_TYPES = {"requires", "blocks", "enables", "follows", "awaits",
              "triggered_by", "starts_with", "runs_alongside", "finishes_with", "relieves"}
FOUNDATIONS = {"finish_to_start", "start_to_start", "finish_to_finish", "start_to_finish"}
CONSTRAINTS = {"mandatory", "discretionary", "conditional"}
CONTROLS = {"internal", "external", "autonomous"}
STRENGTHS = {"critical", "important", "minor"}
REQUIRED = {"source_ref", "target_ref", "type"}

# The four extensions this provider realizes. Other hub packages are out of scope:
# this suite asserts what THIS provider serves, not what the hub happens to contain.
OURS = ["atdd.extension.coder.bun", "atdd.extension.coder.htmx",
        "atdd.extension.tester.bun", "atdd.extension.tester.htmx"]


def _graph(ext: str) -> dict:
    p = _HUB / "official" / ext / "relationships.yaml"
    if not p.is_file():
        pytest.skip(f"{ext} not present beside this workspace")
    return yaml.safe_load(p.read_text())


@pytest.mark.parametrize("ext", OURS)
def test_edges_use_only_the_core_vocabulary(ext: str) -> None:
    for e in _graph(ext).get("edges") or []:
        assert REQUIRED <= set(e), f"{ext}: edge missing required keys: {e}"
        assert e["type"] in EDGE_TYPES, f"{ext}: type {e['type']!r} is outside core's enum"
        for key, allowed in (("foundation", FOUNDATIONS), ("constraint", CONSTRAINTS),
                             ("control", CONTROLS), ("strength", STRENGTHS)):
            if key in e:
                assert e[key] in allowed, f"{ext}: {key}={e[key]!r} is outside core's enum"
        if "confidence" in e:
            assert isinstance(e["confidence"], (int, float)) and 0 <= e["confidence"] <= 1


@pytest.mark.parametrize("ext", OURS)
def test_every_node_is_covered_by_an_edge(ext: str) -> None:
    """Core's `planner.relationship.no-orphan-nodes`: a node referenced by no edge is
    refused. A single-node package is the one honest exception — there is no pair."""
    g = _graph(ext)
    nodes = set(g.get("nodes") or [])
    if len(nodes) <= 1:
        pytest.skip(f"{ext} is a single-node package; no intra-package pair exists")
    linked = {r for e in (g.get("edges") or []) for r in (e["source_ref"], e["target_ref"])}
    assert nodes - linked == set(), f"{ext}: orphan nodes {sorted(nodes - linked)}"
    assert linked - nodes == set(), f"{ext}: edges reference unknown nodes {sorted(linked - nodes)}"


@pytest.mark.parametrize("ext", OURS)
def test_every_edge_states_a_reason(ext: str) -> None:
    """An edge with no reason is decoration. Core's own graph carries one on each."""
    for e in _graph(ext).get("edges") or []:
        assert e.get("reason", "").strip(), f"{ext}: {e['source_ref']} -> {e['target_ref']} has no reason"


def test_enum_matches_core_when_core_is_importable() -> None:
    """Guard against the transcription above drifting from the authority."""
    try:
        import atdd  # noqa: F401
        schema_path = Path(atdd.__file__).resolve().parent / "planner" / "schemas" / "author" / "relationship.schema.json"
    except Exception:  # noqa: BLE001 - core is not a dependency of this provider
        pytest.skip("core not importable here; the transcription is the local authority")
    if not schema_path.is_file():
        pytest.skip("installed core ships no relationship schema at the expected path")
    props = json.loads(schema_path.read_text())["properties"]
    assert set(props["type"]["enum"]) == EDGE_TYPES
    assert set(props["foundation"]["enum"]) == FOUNDATIONS
    assert set(props["constraint"]["enum"]) == CONSTRAINTS
