"""Discovery half of the atdd.workspace.typescript provider contract (contract_version 1.0.0).

SKELETON. The public surface (the ``Implementation`` dataclass, ``contract_compatible``,
``discover_implementations``) mirrors atdd.workspace.python-pytest's adapter — the
provider-contract precedent — so this runtime claims the SAME discover/run contract.
Bodies are documented NotImplementedError stubs; the real discovery logic is authored
in the build slice. See official/atdd.workspace.python-pytest/adapter/discover.py for
the reference implementation to mirror.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

CONTRACT_VERSION = "1.0.0"
IMPLEMENTATION_GLOB = "atdd.implementation.yaml"

_NOT_BUILT = (
    "skeleton — authored in the build slice; mirror "
    "atdd.workspace.python-pytest/adapter/discover.py"
)


@dataclass(frozen=True)
class Implementation:
    """A discovered, contract-compatible implementation the provider will run."""

    implementation_id: str
    contract_version: str
    manifest_path: Path
    targets_workspace: str


def contract_compatible(impl_version: str, provider_version: str = CONTRACT_VERSION) -> bool:
    """True if ``impl_version`` is satisfiable by this provider.

    Same MAJOR, and the implementation must not require a NEWER provider than is
    present (``impl_version <= provider_version`` within the shared major).
    """
    raise NotImplementedError(_NOT_BUILT)


def discover_implementations(
    instance_root: str | Path, *, provider_version: str = CONTRACT_VERSION
) -> list[Implementation]:
    """Walk ``instance_root`` for implementation manifests this provider can run.

    Returns only implementations whose ``contract_version`` is caret-compatible with
    ``provider_version``; malformed / wrong-workspace / incompatible manifests are skipped.
    """
    raise NotImplementedError(_NOT_BUILT)
