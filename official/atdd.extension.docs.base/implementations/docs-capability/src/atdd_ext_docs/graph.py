"""THE canonical documentation graph resolver (spec 2 §5.3, §5.4).

Resolve or report — never invent.

    Every relationship target MUST be resolved against the set of declared doc-ids.
    A target outside that set is a reported finding. It is NEVER a fabricated node,
    and never silence.

WHY THIS MODULE EXISTS AT ALL, rather than reusing ``graph_builder.py``. That
substrate lacks the discipline, and the cost is measured. Reproduced live on the
ATDD working tree, 2026-09-06 (#1758):

    total nodes                                 : 3208
    fabricated nodes                            :   44
    feature -> component CONTAINS (urn-structure):  168
      parent DECLARED                           :   21   ( 12.5% )
      parent INVENTED                           :  147   ( 87.5% )

The mechanism is four lines at ``graph_builder.py:215``: ``_ensure_node`` synthesizes
a bare node for any URN the graph has not seen, and ``add_edge`` calls it on BOTH
endpoints of every edge, so an edge naming a non-existent target conjures the target
into being. There is no ``_ensure_node`` here and there must never be one.

Fabrication is WORSE than absence. An absent parent leaves a node orphaned and an
orphan check catches it; a fabricated parent makes the node look connected, which
defeats the check more thoroughly. That is why ``resolve`` guarantees
``set(graph.nodes) == declared ids`` and why the regression test asserts the node
count directly rather than merely asserting that a finding was produced.

The documentation graph is genuinely easier than the traceability graph, and the
reason is worth keeping in view: doc-ids are a CLOSED, ENUMERABLE set read from the
files. Build the declared set first, then reject any edge naming an id outside it.
Nothing here parses a parent out of an identifier's substring — the move that
produced #1758.

ONE RESOLVER. #1755 found the same lifecycle resolution implemented up to seven
times, two pairs sharing a name with incompatible signatures. This module is the
single documentation resolver; everything that needs the graph calls ``resolve``.
"""
from __future__ import annotations

from dataclasses import dataclass

from . import RULE_GRAPH_TARGET_RESOLVES
from .corpus import Document

#: The four CONFIRMED verbs of spec 2 §5.2. `refines` is deliberately NOT shipped:
#: its meaning overlaps containment, which the filesystem already expresses by
#: nesting, and spec 2 §9 Decision 3 keeps it out until someone produces a concrete
#: pair of documents where it says something the directory structure does not.
#: Four verbs that each do distinct work beat five where one is decorative.
RELATIONSHIP_VERBS: tuple[str, ...] = ("decides", "supersedes", "implements", "depends-on")


@dataclass(frozen=True)
class Edge:
    """A resolved edge. It exists only because its target was declared."""

    source: str
    verb: str
    target: str


@dataclass(frozen=True)
class Unresolved:
    """An edge whose target no document declares. Reported, never materialized."""

    source: str
    verb: str
    target: str
    path: str
    line: int


@dataclass(frozen=True)
class DocumentationGraph:
    """A projection, rebuilt on demand — never stored.

    Spec 2 §5.3: a persisted graph is a second registry, and a second registry
    drifts. Nothing in this package writes a graph to disk.
    """

    nodes: tuple[str, ...]
    edges: tuple[Edge, ...]
    unresolved: tuple[Unresolved, ...]

    def targets_of(self, source: str, verb: str) -> tuple[str, ...]:
        return tuple(e.target for e in self.edges if e.source == source and e.verb == verb)


def _split_targets(value: str) -> list[str]:
    """An attribute may name several targets, comma-separated."""
    return [part.strip() for part in value.split(",") if part.strip()]


def declared_ids(documents: list[Document]) -> frozenset[str]:
    """The closed set every edge resolves against. Built FIRST, always."""
    return frozenset(d.doc_id for d in documents if d.doc_id)


def resolve(documents: list[Document]) -> DocumentationGraph:
    """Build the graph from declared documents, resolving or reporting every edge.

    Invariant, asserted by the #1758 regression test:
    ``set(graph.nodes) == declared_ids(documents)`` — always, for every input.
    """
    declared = declared_ids(documents)
    edges: list[Edge] = []
    unresolved: list[Unresolved] = []

    for document in documents:
        source = document.doc_id
        if not source:
            continue  # no identity: reported by corpus.identity_violations, not here
        for verb in RELATIONSHIP_VERBS:
            raw = document.attributes.get(verb)
            if not raw:
                continue  # an absent attribute is not an unresolved edge
            line = document.attribute_lines.get(verb, 1)
            for target in _split_targets(raw):
                if target in declared:
                    edges.append(Edge(source=source, verb=verb, target=target))
                else:
                    # NOT a node. Not silence. A reported finding.
                    unresolved.append(
                        Unresolved(source=source, verb=verb, target=target,
                                   path=document.path, line=line)
                    )

    return DocumentationGraph(
        nodes=tuple(sorted(declared)),
        edges=tuple(edges),
        unresolved=tuple(unresolved),
    )


def unresolved_target_violations(documents: list[Document], graph: DocumentationGraph) -> list[dict]:
    """One finding per unresolved target, naming the document and the edge."""
    by_path = {d.path: d for d in documents}
    out: list[dict] = []
    for item in graph.unresolved:
        document = by_path.get(item.path)
        source_line = ""
        if document is not None:
            lines = document.text.splitlines()
            if 1 <= item.line <= len(lines):
                source_line = lines[item.line - 1]
        out.append(
            {
                "rule_id": RULE_GRAPH_TARGET_RESOLVES,
                "file": item.path,
                "line": item.line,
                "col": 1,
                "evidence": (
                    f"{item.source} :{item.verb}: {item.target} — no document declares the "
                    f"doc-id {item.target!r}. The target was REPORTED and no node was created "
                    f"for it; declare the target document, or fix the reference."
                ),
                "source_line": source_line,
            }
        )
    return out
