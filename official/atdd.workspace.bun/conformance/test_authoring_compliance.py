"""Every artifact this provider serves is valid by CORE's OWN authoring rules.

Written after the fact, and it should not have been. `atdd author` already
scaffolds and validates every artifact kind used here —

    atdd author extension init --extension <id> --role <persona>
    atdd author workspace init --workspace <id> --language --runner --command
    atdd author implementation init --id --targets-workspace --emits
    atdd author convention-node --extension <id> --rule-id ... --term ...
    atdd author relationship --source --type --target --foundation ...

— so hand-writing these files meant re-deriving a contract that already exists,
and getting it wrong: 51 of 60 convention nodes shipped without the REQUIRED
`terms` field (spec 5.2), which `atdd author convention-node` refuses outright.
Every other extension in the hub carries terms on 100% of its nodes.

This suite closes that by binding the packages to core's real validators rather
than to a local restatement of them:

  * `validate_convention_node`  — the same function `atdd author` calls
  * `convention-node.schema.json` and `relationship.schema.json` — the shipped
    JSON schemas, read from the installed core

Core is NOT a dependency of this provider (the adapter and CLI import nothing from
it, deliberately), so every test here skips when core is absent rather than
inventing a local copy of the rule. Run it wherever `atdd` is importable — that is
where the authority lives.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest
import yaml

_WS = Path(__file__).resolve().parent.parent
_HUB = _WS.parent.parent
EXTENSIONS = ["atdd.extension.coder.bun", "atdd.extension.coder.htmx",
              "atdd.extension.tester.bun"]


def _core():
    try:
        import atdd
    except Exception:  # noqa: BLE001
        pytest.skip("core not importable here; run where `atdd` is installed")
    return Path(atdd.__file__).resolve().parent


def _schema(name: str) -> dict:
    p = _core() / "planner" / "schemas" / "author" / name
    if not p.is_file():
        pytest.skip(f"installed core ships no {name}")
    return json.loads(p.read_text())


def _nodes(ext: str) -> list[Path]:
    d = _HUB / "official" / ext / "conventions"
    if not d.is_dir():
        pytest.skip(f"{ext} not present beside this workspace")
    return sorted(d.glob("*.convention.yaml"))


@pytest.mark.parametrize("ext", EXTENSIONS)
def test_nodes_pass_the_same_validator_atdd_author_uses(ext: str) -> None:
    """Not a restatement of the rules — literally the function the CLI calls."""
    _core()
    from atdd.planner.commands.author import validate_convention_node, AuthorInputError
    failures = []
    for f in _nodes(ext):
        try:
            validate_convention_node(yaml.safe_load(f.read_text()), f)
        except AuthorInputError as e:
            failures.append(f"{f.name}: [{e.field}] {e}")
    assert not failures, f"{ext} — {len(failures)} node(s) core would refuse:\n  " + "\n  ".join(failures)


@pytest.mark.parametrize("ext", EXTENSIONS)
def test_nodes_validate_against_the_shipped_json_schema(ext: str) -> None:
    jsonschema = pytest.importorskip("jsonschema")
    schema = _schema("convention-node.schema.json")
    failures = []
    for f in _nodes(ext):
        try:
            jsonschema.validate(yaml.safe_load(f.read_text()), schema)
        except jsonschema.ValidationError as e:
            loc = ".".join(map(str, e.absolute_path)) or "<root>"
            failures.append(f"{f.name} at {loc}: {e.message}")
    assert not failures, f"{ext} — schema violations:\n  " + "\n  ".join(failures)


@pytest.mark.parametrize("ext", EXTENSIONS)
def test_edges_validate_against_the_shipped_json_schema(ext: str) -> None:
    jsonschema = pytest.importorskip("jsonschema")
    schema = _schema("relationship.schema.json")
    g = yaml.safe_load((_HUB / "official" / ext / "relationships.yaml").read_text())
    failures = []
    for e in g.get("edges") or []:
        try:
            jsonschema.validate(e, schema)
        except jsonschema.ValidationError as ex:
            failures.append(f"{e.get('source_ref')} -> {e.get('target_ref')}: {ex.message}")
    assert not failures, f"{ext} — edge violations:\n  " + "\n  ".join(failures)


@pytest.mark.parametrize("ext", EXTENSIONS)
def test_every_term_id_is_semantic_not_numbered(ext: str) -> None:
    """Spec D005: `T1`/`T2` are refused. A numbered term names nothing."""
    import re
    NUMBERED = re.compile(r"^[Tt]\d+$")
    SEMANTIC = re.compile(r"^[a-z][a-z0-9_]*$")
    bad = []
    for f in _nodes(ext):
        for t in yaml.safe_load(f.read_text()).get("terms") or []:
            tid = t.get("term_id", "")
            if NUMBERED.match(tid) or not SEMANTIC.match(tid):
                bad.append(f"{f.name}: {tid!r}")
    assert not bad, f"{ext} — non-semantic term_ids:\n  " + "\n  ".join(bad)


@pytest.mark.parametrize("ext", EXTENSIONS)
def test_term_count_stays_inside_the_D006_band(ext: str) -> None:
    """Spec D006 warns at 8-10 terms and calls >10 likely too large. Core only
    warns; a package authored today has no reason to be in the band at all."""
    over = []
    for f in _nodes(ext):
        n = len(yaml.safe_load(f.read_text()).get("terms") or [])
        if n >= 8:
            over.append(f"{f.name}: {n} terms")
    assert not over, f"{ext} — nodes in the D006 warning band:\n  " + "\n  ".join(over)


@pytest.mark.parametrize("ext", EXTENSIONS)
def test_manifest_matches_the_scaffolded_shape(ext: str) -> None:
    """`atdd author extension init` fixes the manifest's shape; match it."""
    m = yaml.safe_load((_HUB / "official" / ext / "atdd.extension.yaml").read_text())
    assert set(m) >= {"schema_version", "extension_id", "version", "kind", "role",
                      "flow_wagon", "feature", "owns", "depends_on", "removal_policy"}
    assert m["kind"] == "extension"
    assert m["role"] in {"planner", "tester", "coder", "coach"}
    assert m["extension_id"].split(".")[2] == m["role"], "persona segment must match role"
    assert set(m["owns"]) == {"conventions", "relationships", "implementations",
                              "schemas", "gates", "scopes"}
    assert set(m["depends_on"]) == {"core", "workspaces"}, "scaffold declares both keys"
