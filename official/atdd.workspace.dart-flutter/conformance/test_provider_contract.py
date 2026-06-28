"""Conformance suite for atdd.workspace.dart-flutter (contract_version 1.0.0).

SKELETON — mirrors atdd.workspace.python-pytest/conformance/test_provider_contract.py.
The tests are skipped until the adapter is authored in the build slice; they exist so
a new runtime proves it satisfies the SAME discover+run contract by making an
equivalent suite pass. Conformance tests stay WITH the provider, never inside the
extensions that consume it.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

# Import the provider adapter (sibling ../adapter) without packaging it.
_ADAPTER = Path(__file__).resolve().parent.parent / "adapter"
sys.path.insert(0, str(_ADAPTER))

import discover as discover_mod  # noqa: E402
import run as run_mod  # noqa: E402

pytestmark = pytest.mark.skip(
    reason="skeleton — adapter is a NotImplementedError stub; authored in the build slice"
)


def test_discover_returns_only_contract_compatible(tmp_path: Path) -> None:
    discover_mod.discover_implementations(tmp_path)


def test_run_passing_yields_no_violations(tmp_path: Path) -> None:
    run_mod.run_implementation("ext.ok", tmp_path / "test_pass.py")
