"""The declaration half: artifact path shape, and the undeclared-change inverse.

Core stores declared paths as OPAQUE STRINGS and never interprets them (companion
§3). Core checks that every declared path appears in the change set (companion §4,
check 4) — path-agnostic and format-agnostic, non-vacuous with no extension
installed. Interpreting the paths is this extension's job, because only the
extension knows the tree, and companion §8's anti-theatre test greps core for
`docs/`, `adoc` and friends expecting zero hits.

The two rules here are the two directions of one question:

    artifact-path-shape   is a declared path SHAPED like documentation?
    undeclared-change     was a documentation change DECLARED at all?

Detecting that a change *should have been* declared is semantic and not
deterministically decidable. The deterministic INVERSE is enforceable, and it
catches the same class of drift from the other side (spec 2 §4).
"""
from __future__ import annotations

from . import RULE_ARTIFACT_PATH_SHAPE, RULE_UNDECLARED_CHANGE
from .corpus import ARCHIVE_PREFIX, DOCS_DIR, is_generated

DOCS_PREFIX = DOCS_DIR + "/"
ADOC_SUFFIX = ".adoc"
ARCHIVE_ACTION = "archive"


def _artifacts(declaration: dict | None) -> list[dict]:
    if not isinstance(declaration, dict):
        return []
    artifacts = declaration.get("artifacts")
    return [a for a in artifacts if isinstance(a, dict)] if isinstance(artifacts, list) else []


def declares_change(declaration: dict | None) -> bool:
    """True when the declaration is the `impact: change` form."""
    return isinstance(declaration, dict) and declaration.get("impact") == "change"


def artifact_path_violations(declaration: dict | None) -> list[dict]:
    """A declared artifact whose path is not shaped like documentation.

    `impact: none` declares no artifacts and is not checked here. Core enforces that
    a reason is present; core does not judge the reason's quality, and neither does
    this extension.
    """
    if not declares_change(declaration):
        return []
    out: list[dict] = []
    for index, artifact in enumerate(_artifacts(declaration)):
        action = str(artifact.get("action", ""))
        path = str(artifact.get("path", ""))
        problems: list[str] = []
        if not path:
            problems.append("declares no path")
        else:
            if not path.startswith(DOCS_PREFIX):
                problems.append(f"path {path!r} is outside the canonical tree (must begin {DOCS_PREFIX!r})")
            if not path.endswith(ADOC_SUFFIX):
                problems.append(f"path {path!r} is not AsciiDoc (must end {ADOC_SUFFIX!r})")
            if action == ARCHIVE_ACTION and not path.startswith(ARCHIVE_PREFIX):
                # The load-bearing half: this is how history quietly gets promoted
                # into current truth (spec 2 §2, Out of scope).
                problems.append(
                    f"archive destination {path!r} is outside {ARCHIVE_PREFIX!r} — archiving must "
                    f"preserve history, never promote it into a current area"
                )
        if not problems:
            continue
        out.append(
            {
                "rule_id": RULE_ARTIFACT_PATH_SHAPE,
                "file": path or "<declaration>",
                "line": 1,
                "col": 1,
                "evidence": f"declared artifact[{index}] (action: {action or 'unset'}): "
                            + "; ".join(problems),
                "source_line": "",
            }
        )
    return out


def declared_paths(declaration: dict | None) -> set[str]:
    """Every path a declaration covers: each artifact `path`, plus an archive `from`.

    The `from` of an archive artifact names the legacy document being retired — the
    markdown the migration is converting — so it is covered but is NOT required to
    end `.adoc`.
    """
    covered: set[str] = set()
    for artifact in _artifacts(declaration):
        for key in ("path", "from"):
            value = artifact.get(key)
            if isinstance(value, str) and value:
                covered.add(value)
    return covered


def undeclared_change_violations(declaration: dict | None, change_set: list[str]) -> list[dict]:
    """A `docs/**` path in the change set that no declared artifact covers.

    A DELETED path is in scope: removing a document is a documentation change, and
    the declaration form for it is an `archive` artifact.

    A repository with no declaration recorded AT ALL is core's concern (companion §4,
    check 1), not this rule's — so an absent declaration reports nothing here.
    """
    if declaration is None:
        return []
    covered = declared_paths(declaration)
    out: list[dict] = []
    for path in sorted(set(change_set)):
        if not path.startswith(DOCS_PREFIX):
            continue
        if is_generated(path):
            continue  # render output is a consequence of authorship, not authorship
        if path in covered:
            continue
        out.append(
            {
                "rule_id": RULE_UNDECLARED_CHANGE,
                "file": path,
                "line": 1,
                "col": 1,
                "evidence": (
                    f"the change set touches {path} and no declared artifact covers it. "
                    f"Declare it at RATIFY; if the change was not planned, the declaration was "
                    f"wrong at RATIFY and re-ratifying is the honest correction."
                ),
                "source_line": "",
            }
        )
    return out
