"""Discovery half of the atdd.workspace.convex provider contract (contract_version 1.1.0).

Given a resolved workspace instance root, locate the validator implementations an
extension ships (``**/atdd.implementation.yaml``) and return the ones whose
declared ``contract_version`` is compatible with this provider.

This is a line-for-line sibling of atdd.workspace.python-pytest/adapter/discover.py
— the SAME discover contract — because a Convex/JS runtime claims the same
discover/run protocol the engine speaks. The only difference between the two
providers is the RUN command (``run.py``); discovery is identical.

Self-contained: the provider owns its own contract math (a caret SemVer check) so
the adapter runs without importing ATDD core internals.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

import yaml

CONTRACT_VERSION = "1.1.0"
IMPLEMENTATION_GLOB = "atdd.implementation.yaml"

_SEMVER = re.compile(r"^(\d+)\.(\d+)\.(\d+)$")


@dataclass(frozen=True)
class Implementation:
    """A discovered, contract-compatible implementation the provider will run."""

    implementation_id: str
    contract_version: str
    manifest_path: Path
    targets_workspace: str


def _parse_semver(value: str) -> tuple[int, int, int]:
    m = _SEMVER.match(str(value or "").strip())
    if not m:
        raise ValueError(f"invalid SemVer {value!r}; expected MAJOR.MINOR.PATCH")
    return tuple(int(g) for g in m.groups())  # type: ignore[return-value]


def contract_compatible(impl_version: str, provider_version: str = CONTRACT_VERSION) -> bool:
    """True if ``impl_version`` is satisfiable by this provider.

    Same MAJOR, and the implementation must not require a NEWER provider than is
    present: ``impl_version <= provider_version`` within the shared major.
    """
    imaj, imin, ipat = _parse_semver(impl_version)
    pmaj, pmin, ppat = _parse_semver(provider_version)
    return imaj == pmaj and (imin, ipat) <= (pmin, ppat)


def discover_implementations(
    instance_root: str | Path, *, provider_version: str = CONTRACT_VERSION
) -> list[Implementation]:
    """Walk ``instance_root`` for implementation manifests this provider can run.

    Returns only implementations whose ``contract_version`` is caret-compatible
    with ``provider_version`` AND that target THIS workspace. Manifests that are
    malformed, target a different workspace, or declare an incompatible contract
    are skipped.
    """
    root = Path(instance_root)
    found: list[Implementation] = []
    for manifest_path in sorted(root.rglob(IMPLEMENTATION_GLOB)):
        try:
            data = yaml.safe_load(manifest_path.read_text()) or {}
        except (OSError, yaml.YAMLError):
            continue
        if data.get("kind") != "implementation":
            continue
        impl_id = data.get("implementation_id")
        version = data.get("contract_version")
        if not impl_id or not version:
            continue
        targets = str(data.get("targets_workspace", ""))
        if targets and targets != "atdd.workspace.convex":
            continue
        try:
            if not contract_compatible(str(version), provider_version):
                continue
        except ValueError:
            continue
        found.append(
            Implementation(
                implementation_id=str(impl_id),
                contract_version=str(version),
                manifest_path=manifest_path,
                targets_workspace=targets,
            )
        )
    return found
