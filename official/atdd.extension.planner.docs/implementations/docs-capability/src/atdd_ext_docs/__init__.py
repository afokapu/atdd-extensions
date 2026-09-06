"""Standard documentation capability for ATDD (handoff spec 2 of 2).

The package core discovers over the ``atdd.documentation`` entry point. It owns
everything core is forbidden to name: the canonical tree, the authored format,
document identity, the relationship graph, ADRs, rendering and reference integrity.

No ``atdd.*`` import appears anywhere in this package. That is not incidental — the
capability is reached through an entry point precisely so that core never names a
concrete extension and the extension never reaches into core's substrate.
"""
from __future__ import annotations

__all__ = ["ALL_RULE_IDS"]

# Rule ids this package realizes. NOT new nodes: each has a convention node in
# ../../../conventions/, and the node is the obligation. These constants only let
# the detector name what it emits.
RULE_ASCIIDOC_ONLY = "planner.docs.asciidoc-only"
RULE_IDENTITY_REQUIRED = "planner.docs.identity-required"
RULE_DOC_ID_UNIQUE = "planner.docs.doc-id-unique"
RULE_GRAPH_TARGET_RESOLVES = "planner.docs.graph-target-resolves"
RULE_AREA_INDEX_REQUIRED = "planner.docs.area-index-required"
RULE_ADR_REGISTRY_DERIVED = "planner.docs.adr-registry-derived"
RULE_ARTIFACT_PATH_SHAPE = "planner.docs.artifact-path-shape"
RULE_UNDECLARED_CHANGE = "planner.docs.undeclared-change"
RULE_REFERENCE_INTEGRITY = "planner.docs.reference-integrity"

ALL_RULE_IDS = (
    RULE_ASCIIDOC_ONLY,
    RULE_IDENTITY_REQUIRED,
    RULE_DOC_ID_UNIQUE,
    RULE_GRAPH_TARGET_RESOLVES,
    RULE_AREA_INDEX_REQUIRED,
    RULE_ADR_REGISTRY_DERIVED,
    RULE_ARTIFACT_PATH_SHAPE,
    RULE_UNDECLARED_CHANGE,
    RULE_REFERENCE_INTEGRITY,
)
