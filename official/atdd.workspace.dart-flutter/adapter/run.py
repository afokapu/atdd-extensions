"""Run half of the atdd.workspace.dart-flutter provider contract (contract_version 1.0.0).

SKELETON. The public surface (the ``RunResult`` dataclass, ``run_implementation``)
mirrors atdd.workspace.python-pytest's adapter — the provider-contract precedent.
``run_implementation`` executes discovered implementations with the provider command
and translates the outcome into the ATDD violation-output contract (``rule_id`` +
location). Bodies are documented NotImplementedError stubs; the real run/translate
logic is authored in the build slice. See
official/atdd.workspace.python-pytest/adapter/run.py for the reference to mirror.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

CONTRACT_VERSION = "1.0.0"

_NOT_BUILT = (
    "skeleton — authored in the build slice; mirror "
    "atdd.workspace.python-pytest/adapter/run.py"
)


@dataclass(frozen=True)
class RunResult:
    """Outcome of running one implementation's tests under the provider."""

    implementation_id: str
    passed: bool
    exit_code: int
    violations: list[dict] = field(default_factory=list)
    stdout: str = ""

    @property
    def ran(self) -> bool:
        """True when the runner actually collected and executed (not a usage error)."""
        raise NotImplementedError(_NOT_BUILT)


def run_implementation(
    implementation_id: str, test_path: str | Path, *, env: dict | None = None
) -> RunResult:
    """Run the provider command over ``test_path`` and return a contract-shaped result.

    ``test_path`` is a file or directory inside the resolved workspace instance.
    """
    raise NotImplementedError(_NOT_BUILT)
