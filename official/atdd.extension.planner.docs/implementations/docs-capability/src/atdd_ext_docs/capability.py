"""The DocumentationCapability core discovers over the `atdd.documentation` entry
point (spec 2 §3 / companion §5 — THE BINDING).

    class DocumentationCapability(Protocol):
        def check(
            self,
            declaration: DocumentationDeclaration,  # as stored by core
            change_set: ChangeSet,                  # paths added/modified/deleted
            repo_root: Path,
        ) -> DocumentationCheck: ...

Core passes the declaration and the change set. Core reads back a verdict and
findings. CORE INTERPRETS NOTHING ELSE.

TWO SURFACES, ONE DETECTOR. `check` is the core seam. `scan_root` is the hub's
report channel, used by the gate to emit RAW violations in the v1.1 output contract.
They share every detector, so the gate and the capability can never disagree about
what the corpus contains.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from . import ALL_RULE_IDS
from . import adr, corpus, declaration as declaration_rules, graph as graph_rules, render, verdict


@dataclass(frozen=True)
class Finding:
    """Human-readable, and it always names a path or a doc id (spec 2 §3)."""

    rule_id: str
    where: str
    message: str

    def __str__(self) -> str:  # what reaches a report line
        return f"{self.where}: {self.message} [{self.rule_id}]"


@dataclass(frozen=True)
class DocumentationCheck:
    """The value core reads back. Shape is fixed by THE BINDING."""

    verdict: str
    findings: list[Finding] = field(default_factory=list)
    checked: list[str] = field(default_factory=list)


def _finding(violation: dict) -> Finding:
    return Finding(
        rule_id=violation["rule_id"],
        where=violation.get("file", "<unknown>"),
        message=violation.get("evidence", ""),
    )


def declared_artifact_violations(declaration: dict | None, repo_root: Path) -> list[dict]:
    """A declared `create`/`modify` artifact that is not in the tree.

    PASS means "the declared artifacts were examined" (spec 2 §3). Without this an
    author could declare a document at RATIFY, never write it, and have COMPLETE
    permit — which is the obligation this capability exists to enforce.
    """
    if not declaration_rules.declares_change(declaration):
        return []
    out: list[dict] = []
    for artifact in declaration.get("artifacts") or []:
        if not isinstance(artifact, dict):
            continue
        if artifact.get("action") not in ("create", "modify"):
            continue  # an archive names a destination the migration writes
        path = artifact.get("path")
        if not isinstance(path, str) or not path:
            continue  # shape is artifact_path_violations' business
        if (repo_root / path).is_file():
            continue
        out.append({
            "rule_id": "planner.docs.artifact-path-shape",
            "file": path,
            "line": 1,
            "col": 1,
            "evidence": (
                f"declared artifact {path!r} (action: {artifact.get('action')}) is not in the "
                f"tree, so it was never examined; a declared document that was never written "
                f"has not discharged the obligation."
            ),
            "source_line": "",
        })
    return out


def corpus_violations(repo_root: Path, documents: list[corpus.Document] | None = None) -> list[dict]:
    """Every corpus rule, in dependency order (relationships.yaml records why).

    Identity before uniqueness before edge resolution: a resolver that ran first
    would have to invent the id set it resolves against, which is #1758 arrived at
    by a different route.
    """
    if documents is None:
        documents = corpus.read_corpus(repo_root)
    documentation_graph = graph_rules.resolve(documents)
    return [
        *corpus.asciidoc_only_violations(repo_root),
        *corpus.identity_violations(documents),
        *corpus.duplicate_doc_id_violations(documents),
        *graph_rules.unresolved_target_violations(documents, documentation_graph),
        *corpus.area_index_violations(repo_root),
        *adr.registry_violations(documents),
    ]


def scan_root(root: Path) -> list[dict]:
    """RAW violations for one consumer tree — the gate's report channel.

    Corpus rules only. The declaration rules need a declaration and a change set,
    which exist at the capability seam and not in a filesystem scan.
    """
    return corpus_violations(Path(root))


def scan_roots(roots: list[Path]) -> list[dict]:
    out: list[dict] = []
    for root in roots:
        out.extend(scan_root(root))
    return out


class StandardDocumentationCapability:
    """The one capability this extension ships.

    Verdict precedence, stated explicitly because getting it wrong is the failure
    spec 2 §3 spends its length on:

      1. The capability's own crash or timeout            -> FAIL   (blocks)
      2. Definite violations found                        -> FAIL   (blocks)
      3. Something could not be examined                  -> COULD_NOT_CHECK (blocks)
      4. Genuinely nothing to check                       -> NOT_APPLICABLE (permits)
      5. Declared artifacts actually examined, all clean  -> PASS   (permits)

    FAIL outranks COULD_NOT_CHECK only because "declared and demonstrably not
    discharged" is definite knowledge and is the more actionable answer; both block,
    so the ordering costs no safety. THE COULD-NOT-CHECK REASON REACHES `findings`
    EITHER WAY — an unresolvable lookup stays DATA and never becomes an empty clean
    result.
    """

    #: Every rule id this capability can emit. Declared so a caller can tell what
    #: silence means: absence of a rule id here is out of scope, not a pass.
    rule_ids = ALL_RULE_IDS

    def check(
        self,
        declaration: dict | None,
        change_set: list[str] | None,
        repo_root: Path | str,
    ) -> DocumentationCheck:
        try:
            return self._check(declaration, list(change_set or []), Path(repo_root))
        except Exception as exc:  # noqa: BLE001 — a raising capability is a FAIL, never a pass
            return DocumentationCheck(
                verdict=verdict.FAIL,
                findings=[
                    Finding(
                        rule_id="planner.docs.capability",
                        where=str(repo_root),
                        message=f"the documentation capability raised {type(exc).__name__}: {exc}. "
                                f"A capability that crashes has not discharged the obligation.",
                    )
                ],
                checked=[],
            )

    def _check(
        self, declaration: dict | None, change_set: list[str], repo_root: Path
    ) -> DocumentationCheck:
        # (4) Nothing to check. Core enforces that `impact: none` carries a reason
        # (companion §4); core does not judge the reason's quality, and neither do we.
        if declaration is None or declaration.get("impact") == "none":
            return DocumentationCheck(
                verdict=verdict.NOT_APPLICABLE,
                findings=[],
                checked=[],
            )

        # Read the corpus ONCE. Reading it again for `checked` meant the two could
        # describe different trees, so findings and the list of what was examined
        # could disagree.
        documents = corpus.read_corpus(repo_root)
        violations = corpus_violations(repo_root, documents)
        violations += declaration_rules.impact_violations(declaration)
        violations += declaration_rules.artifact_path_violations(declaration)
        violations += declaration_rules.undeclared_change_violations(declaration, change_set)
        violations += declared_artifact_violations(declaration, repo_root)

        checked = [d.path for d in documents]
        checked.append("<declaration>")

        findings = [_finding(v) for v in violations]

        outcome = render.render(repo_root)
        if outcome.could_not_check:
            findings.append(
                Finding(
                    rule_id="planner.docs.reference-integrity",
                    where=f"{corpus.DOCS_DIR}/",
                    message=outcome.unattributable or "",
                )
            )
        else:
            checked.append(f"<render:{render.TOOLCHAIN}>")
            findings.extend(_finding(v) for v in outcome.findings)
            violations.extend(outcome.findings)

        # (2) then (3): definite failure outranks an unexamined surface; both block.
        if violations:
            return DocumentationCheck(verdict=verdict.FAIL, findings=findings, checked=checked)
        if outcome.could_not_check:
            return DocumentationCheck(
                verdict=verdict.COULD_NOT_CHECK, findings=findings, checked=checked
            )
        # (5) PASS only when the declared artifacts were actually examined.
        return DocumentationCheck(verdict=verdict.PASS, findings=findings, checked=checked)
