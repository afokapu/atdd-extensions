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


def test_absent_declaration_blocks(monkeypatch) -> None:
    """This test previously asserted NOT_APPLICABLE, encoding the defect as intent.

    An absent declaration is not `impact: none`. The corrected expectation lives in
    full in test_absent_declaration_is_could_not_check_not_not_applicable below; this
    one is kept, pointed the right way, because a test that once locked in a
    fail-open is worth leaving visible rather than deleting.
    """
    _clean_render(monkeypatch)
    check = capability.StandardDocumentationCapability().check(None, [], _FIXTURES / "clean")
    assert check.verdict == verdict.COULD_NOT_CHECK
    assert verdict.blocks(check.verdict) is True


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
    def boom(repo_root, documents=None):
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


# ── 3. REGRESSIONS from the code review of 511a107..d8963c0 ───────────────────


def test_dirty_missing_index_fixture_is_tracked_not_an_empty_directory() -> None:
    """The fixture's defect must survive a fresh clone.

    Expressing "the area exists but has no index" as an EMPTY directory made the
    defect invisible to git: the fixture arrived empty on clone, the rule never
    fired, and `area-index-required` was the one rule with no live proof in CI. A
    fixture that only works on the machine that authored it proves nothing.
    """
    delivery = _FIXTURES / "dirty_missing_index" / "docs" / "delivery"
    tracked = [p for p in delivery.iterdir() if p.is_file()]
    assert tracked, "fixture directory must hold a tracked file, not be empty"
    assert not (delivery / "index.adoc").exists(), "the missing index IS the defect"


def test_unrecognised_impact_never_switches_off_the_path_checks() -> None:
    """A typo in `impact` must not disable the archive-destination rule.

    Gating the path checks on `impact == "change"` meant a missing or misspelled
    impact returned [] before inspecting a single path — so a malformed declaration
    turned off the one check this module calls load-bearing, instead of tripping it.
    """
    escaping_archive = {
        "impact": "changes",  # typo
        "artifacts": [{"action": "archive", "path": "docs/architecture/x.adoc"}],
    }
    paths = declaration.artifact_path_violations(escaping_archive)
    assert _rule_ids(paths) == {pkg.RULE_ARTIFACT_PATH_SHAPE}
    assert any("archive destination" in v["evidence"] for v in paths)

    no_impact_key = {"artifacts": [{"action": "create", "path": "/etc/passwd"}]}
    assert declaration.artifact_path_violations(no_impact_key), "path outside docs/ must be reported"

    # And the malformedness itself is reported, never read as nothing-to-check.
    assert declaration.impact_violations(escaping_archive)
    assert declaration.impact_violations(no_impact_key)


def test_a_well_formed_declaration_reports_no_impact_violation() -> None:
    assert declaration.impact_violations({"impact": "none", "reason": "already accepted"}) == []
    assert declaration.impact_violations(
        {"impact": "change", "artifacts": [{"action": "modify", "path": "docs/index.adoc"}]}
    ) == []
    assert declaration.impact_violations(None) == []


def test_malformed_impact_reaches_the_verdict(monkeypatch) -> None:
    _clean_render(monkeypatch)
    check = capability.StandardDocumentationCapability().check(
        {"impact": "changes", "artifacts": [{"action": "modify", "path": "docs/index.adoc"}]},
        ["docs/index.adoc"],
        _FIXTURES / "clean",
    )
    assert check.verdict == verdict.FAIL
    assert any("total forms" in f.message for f in check.findings)


# ── 4. the nine remaining findings from the same review ───────────────────────


def test_body_text_before_any_attribute_ends_the_header() -> None:
    """A doc-id quoted in a code sample must never become the document's identity.

    The guard only fired once an attribute had been seen, so a document with prose
    first adopted an id from a later code block — inventing a duplicate against the
    real owner and suppressing its own identity-required finding.
    """
    text = "= Title\n\nSome prose first.\n\n----\n:doc-id: purpose.worktrees\n:status: current\n----\n"
    attributes, _ = corpus.parse_attributes(text)
    assert attributes.get("doc-id") in (None, ""), attributes


def test_renderer_diagnostics_are_attributed_by_path_not_basename() -> None:
    """Six files are called index.adoc; a glob sent authors to the wrong one."""
    clean = _FIXTURES / "clean"
    target = clean / "docs/purpose/index.adoc"
    stderr = f"asciidoctor: WARNING: {target}: line 3: invalid reference: x"
    findings, _ = render.parse_diagnostics(stderr, clean)
    assert [f["file"] for f in findings] == ["docs/purpose/index.adoc"]


def test_a_located_warning_without_a_line_number_is_still_attributable() -> None:
    stderr = "asciidoctor: WARNING: shared-control-root.adoc: section title out of sequence"
    findings, noise = render.parse_diagnostics(stderr, _FIXTURES / "clean")
    assert noise == []
    assert len(findings) == 1
    assert findings[0]["file"].endswith("shared-control-root.adoc")
    assert findings[0]["line"] == 1


def test_unattributable_output_survives_alongside_a_located_finding() -> None:
    """A load failure means most of the corpus was never validated.

    It used to be discarded the moment one located warning existed, so the verdict
    was FAIL on the warning and the far worse fact never reached the report.
    """
    clean = _FIXTURES / "clean"
    stderr = (
        "asciidoctor: FAILED: cannot load such file -- asciidoctor/converter\n"
        f"asciidoctor: WARNING: {clean / 'docs/index.adoc'}: line 2: invalid reference: y"
    )
    findings, noise = render.parse_diagnostics(stderr, clean)
    assert findings and noise, "both must survive"
    assert any("cannot load such file" in n for n in noise)


def test_an_adr_with_no_adr_id_is_reported_not_invisible() -> None:
    documents = corpus.read_corpus(_FIXTURES / "clean")
    orphan = corpus.Document(
        path=f"{adr.DECISIONS_DIR}/adr-20260906-004-state-store.adoc",
        text="= ADR\n:doc-id: architecture.decisions.adr-004\n:status: current\n:decides: architecture.state-store\n",
        attributes={"doc-id": "architecture.decisions.adr-004", "status": "current",
                    "decides": "architecture.state-store"},
        attribute_lines={},
    )
    findings = adr.registry_violations([*documents, orphan])
    assert any("declares no :adr-id:" in f["evidence"] for f in findings)


def test_registry_own_adr_id_never_erases_a_real_entry() -> None:
    documents = corpus.read_corpus(_FIXTURES / "clean")
    registry = next(d for d in documents if d.path == adr.REGISTRY_PATH)
    # The registry declares the SAME id as a genuine ADR.
    colliding = corpus.Document(
        path=registry.path, text=registry.text,
        attributes={**registry.attributes, "adr-id": "ADR-20260906-001"},
        attribute_lines=registry.attribute_lines,
    )
    others = [d for d in documents if d.path != adr.REGISTRY_PATH]
    findings = adr.registry_violations([*others, colliding])
    assert not any("missing from the registry" in f["evidence"] for f in findings), (
        "a listed ADR was reported missing; editing the registry would not have helped"
    )


def test_a_declared_artifact_that_was_never_written_blocks(monkeypatch) -> None:
    _clean_render(monkeypatch)
    check = capability.StandardDocumentationCapability().check(
        {"impact": "change", "artifacts": [
            {"action": "create", "path": "docs/purpose/never-written.adoc"},
        ]},
        ["docs/purpose/never-written.adoc"],
        _FIXTURES / "clean",
    )
    assert check.verdict == verdict.FAIL
    assert any("never written" in f.message for f in check.findings)


def test_render_does_not_write_into_the_tree_it_validates() -> None:
    """A validation call must leave the worktree clean."""
    clean = _FIXTURES / "clean"
    before = {p.relative_to(clean).as_posix() for p in clean.rglob("*") if p.is_file()}
    render.render(clean)  # asciidoctor may be absent; either way it must not write
    after = {p.relative_to(clean).as_posix() for p in clean.rglob("*") if p.is_file()}
    assert before == after, f"render wrote into the corpus: {sorted(after - before)}"


def test_the_corpus_is_read_once_per_check(monkeypatch) -> None:
    """`checked` and `findings` must describe the same tree."""
    _clean_render(monkeypatch)
    calls = []
    real = corpus.read_corpus
    monkeypatch.setattr(corpus, "read_corpus", lambda root: (calls.append(root), real(root))[1])
    capability.StandardDocumentationCapability().check(
        {"impact": "change", "artifacts": [{"action": "modify", "path": "docs/index.adoc"}]},
        ["docs/index.adoc"],
        _FIXTURES / "clean",
    )
    assert len(calls) == 1, f"corpus read {len(calls)} times"


# ── 5. an absent change set is not an empty one ───────────────────────────────


def test_absent_change_set_is_could_not_check_not_pass(monkeypatch) -> None:
    """`None` from core and `[]` from core are different facts.

    `list(change_set or [])` collapsed them, so undeclared_change_violations found
    nothing and the run reached PASS — the capability claiming "nothing undeclared"
    while having been told nothing at all. That is the same fail-open shape this
    extension exists to refuse, one line above the fix for it.
    """
    _clean_render(monkeypatch)
    decl = {"impact": "change", "artifacts": [{"action": "modify", "path": "docs/index.adoc"}]}
    check = capability.StandardDocumentationCapability().check(decl, None, _FIXTURES / "clean")
    assert check.verdict == verdict.COULD_NOT_CHECK
    assert verdict.blocks(check.verdict) is True
    assert any("no change set" in f.message for f in check.findings)


def test_an_empty_change_set_remains_a_legitimate_pass(monkeypatch) -> None:
    """[] is core saying "nothing changed", which this capability can act on.

    Whether the DECLARED paths appear in an empty diff is core's check 4, not this
    capability's — so an empty change set must stay distinct from an absent one and
    must not be dragged down with it.
    """
    _clean_render(monkeypatch)
    decl = {"impact": "change", "artifacts": [{"action": "modify", "path": "docs/index.adoc"}]}
    check = capability.StandardDocumentationCapability().check(decl, [], _FIXTURES / "clean")
    assert check.verdict == verdict.PASS
    assert verdict.blocks(check.verdict) is False


def test_a_definite_violation_still_outranks_an_absent_change_set(monkeypatch) -> None:
    """Precedence holds: FAIL is the more actionable answer, and both block."""
    _clean_render(monkeypatch)
    decl = {"impact": "change", "artifacts": [{"action": "create", "path": "docs/never-written.adoc"}]}
    check = capability.StandardDocumentationCapability().check(decl, None, _FIXTURES / "clean")
    assert check.verdict == verdict.FAIL
    # The could-not-check reason still reaches the report rather than being swallowed.
    assert any("no change set" in f.message for f in check.findings)


def test_no_obligation_outranks_an_absent_change_set(monkeypatch) -> None:
    """`impact: none` needs no diff, so not having one changes nothing."""
    _clean_render(monkeypatch)
    check = capability.StandardDocumentationCapability().check(
        {"impact": "none", "reason": "no change to accepted truth"}, None, _FIXTURES / "clean"
    )
    assert check.verdict == verdict.NOT_APPLICABLE


# ── 6. an absent declaration is not `impact: none` ────────────────────────────


def test_absent_declaration_is_could_not_check_not_not_applicable(monkeypatch) -> None:
    """The symmetric defect to the absent change set, one argument over.

    `impact: none` is core CONSIDERING the question and declaring no change.
    `None` is core having told this capability nothing. Both permitted, and the
    branch returned before reading the corpus at all.
    """
    _clean_render(monkeypatch)
    check = capability.StandardDocumentationCapability().check(None, ["docs/index.adoc"], _FIXTURES / "clean")
    assert check.verdict == verdict.COULD_NOT_CHECK
    assert verdict.blocks(check.verdict) is True
    assert any("no documentation declaration" in f.message for f in check.findings)


def test_impact_none_remains_not_applicable_and_permits(monkeypatch) -> None:
    """No over-correction: the positive declaration still permits."""
    _clean_render(monkeypatch)
    check = capability.StandardDocumentationCapability().check(
        {"impact": "none", "reason": "no change to accepted truth"}, ["docs/index.adoc"], _FIXTURES / "clean"
    )
    assert check.verdict == verdict.NOT_APPLICABLE
    assert verdict.blocks(check.verdict) is False


def test_an_absent_declaration_still_examines_the_corpus(monkeypatch) -> None:
    """"Genuinely nothing to check" was false twice over.

    There WAS a corpus to check, and the old branch returned zero findings over zero
    documents against a tree with a known unresolved relationship target.
    """
    _clean_render(monkeypatch)
    check = capability.StandardDocumentationCapability().check(
        None, [], _FIXTURES / "dirty_unresolved_edge"
    )
    assert check.checked, "the corpus was never examined"
    assert any(f.rule_id == pkg.RULE_GRAPH_TARGET_RESOLVES for f in check.findings)
    # A definite corpus violation outranks the could-not-check, and both block.
    assert check.verdict == verdict.FAIL
    assert any("no documentation declaration" in f.message for f in check.findings)


def test_absent_declaration_does_not_run_declaration_rules_against_nothing(monkeypatch) -> None:
    """Skipped, not run against a fabricated empty declaration."""
    _clean_render(monkeypatch)
    check = capability.StandardDocumentationCapability().check(None, ["docs/surprise.adoc"], _FIXTURES / "clean")
    # `docs/surprise.adoc` is undeclared, but with no declaration that is not a
    # claim this capability can make — it must not report undeclared-change.
    assert not any(f.rule_id == pkg.RULE_UNDECLARED_CHANGE for f in check.findings)


def test_checked_never_claims_a_declaration_that_was_not_supplied(monkeypatch) -> None:
    """`checked` is the account of what was actually examined, and PASS rests on it."""
    _clean_render(monkeypatch)
    absent = capability.StandardDocumentationCapability().check(None, [], _FIXTURES / "clean")
    assert "<declaration>" not in absent.checked
    assert absent.checked, "the corpus was still examined and must still be listed"

    present = capability.StandardDocumentationCapability().check(
        {"impact": "change", "artifacts": [{"action": "modify", "path": "docs/index.adoc"}]},
        ["docs/index.adoc"], _FIXTURES / "clean",
    )
    assert "<declaration>" in present.checked


def test_seam_findings_are_not_filed_under_a_content_rule(monkeypatch) -> None:
    """"Core told me nothing" is not a violation of any convention node.

    Filing it under `planner.docs.undeclared-change` or `artifact-path-shape` tells a
    consumer filtering by rule_id that a content rule was violated when it was not.
    """
    _clean_render(monkeypatch)
    for declaration, change_set in [(None, []), ({"impact": "change", "artifacts": []}, None)]:
        check = capability.StandardDocumentationCapability().check(
            declaration, change_set, _FIXTURES / "clean"
        )
        seam = [f for f in check.findings if f.where in ("<declaration>", "<change_set>")]
        assert seam, "expected a seam finding"
        for f in seam:
            assert f.rule_id == capability.SEAM_RULE_ID
            assert f.rule_id not in pkg.ALL_RULE_IDS, "a seam fact must not claim a convention node"
