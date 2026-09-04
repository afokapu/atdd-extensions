"""Family-aware conformance: EVERY rule_id fires on its dirty fixture and stays
silent on its clean one — one parametrised case per rule, not one per family.

Ported from frontend.workspace.runtime/conformance/test_families.py, which is the
established shape for a JS provider. The `test_provider_contract.py` suite beside
this one asserts only that the SET of emitted ids equals the SET declared, across a
whole dirty tree. That is too coarse to catch the failure that matters: a rule whose
detector is subtly wrong still contributes its id to the set, so the set matches and
the suite passes while the rule fires on the wrong thing.

TWO FIXTURE LAYOUTS, both supported deliberately:

  PER-CHECK   fixtures/{clean,dirty}/<check_alias>/ — one directory per rule, so a
              rule can be asserted in ISOLATION. This is the parent's layout and the
              stronger assertion; it is used by the families whose checks are all
              per-file.

  COHERENT    fixtures/{clean,dirty}/ — one small project per state. Required by the
              families containing CROSS-FILE checks (dead-code reachability,
              duplication, layering): those read the whole tree at once, so
              per-check subdirectories contaminate each other — an unreferenced file
              in one rule's directory is genuinely unreachable, and the dead-code
              rule is right to say so. Splitting them would force fixtures that lie.

For the per-check layout this asserts isolation (fires HERE, silent THERE). For the
coherent layout it asserts presence/absence across the tree, which is the strongest
statement that layout can support.
"""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

import pytest
import yaml

_WS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_WS / "adapter"))

import run as run_mod  # noqa: E402

requires_bun = pytest.mark.skipif(shutil.which("bun") is None, reason="bun not on PATH")

_IMPLS = sorted(
    p for p in (_WS / "implementations").iterdir() if (p / "atdd.implementation.yaml").is_file()
)

_CASES: list[tuple[Path, str | None, str]] = []
for _d in _IMPLS:
    _manifest = yaml.safe_load((_d / "atdd.implementation.yaml").read_text())
    _mapf = _d / "checks" / "_map.json"
    if _mapf.is_file():
        # FAMILY: the check map is the authority on which alias owns which rule_id.
        for _alias, _rid in json.loads(_mapf.read_text()).items():
            _CASES.append((_d, _alias, _rid))
    else:
        for _rid in _manifest.get("emits_rule_ids", []):
            _CASES.append((_d, None, _rid))


def _emitted(impl: Path, root: Path) -> set[str]:
    r = run_mod.run_implementation(
        impl.name, impl / "detect.mjs", scan_roots=[str(root)], exclude_globs=[]
    )
    assert r.ran and r.structured, f"{impl.name} did not run or did not emit a structured report"
    return {v["rule_id"] for v in r.violations}


@requires_bun
@pytest.mark.parametrize(
    "impl,alias,rid", _CASES, ids=[f"{d.name}::{rid}" for d, a, rid in _CASES]
)
def test_rule_fires_on_dirty_and_not_on_clean(impl: Path, alias: str | None, rid: str) -> None:
    per_check = alias is not None and (impl / "fixtures" / "dirty" / alias).is_dir()
    dirty = impl / "fixtures" / "dirty" / alias if per_check else impl / "fixtures" / "dirty"
    clean = impl / "fixtures" / "clean" / alias if per_check else impl / "fixtures" / "clean"

    assert rid in _emitted(impl, dirty), f"{rid} did not fire on its dirty fixture ({dirty})"
    if clean.is_dir():
        assert rid not in _emitted(impl, clean), f"{rid} falsely fired on its clean fixture ({clean})"


@requires_bun
@pytest.mark.parametrize("impl", _IMPLS, ids=[d.name for d in _IMPLS])
def test_clean_fixture_is_entirely_silent(impl: Path) -> None:
    """A clean fixture must satisfy EVERY rule in its family, not just its own.

    The families are run whole, so a clean tree that satisfies one rule while
    violating a sibling would still pass the per-rule case above. This is what
    caught the RED fixture that carried no guaranteed-fail marker when
    `red-fails-first` was added.
    """
    clean = impl / "fixtures" / "clean"
    if not clean.is_dir():
        pytest.skip(f"{impl.name} ships no clean fixture tree")
    assert _emitted(impl, clean) == set(), f"{impl.name} clean fixture is not clean"


def test_every_declared_rule_has_a_check_entry() -> None:
    """`emits_rule_ids` and `checks/_map.json` agree — no rule declared without a
    check to emit it, and no check emitting a rule the manifest never declared."""
    for d in _IMPLS:
        mapf = d / "checks" / "_map.json"
        if not mapf.is_file():
            continue
        declared = set(yaml.safe_load((d / "atdd.implementation.yaml").read_text())["emits_rule_ids"])
        mapped = set(json.loads(mapf.read_text()).values())
        assert declared == mapped, (
            f"{d.name}: declared-not-mapped={sorted(declared - mapped)} "
            f"mapped-not-declared={sorted(mapped - declared)}"
        )


def test_every_rule_is_owned_by_exactly_one_implementation() -> None:
    """Two implementations claiming one rule_id is DuplicateConventionError at bind
    time; catching it here names the pair instead of failing a consumer's install."""
    owner: dict[str, str] = {}
    for d in _IMPLS:
        manifest = yaml.safe_load((d / "atdd.implementation.yaml").read_text())
        realizes = manifest.get("realizes_convention") or []
        if isinstance(realizes, str):
            realizes = [realizes]
        for rid in realizes:
            assert rid not in owner, f"{rid} realized by both {owner[rid]} and {d.name}"
            owner[rid] = d.name
