"""Conformance suite for atdd.workspace.python-pytest (contract_version 1.0.0).

A real pytest run — not a stub — proving the provider's discover + run halves
satisfy the contract. A different runtime (node-vitest, go-test) claiming this
contract proves it by making an equivalent suite pass.
"""
from __future__ import annotations

import sys
import textwrap
from pathlib import Path

import pytest

# Import the provider adapter (sibling ../adapter) without packaging it.
_ADAPTER = Path(__file__).resolve().parent.parent / "adapter"
sys.path.insert(0, str(_ADAPTER))

import discover as discover_mod  # noqa: E402
import run as run_mod  # noqa: E402


def _impl_manifest(impl_id: str, contract_version: str) -> str:
    return textwrap.dedent(
        f"""\
        kind: implementation
        implementation_id: {impl_id}
        targets_workspace: atdd.workspace.python-pytest
        contract_version: "{contract_version}"
        """
    )


# ── discover ────────────────────────────────────────────────────────────────


def test_discover_returns_only_contract_compatible(tmp_path: Path) -> None:
    (tmp_path / "ok").mkdir()
    (tmp_path / "ok" / "atdd.implementation.yaml").write_text(_impl_manifest("ext.ok", "1.0.0"))
    (tmp_path / "newer").mkdir()
    # 2.0.0 requires a newer provider major → incompatible, must be skipped.
    (tmp_path / "newer" / "atdd.implementation.yaml").write_text(_impl_manifest("ext.newer", "2.0.0"))

    found = discover_mod.discover_implementations(tmp_path)

    assert [i.implementation_id for i in found] == ["ext.ok"]
    assert found[0].targets_workspace == "atdd.workspace.python-pytest"


def test_discover_skips_malformed_and_non_implementation(tmp_path: Path) -> None:
    (tmp_path / "bad").mkdir()
    (tmp_path / "bad" / "atdd.implementation.yaml").write_text(": not: valid: yaml:")
    (tmp_path / "wrongkind").mkdir()
    (tmp_path / "wrongkind" / "atdd.implementation.yaml").write_text("kind: workspace\n")

    assert discover_mod.discover_implementations(tmp_path) == []


@pytest.mark.parametrize(
    "impl,provider,expected",
    [
        ("1.0.0", "1.0.0", True),
        ("1.0.0", "1.2.0", True),   # older impl on newer provider: ok
        ("1.3.0", "1.2.0", False),  # impl needs newer minor than provider: no
        ("2.0.0", "1.0.0", False),  # major mismatch: no
    ],
)
def test_contract_compatible(impl: str, provider: str, expected: bool) -> None:
    assert discover_mod.contract_compatible(impl, provider) is expected


# ── run ──────────────────────────────────────────────────────────────────────


def test_run_passing_yields_no_violations(tmp_path: Path) -> None:
    test_file = tmp_path / "test_pass.py"
    test_file.write_text("def test_ok():\n    assert 1 == 1\n")

    result = run_mod.run_implementation("ext.ok", test_file)

    assert result.ran
    assert result.passed
    assert result.exit_code == 0
    assert result.violations == []


def test_run_failing_yields_one_violation_keyed_by_impl(tmp_path: Path) -> None:
    test_file = tmp_path / "test_fail.py"
    test_file.write_text("def test_bad():\n    assert 1 == 2\n")

    result = run_mod.run_implementation("ext.bad", test_file)

    assert result.ran
    assert not result.passed
    assert result.exit_code == 1
    assert len(result.violations) == 1
    assert result.violations[0]["rule_id"] == "ext.bad"
    assert result.violations[0]["location"] == "."
