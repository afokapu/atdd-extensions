"""ADRs and the DERIVED decision registry (spec 2 §6).

One architectural decision lives in one ADR file. ``docs/architecture/decisions/
index.adoc`` is a registry PROJECTED from the ``:decides:`` edges — never a typed
list. A hand-maintained list of decisions drifts from the decisions, which is
precisely the failure class ATDD exists to kill, reproduced inside the documentation
system itself.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from . import RULE_ADR_REGISTRY_DERIVED
from .corpus import Document

DECISIONS_DIR = "docs/architecture/decisions"
REGISTRY_PATH = f"{DECISIONS_DIR}/index.adoc"

#: `adr-YYYYMMDD-NNN-<slug>.adoc` (spec 2 §6).
ADR_FILENAME_RE = re.compile(r"^adr-(\d{8})-(\d{3})-[a-z0-9][a-z0-9-]*\.adoc$")

#: `ADR-YYYYMMDD-NNN` as it appears in `:adr-id:` and in registry entries.
ADR_ID_RE = re.compile(r"\bADR-\d{8}-\d{3}\b")


@dataclass(frozen=True)
class AdrRecord:
    adr_id: str
    path: str
    decides: tuple[str, ...]


def is_adr_path(path: str) -> bool:
    if not path.startswith(DECISIONS_DIR + "/"):
        return False
    return bool(ADR_FILENAME_RE.match(path.rsplit("/", 1)[-1]))


def read_adrs(documents: list[Document]) -> list[AdrRecord]:
    """Every ADR in the corpus, in registry order (by adr-id)."""
    records: list[AdrRecord] = []
    for document in documents:
        if not is_adr_path(document.path):
            continue
        adr_id = document.attributes.get("adr-id", "")
        decides = tuple(
            part.strip()
            for part in document.attributes.get("decides", "").split(",")
            if part.strip()
        )
        records.append(AdrRecord(adr_id=adr_id, path=document.path, decides=decides))
    return sorted(records, key=lambda r: (r.adr_id, r.path))


def derive_registry(documents: list[Document]) -> tuple[str, ...]:
    """The projection: the set of adr-ids the corpus declares.

    This is the SAME function the registry is regenerated from, which is why the
    check and the generator can never disagree.
    """
    return tuple(sorted({r.adr_id for r in read_adrs(documents) if r.adr_id}))


def registry_violations(documents: list[Document]) -> list[dict]:
    """Compare the registry against the projection, in BOTH directions.

    A missing entry is the obvious drift. A STALE entry — an ADR listed after its
    file was renamed or removed — is the one that survives review, because a list
    that names something is read as authoritative about it.
    """
    registry = next((d for d in documents if d.path == REGISTRY_PATH), None)
    derived = set(derive_registry(documents))
    if registry is None:
        if not derived:
            return []  # no decisions directory, nothing to project
        return [
            {
                "rule_id": RULE_ADR_REGISTRY_DERIVED,
                "file": REGISTRY_PATH,
                "line": 1,
                "col": 1,
                "evidence": (
                    f"{len(derived)} ADR(s) exist and there is no registry to project them "
                    f"into: {', '.join(sorted(derived))}."
                ),
                "source_line": "",
            }
        ]

    listed = set(ADR_ID_RE.findall(registry.text))
    # The registry's own :adr-id:, if it declares one, is not an entry about itself.
    listed.discard(registry.attributes.get("adr-id", ""))

    missing = sorted(derived - listed)
    stale = sorted(listed - derived)
    if not missing and not stale:
        return []

    parts: list[str] = []
    if missing:
        parts.append(f"missing from the registry: {', '.join(missing)}")
    if stale:
        parts.append(f"listed but no such ADR exists: {', '.join(stale)}")
    return [
        {
            "rule_id": RULE_ADR_REGISTRY_DERIVED,
            "file": REGISTRY_PATH,
            "line": 1,
            "col": 1,
            "evidence": (
                "the ADR registry has drifted from the :decides: edges it is projected "
                "from — " + "; ".join(parts) + ". Regenerate it; do not type the entry."
            ),
            "source_line": "",
        }
    ]
