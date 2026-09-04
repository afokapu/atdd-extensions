"""The persona boundary is real: coder families never read a test file, and the
tester family reads nothing else.

This provider's analogue of frontend.workspace.runtime's `test_self_scoping.py`,
which proves Vite detectors skip `.astro` files and Astro detectors no-op without
one. The axis differs — that provider self-scopes by STACK, this one by PERSONA —
but the argument is identical: a detector that fires outside its scope
cross-contaminates a neighbour, and the guard must be shown to be CAUSAL rather
than incidental.

Why it matters here specifically: an ATDD extension is scoped to one persona, and
this provider serves two of them from one package. `atdd.extension.coder.htmx`
governs source; `atdd.extension.tester.htmx` governs the suite. If the coder
families read test files, a consumer would see complexity and layering violations
reported against its tests — and, worse, the two extensions could no longer be
adopted or ratcheted independently, which is the whole reason they are two packages.
"""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

import pytest
import yaml

_WS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_WS / "adapter"))

import run as run_mod  # noqa: E402

requires_bun = pytest.mark.skipif(shutil.which("bun") is None, reason="bun not on PATH")

_IMPLS = {p.name: p for p in (_WS / "implementations").iterdir()
          if (p / "atdd.implementation.yaml").is_file()}
_TESTER = "bun_tester_discipline_detector"
_CODER = sorted(n for n in _IMPLS if n != _TESTER)


def _emitted(impl_name: str, root: Path) -> list[dict]:
    impl = _IMPLS[impl_name]
    r = run_mod.run_implementation(
        impl_name, impl / "detect.mjs", scan_roots=[str(root)], exclude_globs=[]
    )
    assert r.ran and r.structured
    return r.violations


# A test file that would fire coder rules if a coder family ever read it: no GREEN
# header, console logging, a hardcoded secret, a bare fetch, and a deep function.
_DIRTY_TEST = '''import { it, expect } from "vitest";
const password = "hunter2-not-a-good-one";
it("does a thing", async () => {
  console.log("starting");
  const res = await fetch("https://staging.example.com/api");
  expect(res.status).toBe(200);
});
'''

# A source file that would fire tester rules if the tester family ever read it: it
# looks like a suite (describe/it) but is not a test FILE.
_DIRTY_SOURCE = '''export const describe = (_n: string, f: () => void) => f();
export const it = (_n: string, f: () => void) => f();
export function run() {
  describe("orders", () => {
    it.skip("is skipped", () => {});
  });
}
'''


@requires_bun
@pytest.mark.parametrize("impl_name", _CODER)
def test_coder_families_never_read_a_test_file(impl_name: str, tmp_path: Path) -> None:
    root = tmp_path / "only_tests"
    root.mkdir()
    (root / "orders.test.ts").write_text(_DIRTY_TEST)
    violations = _emitted(impl_name, root)
    assert violations == [], (
        f"{impl_name} reported on a test file: "
        f"{[(v['rule_id'], Path(v['file']).name) for v in violations]}"
    )


@requires_bun
def test_coder_guard_is_causal_not_incidental(tmp_path: Path) -> None:
    """The same dirt in a SOURCE file must fire.

    Without this the test above would pass for a detector that is simply broken.
    Renaming one file is the whole difference between the two trees.
    """
    root = tmp_path / "as_source"
    root.mkdir()
    (root / "orders.ts").write_text(_DIRTY_TEST)
    fired = {v["rule_id"] for v in _emitted("bun_security_hygiene_detector", root)}
    assert "coder.bun.security-hardcoded-secret" in fired, (
        "the coder family did not fire on the same content as a source file, so the "
        "test-file no-op above proves nothing"
    )


@requires_bun
def test_tester_family_reads_only_test_files(tmp_path: Path) -> None:
    root = tmp_path / "only_source"
    root.mkdir()
    (root / "harness.ts").write_text(_DIRTY_SOURCE)
    violations = _emitted(_TESTER, root)
    assert violations == [], (
        f"the tester family reported on a source file: "
        f"{[(v['rule_id'], Path(v['file']).name) for v in violations]}"
    )


@requires_bun
def test_tester_guard_is_causal_not_incidental(tmp_path: Path) -> None:
    """The same content named as a test file must fire."""
    root = tmp_path / "as_test"
    root.mkdir()
    (root / "harness.test.ts").write_text(_DIRTY_SOURCE)
    fired = {v["rule_id"] for v in _emitted(_TESTER, root)}
    assert "tester.bun.test-carries-urn-identity" in fired, (
        "the tester family did not fire on the same content as a test file, so the "
        "source-file no-op above proves nothing"
    )


def test_the_two_personas_declare_disjoint_rule_namespaces() -> None:
    """Coder rules are `coder.*`, tester rules are `tester.*` — no overlap.

    A shared id would make the two extensions inseparable at bind time, which is
    exactly what owning one persona each is meant to prevent.
    """
    ns: dict[str, set[str]] = {"coder": set(), "tester": set()}
    for name, path in _IMPLS.items():
        ids = yaml.safe_load((path / "atdd.implementation.yaml").read_text())["emits_rule_ids"]
        for rid in ids:
            persona = rid.split(".", 1)[0]
            assert persona in ns, f"{rid} is in neither persona namespace"
            ns[persona].add(rid)
            expected = "tester" if name == _TESTER else "coder"
            assert persona == expected, f"{name} emits {rid}, which is a {persona} rule"
    assert ns["coder"] and ns["tester"]
    assert not (ns["coder"] & ns["tester"])
