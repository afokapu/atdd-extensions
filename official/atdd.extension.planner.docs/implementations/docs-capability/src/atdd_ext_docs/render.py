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
_DIAGNOSTIC_RE = re.compile(
    r"^asciidoctor:\s*(?P<level>WARNING|ERROR|FAILED):\s*"
    r"(?P<path>[^:]+?):\s*line\s*(?P<line>\d+):\s*(?P<message>.*)$"
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
        candidates = sorted((repo_root / DOCS_DIR).rglob(Path(name).name))
        if candidates:
            rel = candidates[0].relative_to(repo_root).as_posix()
        else:
            rel = name
        findings.append(_finding(rel, int(match.group("line")), match.group("message")))
    return findings, unattributable


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

    command = [
        TOOLCHAIN,
        "--failure-level", "WARN",
        "--base-dir", str(docs_root),
        "--destination-dir", str(docs_root / DIST_SUBDIR),
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
    if completed.returncode != 0 and not findings:
        # It failed and would not say where. Exactly the unattributable case.
        detail = "; ".join(noise) or f"exit status {completed.returncode}"
        return RenderOutcome(
            unattributable=f"{TOOLCHAIN} failed without attributing the failure to a document: {detail}"
        )
    return RenderOutcome(findings=findings)
