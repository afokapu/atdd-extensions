"""Runnable enforcement for the nine standard documentation rules (python-pytest).

Two layers, the same shape as the python-pytest fleet detectors:

  1. DETECTOR SELF-TESTS — pin the decision logic for all nine rule_ids. The clean
     fixture emits nothing across every rule, and each isolated dirty fixture fires
     EXACTLY its own rule and no other, proving the checks are independent. Plus the
     capability's verdict contract, which is the half core actually reads back.

  2. EMISSION (the v1.1 contract job, NOT a verdict) — scan ``ATDD_SCAN_ROOTS`` and
     write the RAW structured violations to ``ATDD_VIOLATIONS_REPORT`` for
     ``adapter/run.py`` to read back.

CRITICAL — the emission layer does NOT ``assert violations == []``. The detector
emits RAW facts; applying a disposition (blocking) is the GATE's job
(``gates/docs-capability.gate.yaml``), never the detector's.

No core (``atdd.*``) imports anywhere; the capability is imported by path.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import sys

# The package lives in ../src (manifest entrypoint: src/atdd_ext_docs/capability.py).
_HERE = Path(__file__).resolve().parent
_SRC = _HERE.parent / "src"
sys.path.insert(0, str(_SRC))

import atdd_ext_docs as pkg  # noqa: E402
from atdd_ext_docs import adr, capability, corpus, declaration, graph, render, verdict  # noqa: E402

_FIXTURES = _HERE.parent / "fixtures"

CONTRACT_VERSION = "1.1.0"
ENV_SCAN_ROOTS = "ATDD_SCAN_ROOTS"
ENV_REPORT = "ATDD_VIOLATIONS_REPORT"


def _rule_ids(violations: list[dict]) -> set[str]:
    return {v["rule_id"] for v in violations}


def _clean_render(monkeypatch) -> None:
    """Pretend asciidoctor ran and said nothing.

    Used by every test whose subject is NOT the renderer. asciidoctor is a Ruby
    dependency (spec 2 §9 Decision 4) and is absent on most developer machines; a
    suite that silently changed verdict with its presence would be untrustworthy.
    """
    monkeypatch.setattr(render, "render", lambda repo_root: render.RenderOutcome())


# ── 1a. parsing + shared helpers ──────────────────────────────────────────────


def test_parse_attributes_reads_the_header_block_only() -> None:
    text = (
        "= Title\n"
        ":doc-id: architecture.x\n"
        ":status: current\n"
        "\n"
        "Body text.\n"
        ":doc-id: architecture.impostor\n"
    )
    attributes, lines = corpus.parse_attributes(text)
    assert attributes["doc-id"] == "architecture.x"
    assert attributes["status"] == "current"
    assert lines["doc-id"] == 2
    # An attribute in the BODY is not identity; a doc-id inside a code sample must
    # never be able to rename the document.
    assert attributes["doc-id"] != "architecture.impostor"


def test_dist_is_generated_output_and_never_authored() -> None:
    assert corpus.is_generated("docs/dist/index.md") is True
    assert corpus.is_generated("docs/dist") is True
    assert corpus.is_generated("docs/architecture/notes.md") is False
    # A path merely starting with the same letters is not inside dist/.
    assert corpus.is_generated("docs/distribution/notes.md") is False


def test_refines_is_not_shipped() -> None:
    """Spec 2 §9 Decision 3: four verbs that each do distinct work beat five."""
    assert graph.RELATIONSHIP_VERBS == ("decides", "supersedes", "implements", "depends-on")
    assert "refines" not in graph.RELATIONSHIP_VERBS


# ── 1b. clean fixture: every rule passes ──────────────────────────────────────


def test_clean_fixture_has_no_violations_across_all_rules() -> None:
    assert capability.scan_root(_FIXTURES / "clean") == []


def test_clean_fixture_resolves_every_edge_it_declares() -> None:
    documents = corpus.read_corpus(_FIXTURES / "clean")
    g = graph.resolve(documents)
    assert g.unresolved == ()
    # Three of the four confirmed verbs are exercised by the clean corpus.
    assert g.targets_of("architecture.shared-control-root", "implements") == ("purpose.worktrees",)
    assert g.targets_of("architecture.shared-control-root", "supersedes") == ("archive.2025-control-root",)
    assert g.targets_of("architecture.decisions.adr-001", "decides") == ("architecture.shared-control-root",)


def test_markdown_under_dist_is_not_an_authored_format_violation() -> None:
    """The clean fixture ships docs/dist/index.md deliberately."""
    assert (_FIXTURES / "clean" / "docs/dist/index.md").is_file()
    assert corpus.asciidoc_only_violations(_FIXTURES / "clean") == []


# ── 1c. each dirty fixture fires EXACTLY its own rule (independence) ───────────


def test_dirty_markdown_fires_only_asciidoc_only() -> None:
    v = capability.scan_root(_FIXTURES / "dirty_markdown")
    assert _rule_ids(v) == {pkg.RULE_ASCIIDOC_ONLY}
    assert len(v) == 1
    assert v[0]["file"] == "docs/architecture/notes.md"
    assert set(v[0]) >= {"rule_id", "file", "line", "col", "evidence", "source_line"}


def test_dirty_identity_fires_only_identity_required() -> None:
    v = capability.scan_root(_FIXTURES / "dirty_identity")
    assert _rule_ids(v) == {pkg.RULE_IDENTITY_REQUIRED}
    assert len(v) == 1
    assert v[0]["file"] == "docs/delivery/release.adoc"
    assert ":doc-id:" in v[0]["evidence"] and ":status:" in v[0]["evidence"]


def test_dirty_duplicate_id_fires_only_doc_id_unique_and_names_every_holder() -> None:
    v = capability.scan_root(_FIXTURES / "dirty_duplicate_id")
    assert _rule_ids(v) == {pkg.RULE_DOC_ID_UNIQUE}
    # BOTH documents are reported: there is no principled original.
    assert {item["file"] for item in v} == {
        "docs/delivery/worktrees.adoc",
        "docs/purpose/worktrees.adoc",
    }
    for item in v:
        assert "purpose.worktrees" in item["evidence"]


def test_dirty_missing_index_fires_only_area_index_required() -> None:
    v = capability.scan_root(_FIXTURES / "dirty_missing_index")
    assert _rule_ids(v) == {pkg.RULE_AREA_INDEX_REQUIRED}
    assert len(v) == 1
    assert v[0]["file"] == "docs/delivery/index.adoc"


def test_dirty_adr_registry_fires_only_adr_registry_derived() -> None:
    v = capability.scan_root(_FIXTURES / "dirty_adr_registry")
    assert _rule_ids(v) == {pkg.RULE_ADR_REGISTRY_DERIVED}
    assert len(v) == 1
    assert "ADR-20260906-002" in v[0]["evidence"]


def test_every_corpus_rule_id_is_proven_by_some_dirty_fixture() -> None:
    seen: set[str] = set()
    for name in (
        "dirty_markdown",
        "dirty_identity",
        "dirty_duplicate_id",
        "dirty_unresolved_edge",
        "dirty_missing_index",
        "dirty_adr_registry",
    ):
        seen |= _rule_ids(capability.scan_root(_FIXTURES / name))
    assert seen == {
        pkg.RULE_ASCIIDOC_ONLY,
        pkg.RULE_IDENTITY_REQUIRED,
        pkg.RULE_DOC_ID_UNIQUE,
        pkg.RULE_GRAPH_TARGET_RESOLVES,
        pkg.RULE_AREA_INDEX_REQUIRED,
        pkg.RULE_ADR_REGISTRY_DERIVED,
    }


# ── 1d. THE #1758 REGRESSION — reported, and NO node fabricated ───────────────


def test_unresolved_target_is_reported_and_fires_only_its_own_rule() -> None:
    v = capability.scan_root(_FIXTURES / "dirty_unresolved_edge")
    assert _rule_ids(v) == {pkg.RULE_GRAPH_TARGET_RESOLVES}
    assert len(v) == 1
    assert "purpose.wortrees" in v[0]["evidence"]
    assert v[0]["file"] == "docs/architecture/shared-control-root.adoc"


def test_unresolved_target_fabricates_no_node() -> None:
    """#1758, asserted on the NODE COUNT directly — not merely on the finding.

    A fabricated parent makes a node look CONNECTED, which defeats an orphan check
    more thoroughly than absence does. Asserting only that a finding was produced
    would not catch a resolver that reported AND synthesized.
    """
    documents = corpus.read_corpus(_FIXTURES / "dirty_unresolved_edge")
    declared = graph.declared_ids(documents)
    g = graph.resolve(documents)

    assert set(g.nodes) == set(declared)
    assert len(g.nodes) == len(declared)
    assert "purpose.wortrees" not in g.nodes
    # The edge does not exist either: nothing points at the invented target.
    assert all(e.target != "purpose.wortrees" for e in g.edges)
    # And it is not silence.
    assert [u.target for u in g.unresolved] == ["purpose.wortrees"]


def test_resolver_never_grows_the_node_set_for_any_fixture() -> None:
    """The invariant, over every fixture: nodes are exactly the declared ids."""
    for tree in sorted(p for p in _FIXTURES.iterdir() if p.is_dir()):
        documents = corpus.read_corpus(tree)
        g = graph.resolve(documents)
        assert set(g.nodes) == set(graph.declared_ids(documents)), tree.name


# ── 1e. the ADR registry is DERIVED ───────────────────────────────────────────


def test_registry_is_projected_from_decides_edges_with_no_hand_edit() -> None:
    clean = corpus.read_corpus(_FIXTURES / "clean")
    assert adr.derive_registry(clean) == ("ADR-20260906-001",)
    assert adr.registry_violations(clean) == []

    # Adding an ADR with a :decides: edge changes the projection immediately.
    drifted = corpus.read_corpus(_FIXTURES / "dirty_adr_registry")
    assert adr.derive_registry(drifted) == ("ADR-20260906-001", "ADR-20260906-002")
    assert adr.registry_violations(drifted) != []


def test_a_stale_registry_entry_is_reported_as_well_as_a_missing_one() -> None:
    """The direction that survives review: a list that names something is read as
    authoritative about it."""
    documents = corpus.read_corpus(_FIXTURES / "clean")
    registry = next(d for d in documents if d.path == adr.REGISTRY_PATH)
    haunted = corpus.Document(
        path=registry.path,
        text=registry.text + "\n* ADR-20260906-404 — deleted long ago\n",
        attributes=registry.attributes,
        attribute_lines=registry.attribute_lines,
    )
    others = [d for d in documents if d.path != adr.REGISTRY_PATH]
    findings = adr.registry_violations([*others, haunted])
    assert len(findings) == 1
    assert "ADR-20260906-404" in findings[0]["evidence"]


# ── 1f. the declaration rules ─────────────────────────────────────────────────


def test_declared_path_must_be_adoc_inside_the_canonical_tree() -> None:
    findings = declaration.artifact_path_violations(
        {"impact": "change", "artifacts": [
            {"action": "create", "path": "notes/design.adoc"},   # outside docs/
            {"action": "create", "path": "docs/design.md"},      # not AsciiDoc
            {"action": "create", "path": "docs/design.adoc"},    # fine
        ]}
    )
    assert _rule_ids(findings) == {pkg.RULE_ARTIFACT_PATH_SHAPE}
    assert len(findings) == 2
    assert "outside the canonical tree" in findings[0]["evidence"]
    assert "not AsciiDoc" in findings[1]["evidence"]


def test_archive_destination_outside_archive_is_rejected() -> None:
    """The load-bearing half: this is how history quietly gets promoted."""
    findings = declaration.artifact_path_violations(
        {"impact": "change", "artifacts": [
            {"action": "archive", "from": "docs/old-spec.md", "path": "docs/architecture/old-spec.adoc"},
        ]}
    )
    assert len(findings) == 1
    assert "archive destination" in findings[0]["evidence"]

    ok = declaration.artifact_path_violations(
        {"impact": "change", "artifacts": [
            {"action": "archive", "from": "docs/old-spec.md", "path": "docs/archive/old-spec.adoc"},
        ]}
    )
    assert ok == []


def test_impact_none_declares_no_artifacts_and_is_not_path_checked() -> None:
    assert declaration.artifact_path_violations({"impact": "none", "reason": "already accepted"}) == []


def test_undeclared_docs_change_is_reported() -> None:
    decl = {"impact": "change", "artifacts": [{"action": "modify", "path": "docs/delivery/index.adoc"}]}
    findings = declaration.undeclared_change_violations(
        decl, ["docs/delivery/index.adoc", "docs/architecture/surprise.adoc", "src/atdd/app.py"]
    )
    assert _rule_ids(findings) == {pkg.RULE_UNDECLARED_CHANGE}
    assert [f["file"] for f in findings] == ["docs/architecture/surprise.adoc"]


def test_generated_output_and_non_docs_paths_are_never_undeclared_changes() -> None:
    decl = {"impact": "change", "artifacts": [{"action": "modify", "path": "docs/index.adoc"}]}
    assert declaration.undeclared_change_violations(
        decl, ["docs/dist/index.html", "README.md", "src/app.py"]
    ) == []


def test_a_deletion_under_docs_is_a_documentation_change() -> None:
    decl = {"impact": "change", "artifacts": [{"action": "modify", "path": "docs/index.adoc"}]}
    findings = declaration.undeclared_change_violations(decl, ["docs/architecture/removed.adoc"])
    assert [f["file"] for f in findings] == ["docs/architecture/removed.adoc"]


def test_an_archive_from_path_is_covered_without_being_adoc() -> None:
    decl = {"impact": "change", "artifacts": [
        {"action": "archive", "from": "docs/old-spec.md", "path": "docs/archive/old-spec.adoc"},
    ]}
    assert declaration.undeclared_change_violations(
        decl, ["docs/old-spec.md", "docs/archive/old-spec.adoc"]
    ) == []


# ── 1g. THE VERDICT CONTRACT (spec 2 §3) ──────────────────────────────────────


def test_absent_declaration_is_not_applicable_and_permits() -> None:
    check = capability.StandardDocumentationCapability().check(None, [], _FIXTURES / "clean")
    assert check.verdict == verdict.NOT_APPLICABLE
    assert verdict.blocks(check.verdict) is False


def test_impact_none_is_not_applicable_and_permits() -> None:
    check = capability.StandardDocumentationCapability().check(
        {"impact": "none", "reason": "no change to accepted truth"}, [], _FIXTURES / "clean"
    )
    assert check.verdict == verdict.NOT_APPLICABLE
    assert verdict.blocks(check.verdict) is False


def test_absent_asciidoctor_is_could_not_check_never_pass_and_never_fail(monkeypatch) -> None:
    """The rule this extension is most likely to get wrong, so it is tested directly."""
    monkeypatch.setattr(render.shutil, "which", lambda name: None)
    outcome = render.render(_FIXTURES / "clean")
    assert outcome.could_not_check is True
    assert render.TOOLCHAIN in (outcome.unattributable or "")

    check = capability.StandardDocumentationCapability().check(
        {"impact": "change", "artifacts": [{"action": "modify", "path": "docs/index.adoc"}]},
        ["docs/index.adoc"],
        _FIXTURES / "clean",
    )
    assert check.verdict == verdict.COULD_NOT_CHECK
    assert check.verdict != verdict.PASS
    assert check.verdict != verdict.FAIL
    # It BLOCKS, and the reason reaches the report rather than collapsing into a clean result.
    assert verdict.blocks(check.verdict) is True
    assert any(render.TOOLCHAIN in f.message for f in check.findings)


def test_not_applicable_and_could_not_check_never_collapse() -> None:
    assert verdict.NOT_APPLICABLE in verdict.PERMITTING
    assert verdict.COULD_NOT_CHECK in verdict.BLOCKING
    assert verdict.blocks(verdict.NOT_APPLICABLE) is False
    assert verdict.blocks(verdict.COULD_NOT_CHECK) is True
    # An unknown verdict blocks. Guessing that it permits is the #1745 defect.
    assert verdict.blocks("SOMETHING_NEW") is True


def test_unattributable_render_failure_is_could_not_check_not_fail() -> None:
    findings, noise = render.parse_diagnostics(
        "asciidoctor: FAILED: cannot load such file -- asciidoctor/converter", _FIXTURES / "clean"
    )
    assert findings == []
    assert noise  # surfaced, never dropped


def test_unresolvable_reference_is_attributable_and_fails(monkeypatch) -> None:
    stderr = "asciidoctor: WARNING: shared-control-root.adoc: line 12: invalid reference: purpose.wortrees"
    monkeypatch.setattr(
        render, "render",
        lambda repo_root: render.RenderOutcome(
            findings=render.parse_diagnostics(stderr, repo_root)[0]
        ),
    )
    check = capability.StandardDocumentationCapability().check(
        {"impact": "change", "artifacts": [{"action": "modify", "path": "docs/index.adoc"}]},
        ["docs/index.adoc"],
        _FIXTURES / "clean",
    )
    assert check.verdict == verdict.FAIL
    assert any(f.rule_id == pkg.RULE_REFERENCE_INTEGRITY for f in check.findings)
    assert any("invalid reference" in f.message for f in check.findings)


def test_a_raising_capability_is_fail_never_pass(monkeypatch) -> None:
    def boom(repo_root):
        raise RuntimeError("resolver exploded")

    monkeypatch.setattr(capability, "corpus_violations", boom)
    check = capability.StandardDocumentationCapability().check(
        {"impact": "change", "artifacts": [{"action": "modify", "path": "docs/index.adoc"}]},
        ["docs/index.adoc"],
        _FIXTURES / "clean",
    )
    assert check.verdict == verdict.FAIL
    assert "RuntimeError" in check.findings[0].message


# ── 1h. END-TO-END with the extension installed (closes #1709 for this seam) ───


def test_complete_passes_when_the_documentation_obligation_is_discharged(monkeypatch) -> None:
    _clean_render(monkeypatch)
    check = capability.StandardDocumentationCapability().check(
        {"impact": "change", "artifacts": [
            {"action": "modify", "path": "docs/architecture/shared-control-root.adoc"},
        ]},
        ["docs/architecture/shared-control-root.adoc", "src/atdd/control_root.py"],
        _FIXTURES / "clean",
    )
    assert check.verdict == verdict.PASS
    assert check.findings == []
    # PASS only when the declared artifacts were ACTUALLY examined, and `checked` names them.
    assert "docs/architecture/shared-control-root.adoc" in check.checked
    assert verdict.blocks(check.verdict) is False


def test_complete_blocks_when_the_documentation_was_omitted(monkeypatch) -> None:
    """The same flow with docs authored but never declared."""
    _clean_render(monkeypatch)
    check = capability.StandardDocumentationCapability().check(
        {"impact": "change", "artifacts": [{"action": "modify", "path": "docs/index.adoc"}]},
        ["docs/index.adoc", "docs/architecture/shared-control-root.adoc"],
        _FIXTURES / "clean",
    )
    assert check.verdict == verdict.FAIL
    assert verdict.blocks(check.verdict) is True
    assert any(f.rule_id == pkg.RULE_UNDECLARED_CHANGE for f in check.findings)


def test_corpus_violations_reach_the_verdict(monkeypatch) -> None:
    _clean_render(monkeypatch)
    check = capability.StandardDocumentationCapability().check(
        {"impact": "change", "artifacts": [
            {"action": "modify", "path": "docs/architecture/shared-control-root.adoc"},
        ]},
        ["docs/architecture/shared-control-root.adoc"],
        _FIXTURES / "dirty_unresolved_edge",
    )
    assert check.verdict == verdict.FAIL
    assert any(f.rule_id == pkg.RULE_GRAPH_TARGET_RESOLVES for f in check.findings)


def test_every_declared_rule_id_is_emittable() -> None:
    """`rule_ids` is the capability's own account of what silence means."""
    assert set(capability.StandardDocumentationCapability.rule_ids) == set(pkg.ALL_RULE_IDS)
    assert len(pkg.ALL_RULE_IDS) == 9


# ── 2. emission (writes the RAW report; does NOT decide disposition) ──────────


def _scan_roots() -> list[Path]:
    raw = os.environ.get(ENV_SCAN_ROOTS)
    if raw:
        try:
            names = json.loads(raw)
        except json.JSONDecodeError:
            names = []
    else:
        names = [str(_FIXTURES / "clean")]
    roots: list[Path] = []
    for n in names:
        p = Path(n)
        roots.append(p if p.is_absolute() else (_HERE / p))
    return roots


def test_emit_raw_documentation_report() -> None:
    """Scan the supplied roots and emit the RAW violation report (NOT a verdict)."""
    roots = _scan_roots()
    violations = capability.scan_roots(roots)

    report_path = os.environ.get(ENV_REPORT)
    if report_path:
        payload = {
            "contract_version": CONTRACT_VERSION,
            "scan_roots": [str(r) for r in roots],
            "violations": violations,
        }
        Path(report_path).write_text(json.dumps(payload, indent=2), encoding="utf-8")

    # Run-health only: deliberately NOT gated on emptiness (disposition is the gate's).
    assert isinstance(violations, list)
