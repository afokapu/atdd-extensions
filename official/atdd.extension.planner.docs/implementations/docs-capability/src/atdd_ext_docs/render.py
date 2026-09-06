"""Rendering and reference integrity (spec 2 §7).

asciidoctor (Ruby) is the reference implementation, chosen over a pure-Python
renderer BECAUSE unresolvable internal references must be validation failures and
the Python options detect them weakly. A Ruby runtime in CI is the cost, accepted
deliberately (spec 2 §9 Decision 4).

THE VERDICT SPLIT IS THIS MODULE'S REASON FOR EXISTING:

  * a failure this module can pin to a document      -> FAIL
  * a failure it cannot pin to a document, including
    an ABSENT toolchain                              -> COULD_NOT_CHECK

Never PASS. A missing asciidoctor is not a clean corpus; it is an unexamined one,
and reporting it as a pass is the #1745 defect re-committed.
"""
from __future__ import annotations

import re
import shutil
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

from . import RULE_REFERENCE_INTEGRITY
from .corpus import DOCS_DIR

TOOLCHAIN = "asciidoctor"
DIST_SUBDIR = "dist"

#: Seconds before the renderer is abandoned. A renderer that overruns leaves the
#: capability unable to answer — COULD_NOT_CHECK, not FAIL: the capability itself
#: ran to completion, it simply could not see the corpus. (Spec 2 §3 reserves FAIL
#: for the capability's OWN crash or timeout, which is `capability.check`'s except
#: branch, not this one.)
RENDER_TIMEOUT_SECONDS = 120

#: `asciidoctor: WARNING: shared-control-root.adoc: line 12: invalid reference: foo`
#: The `line N` segment is OPTIONAL. asciidoctor emits plenty of fully attributable
#: warnings without one ("notes.adoc: section title out of sequence"); requiring it
#: pushed those into the unattributable bucket, where they became a COULD_NOT_CHECK
#: with no file pointer or were dropped entirely.
_DIAGNOSTIC_RE = re.compile(
    r"^asciidoctor:\s*(?P<level>WARNING|ERROR|FAILED):\s*"
    r"(?P<path>[^:]+?):\s*(?:line\s*(?P<line>\d+):\s*)?(?P<message>.*)$"
)


@dataclass(frozen=True)
class RenderOutcome:
    """What the render could and could not establish."""

    #: Diagnostics pinned to a document. These are FAIL.
    findings: list[dict] = field(default_factory=list)
    #: Why the render could not answer at all. This is COULD_NOT_CHECK.
    unattributable: str | None = None

    @property
    def could_not_check(self) -> bool:
        return self.unattributable is not None


def toolchain_available() -> bool:
    """True when asciidoctor is on PATH."""
    return shutil.which(TOOLCHAIN) is not None


def _finding(path: str, line: int, message: str) -> dict:
    return {
        "rule_id": RULE_REFERENCE_INTEGRITY,
        "file": path,
        "line": line,
        "col": 1,
        "evidence": f"asciidoctor: {message}",
        "source_line": "",
    }


def parse_diagnostics(stderr: str, repo_root: Path) -> tuple[list[dict], list[str]]:
    """Split renderer output into attributable findings and unattributable lines.

    A diagnostic naming a file and a line is attributable. Anything else — a Ruby
    backtrace, a load error, a message with no location — is not, and is returned
    for the caller to surface as COULD_NOT_CHECK rather than quietly dropped.
    """
    findings: list[dict] = []
    unattributable: list[str] = []
    for raw in stderr.splitlines():
        line = raw.strip()
        if not line:
            continue
        match = _DIAGNOSTIC_RE.match(line)
        if not match:
            unattributable.append(line)
            continue
        name = match.group("path").strip()
        rel, ambiguous = _attribute(name, repo_root)
        message = match.group("message")
        if ambiguous:
            message += (
                f" [reported as {name!r}; {ambiguous} files in the corpus share that name, "
                f"so the location is the renderer's, not this detector's]"
            )
        line = int(match.group("line") or 1)
        findings.append(_finding(rel, line, message))
    return findings, unattributable


def _attribute(name: str, repo_root: Path) -> tuple[str, int]:
    """Resolve a renderer-reported path to a repo-relative one.

    `render()` passes ABSOLUTE source paths to asciidoctor, so the diagnostic already
    names the exact file — the previous code threw that away and globbed the basename
    under docs/, taking candidates[0]. A canonical tree holds six files called
    `index.adoc`, so a warning about docs/purpose/index.adoc was reported against
    docs/architecture/decisions/index.adoc, sending the author to a file with no such
    problem. Only a bare basename falls back to a glob, and an ambiguous one says so.
    """
    candidate = Path(name)
    if candidate.is_absolute():
        try:
            return candidate.resolve().relative_to(repo_root.resolve()).as_posix(), 0
        except ValueError:
            return candidate.as_posix(), 0
    if (repo_root / candidate).exists():
        return candidate.as_posix(), 0
    matches = sorted((repo_root / DOCS_DIR).rglob(candidate.name))
    if len(matches) == 1:
        return matches[0].relative_to(repo_root).as_posix(), 0
    if len(matches) > 1:
        return matches[0].relative_to(repo_root).as_posix(), len(matches)
    return name, 0


def render(repo_root: Path) -> RenderOutcome:
    """Render the corpus and report what the renderer said.

    `docs/dist/` is the OUTPUT and never an input, so the render is invoked on the
    authored tree with the output directory pointed at dist.
    """
    docs_root = repo_root / DOCS_DIR
    if not docs_root.is_dir():
        return RenderOutcome(unattributable=f"{DOCS_DIR}/ is not a readable directory")
    if not toolchain_available():
        return RenderOutcome(
            unattributable=(
                f"{TOOLCHAIN} is not installed, so the corpus was not rendered and reference "
                f"integrity could not be established. This is COULD_NOT_CHECK and it BLOCKS; "
                f"install the toolchain (`gem install {TOOLCHAIN}`) rather than suppressing it."
            )
        )

    sources = [
        p for p in sorted(docs_root.rglob("*.adoc"))
        if DIST_SUBDIR not in p.relative_to(docs_root).parts
    ]
    if not sources:
        return RenderOutcome()  # nothing authored to render; not an error

    # Render into a TEMP directory, never docs/dist. A validation call that writes
    # generated HTML into the tree it is validating leaves the worktree dirty, which
    # can trip a clean-worktree check elsewhere in the lifecycle. The reference-
    # integrity signal is identical either way.
    with tempfile.TemporaryDirectory(prefix="atdd-docs-render-") as out_dir:
        command = [
            TOOLCHAIN,
            "--failure-level", "WARN",
            "--base-dir", str(docs_root),
            "--destination-dir", out_dir,
            *[str(p) for p in sources],
        ]
        try:
            completed = subprocess.run(  # noqa: S603 — fixed argv, no shell
                command, capture_output=True, text=True, timeout=RENDER_TIMEOUT_SECONDS,
            )
        except subprocess.TimeoutExpired:
            return RenderOutcome(
                unattributable=f"{TOOLCHAIN} exceeded {RENDER_TIMEOUT_SECONDS}s and was abandoned; "
                               f"the corpus was not rendered"
            )
        except OSError as exc:
            return RenderOutcome(unattributable=f"{TOOLCHAIN} could not be executed: {exc}")

        findings, noise = parse_diagnostics(completed.stderr, repo_root)
        # Noise reaches the caller whenever there is any, NOT only when there are no
        # located findings. Previously a load failure ("cannot load such file --
        # asciidoctor/converter", meaning most of the corpus was never validated) was
        # discarded the moment one located warning existed, so the verdict was FAIL on
        # the warning and the far worse fact never reached the report.
        if noise:
            detail = "; ".join(noise)
            return RenderOutcome(
                findings=findings,
                unattributable=(
                    f"{TOOLCHAIN} emitted output it could not attribute to a document, so part of "
                    f"the corpus was not validated: {detail}"
                ),
            )
        if completed.returncode != 0 and not findings:
            return RenderOutcome(
                unattributable=f"{TOOLCHAIN} failed without saying where: exit status {completed.returncode}"
            )
        return RenderOutcome(findings=findings)
