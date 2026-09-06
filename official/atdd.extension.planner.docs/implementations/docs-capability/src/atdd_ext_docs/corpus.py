"""Reading the canonical tree: format, identity and area indexes (spec 2 §4, §5.1).

Everything here is a LOCATION test or an ATTRIBUTE test — deterministic, cheap, and
answerable from the tree alone. Nothing here asks a semantic question such as "is
this really documentation?"; spec 2 §4 chose the decidable form deliberately, and
the same reasoning shapes ``declaration.undeclared_change_violations``.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

from . import (
    RULE_AREA_INDEX_REQUIRED,
    RULE_ASCIIDOC_ONLY,
    RULE_DOC_ID_UNIQUE,
    RULE_IDENTITY_REQUIRED,
)

DOCS_DIR = "docs"
DIST_DIR = "docs/dist"

#: The six authored areas of spec 2 §4. `dist/` is absent by design: it is render
#: output, excluded from the authored-format rule and never required to carry an index.
CANONICAL_AREAS: tuple[str, ...] = (
    "docs",
    "docs/purpose",
    "docs/architecture",
    "docs/architecture/decisions",
    "docs/delivery",
    "docs/archive",
)

ARCHIVE_PREFIX = "docs/archive/"

#: An AsciiDoc header attribute: `:doc-id: architecture.shared-control-root`.
_ATTRIBUTE_RE = re.compile(r"^:([A-Za-z][A-Za-z0-9_-]*):[ \t]*(.*?)[ \t]*$")


@dataclass(frozen=True)
class Document:
    """One authored AsciiDoc document, with its header attributes parsed."""

    path: str  # repository-relative, forward slashes
    text: str
    attributes: dict[str, str] = field(default_factory=dict)
    attribute_lines: dict[str, int] = field(default_factory=dict)

    @property
    def doc_id(self) -> str:
        return self.attributes.get("doc-id", "")

    @property
    def status(self) -> str:
        return self.attributes.get("status", "")


def _rel(path: Path, root: Path) -> str:
    try:
        return path.relative_to(root).as_posix()
    except ValueError:
        return path.as_posix()


def _read(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def is_generated(rel_path: str) -> bool:
    """True for render output, which no authored-surface rule ever scans."""
    return rel_path == DIST_DIR or rel_path.startswith(DIST_DIR + "/")


def parse_attributes(text: str) -> tuple[dict[str, str], dict[str, int]]:
    """Parse the AsciiDoc header attribute block.

    Attributes are read from the header only — the run of lines before the first
    blank line that follows a `:name: value` line. An attribute set deep in the body
    is not document identity, and treating it as such would let a doc-id appear
    inside a code sample.
    """
    attributes: dict[str, str] = {}
    lines: dict[str, int] = {}
    seen_attribute = False
    for number, line in enumerate(text.splitlines(), start=1):
        match = _ATTRIBUTE_RE.match(line)
        if match:
            name, value = match.group(1), match.group(2)
            seen_attribute = True
            if name not in attributes:  # first wins; a repeat is not a new identity
                attributes[name] = value
                lines[name] = number
            continue
        if not line.strip():
            if seen_attribute:
                break  # end of the header block
            continue
        if line.startswith("="):
            continue  # the document title sits inside the header
        # Body text has started. This breaks whether or not an attribute was seen
        # yet: before the fix it only broke AFTER one, so a document with prose
        # first and a `:doc-id:` quoted later inside a code sample adopted that id
        # as its own identity — inventing a duplicate against the real owner and
        # suppressing its own identity-required finding.
        break
    return attributes, lines


def read_corpus(repo_root: Path) -> list[Document]:
    """Every authored `.adoc` beneath `docs/`, excluding render output."""
    docs_root = repo_root / DOCS_DIR
    if not docs_root.is_dir():
        return []
    documents: list[Document] = []
    for path in sorted(docs_root.rglob("*.adoc")):
        rel = _rel(path, repo_root)
        if is_generated(rel) or not path.is_file():
            continue
        text = _read(path)
        attributes, lines = parse_attributes(text)
        documents.append(Document(path=rel, text=text, attributes=attributes, attribute_lines=lines))
    return documents


def _violation(rule_id: str, path: str, line: int, evidence: str, source_line: str = "") -> dict:
    return {
        "rule_id": rule_id,
        "file": path,
        "line": line,
        "col": 1,
        "evidence": evidence,
        "source_line": source_line,
    }


def _line_text(text: str, number: int) -> str:
    lines = text.splitlines()
    return lines[number - 1] if 1 <= number <= len(lines) else ""


def asciidoc_only_violations(repo_root: Path) -> list[dict]:
    """Authored markdown beneath `docs/`, outside `docs/dist/` (spec 2 §4)."""
    docs_root = repo_root / DOCS_DIR
    if not docs_root.is_dir():
        return []
    out: list[dict] = []
    for path in sorted(docs_root.rglob("*.md")):
        rel = _rel(path, repo_root)
        if is_generated(rel) or not path.is_file():
            continue
        out.append(
            _violation(
                RULE_ASCIIDOC_ONLY,
                rel,
                1,
                f"authored markdown beneath docs/: {rel}. AsciiDoc is the only authored "
                f"format; convert it, and convert a historical document INTO docs/archive/ "
                f"rather than into a current area.",
                _line_text(_read(path), 1),
            )
        )
    return out


def identity_violations(documents: list[Document]) -> list[dict]:
    """A document missing `:doc-id:` or `:status:` (spec 2 §5.1)."""
    out: list[dict] = []
    for document in documents:
        missing = [name for name in ("doc-id", "status") if not document.attributes.get(name)]
        if not missing:
            continue
        out.append(
            _violation(
                RULE_IDENTITY_REQUIRED,
                document.path,
                1,
                "document declares no " + " and no ".join(f":{name}:" for name in missing)
                + ". Identity and currency are both required: an id with no status is a node "
                "whose currency is unknown, a status with no id is a claim nothing can reference.",
                _line_text(document.text, 1),
            )
        )
    return out


def duplicate_doc_id_violations(documents: list[Document]) -> list[dict]:
    """A `doc-id` declared by more than one document (spec 2 §5.1).

    EVERY file carrying the duplicated id is reported, not just the second one.
    There is no principled basis for calling one of them the original, and naming
    only one would send an author to fix the wrong file.
    """
    by_id: dict[str, list[Document]] = {}
    for document in documents:
        if document.doc_id:
            by_id.setdefault(document.doc_id, []).append(document)
    out: list[dict] = []
    for doc_id, group in sorted(by_id.items()):
        if len(group) < 2:
            continue
        others = [d.path for d in group]
        for document in group:
            line = document.attribute_lines.get("doc-id", 1)
            out.append(
                _violation(
                    RULE_DOC_ID_UNIQUE,
                    document.path,
                    line,
                    f"doc-id {doc_id!r} is declared by {len(group)} documents: "
                    f"{', '.join(others)}. Resolution needs exactly one target per id.",
                    _line_text(document.text, line),
                )
            )
    return out


def area_index_violations(repo_root: Path) -> list[dict]:
    """A canonical area that exists and carries no `index.adoc` (spec 2 §4).

    An area that does NOT exist is not reported. The tree grows when a real
    requirement justifies an area; demanding one to fill an empty taxonomy is the
    thing spec 2 §4 warns against.
    """
    out: list[dict] = []
    for area in CANONICAL_AREAS:
        area_path = repo_root / area
        if not area_path.is_dir():
            continue
        if (area_path / "index.adoc").is_file():
            continue
        out.append(
            _violation(
                RULE_AREA_INDEX_REQUIRED,
                f"{area}/index.adoc",
                1,
                f"canonical area {area}/ exists and carries no index.adoc. The rendered "
                f"site cannot navigate into an area with no entry point.",
            )
        )
    return out
