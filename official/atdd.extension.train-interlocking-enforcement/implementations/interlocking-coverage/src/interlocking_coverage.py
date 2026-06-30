"""Interlocking route-coverage detector (python-pytest realization of #26).

REALIZES the stack-bound EXTENSION obligation ``tester.interlocking.route-coverage``
(disposition ``strict``, severity 1). The obligation node is authored in this
extension package
(``conventions/tester.interlocking.route-coverage.convention.yaml``); this module
is the python-pytest DETECTOR that realizes it — it is NOT a new node and it does
not re-author the obligation.

Obligation: every admissible route declared in an interlocking's guarded route
space — the ``routes:`` list of ``plan/_trains/_interlockings/**/*.yaml``, the
authoritative route space locked by core afokapu/atdd#1248 — MUST have at least
one ``e2e/**/*.py`` test that exercises it (references it by ``route_id`` or by
the ``train_id`` it resolves to), proving the route resolves through the
production InterlockingRunner -> TrainRunner path (core afokapu/atdd#1251). An
admissible route with no covering e2e test is a SILENT-GREEN GAP: the guarded
route-control branch it represents is never driven, so CI is green while the
branch is unproven.

The detector is a PURE decision function: the caller supplies the scan roots (a
consumer tree carrying both the interlocking YAML and the ``e2e/`` tests) and it
returns RAW violations in the ATDD v1.1 violation-output contract
``{rule_id, file, line, col, evidence, source_line}``. It NEVER decides
disposition — ``strict`` lives in the convention node, and whether the RAW signal
blocks is the gate's job, never the detector's.

Scope selectors it consumes (scopes/interlocking-targets.scope.yaml):
``interlocking_yaml`` (route space) + ``e2e_tests`` (the covering tests).

Provenance (per boundary spec §6.2 — NARRATIVE, not a graph edge): the route
fields parsed here (``route_id``, ``train_id``, ``category``, ``category_digit``,
``guard_ref``) are the core afokapu/atdd#1248 interlocking schema; the runner
path the e2e tests must drive is core afokapu/atdd#1251. No ``atdd.coach.*``
substrate is imported.
"""
from __future__ import annotations

import re
from pathlib import Path

import yaml  # provider runtime dependency (cli/scan.py + adapter/discover.py use it)

# The EXTENSION convention rule_id this detector realizes (NOT a new node).
RULE_ROUTE_COVERAGE = "tester.interlocking.route-coverage"  # disposition: strict
RULE_ID = RULE_ROUTE_COVERAGE

# Where the authoritative guarded route space lives (core afokapu/atdd#1248).
_INTERLOCKING_GLOBS = (
    "plan/_trains/_interlockings/**/*.yaml",
    "plan/_trains/_interlockings.yaml",
)
# Where the covering end-to-end tests live.
_E2E_GLOB = "e2e/**/*.py"


# ---------------------------------------------------------------------------
# Parsing the interlocking route space (pure — unit-tested against source text)
# ---------------------------------------------------------------------------


def _route_lineno(text: str, route_id: str) -> tuple[int, str]:
    """Return ``(lineno, source_line)`` of the ``route_id: <route_id>`` line.

    yaml.safe_load discards line info, so the route's declaration line is found by
    a text scan of the original source. Falls back to ``(1, "")`` if not located
    (e.g. the id is quoted/flowed in an unusual way) so a violation can still be
    anchored at a real file.
    """
    pat = re.compile(
        r"""^\s*-?\s*route_id:\s*["']?""" + re.escape(route_id) + r"""["']?\s*(?:#.*)?$"""
    )
    for i, line in enumerate(text.splitlines(), start=1):
        if pat.match(line):
            return i, line
    return 1, ""


def parse_routes(text: str) -> tuple[str | None, list[dict]]:
    """Parse one interlocking YAML and return ``(interlocking_id, routes)``.

    ``routes`` is a list of ``{route_id, train_id, category, category_digit,
    guard_ref, line, source_line}`` dicts, one per admissible route. A document
    that does not declare both ``interlocking_id`` and a non-empty ``routes:``
    list (the ``_interlockings.yaml`` index, the generated ``coverage.yaml`` /
    ``sequence.*`` projections) carries no admissible route space and yields
    ``(None, [])``.
    """
    try:
        doc = yaml.safe_load(text)
    except yaml.YAMLError:
        # Malformed YAML: not a parseable route space. Surface nothing rather than
        # crash the scan; a malformed interlocking is a planner/core concern.
        return None, []
    if not isinstance(doc, dict):
        return None, []
    interlocking_id = doc.get("interlocking_id")
    raw_routes = doc.get("routes")
    if not interlocking_id or not isinstance(raw_routes, list):
        return None, []

    routes: list[dict] = []
    for entry in raw_routes:
        if not isinstance(entry, dict) or "route_id" not in entry:
            continue
        route_id = str(entry["route_id"])
        lineno, source_line = _route_lineno(text, route_id)
        routes.append(
            {
                "route_id": route_id,
                "train_id": (
                    str(entry["train_id"]) if entry.get("train_id") is not None else None
                ),
                "category": entry.get("category"),
                "category_digit": (
                    str(entry["category_digit"])
                    if entry.get("category_digit") is not None
                    else None
                ),
                "guard_ref": entry.get("guard_ref"),
                "line": lineno,
                "source_line": source_line,
            }
        )
    return str(interlocking_id), routes


# ---------------------------------------------------------------------------
# Coverage decision (pure)
# ---------------------------------------------------------------------------


def _token_covered(token: str | None, e2e_text: str) -> bool:
    """True if ``token`` appears as a route/train identifier in ``e2e_text``.

    Route ids (``nominal-all-voted``) and train ids (``3007-match-resolution-standard``)
    are distinctive hyphenated slugs. A reference is recognised when the token
    appears not immediately flanked by identifier-extending characters, so
    ``nominal-all-voted`` does not spuriously match ``nominal-all-voted-extra``.
    """
    if not token:
        return False
    pat = re.compile(r"(?<![\w-])" + re.escape(token) + r"(?![\w-])")
    return bool(pat.search(e2e_text))


def is_route_covered(route: dict, e2e_texts: list[str]) -> bool:
    """True if any e2e test references the route by ``route_id`` or ``train_id``."""
    for text in e2e_texts:
        if _token_covered(route.get("route_id"), text):
            return True
        if _token_covered(route.get("train_id"), text):
            return True
    return False


def _violation(interlocking_file: str, interlocking_id: str | None, route: dict) -> dict:
    digit = route.get("category_digit")
    category = route.get("category")
    cat_desc = (
        f"category {category!r} (digit {digit!r})"
        if category is not None or digit is not None
        else "uncategorised"
    )
    train = route.get("train_id")
    return {
        "rule_id": RULE_ROUTE_COVERAGE,
        "file": interlocking_file,
        "line": route.get("line", 1),
        "col": 0,
        "evidence": (
            f"admissible route {route['route_id']!r} of interlocking "
            f"{interlocking_id!r} ({cat_desc}, resolves to train {train!r}) has no "
            f"e2e test exercising it; add an e2e/**/*.py test that references the "
            f"route_id or train_id and drives it through InterlockingRunner -> "
            f"TrainRunner"
        ),
        "source_line": route.get("source_line", ""),
    }


# ---------------------------------------------------------------------------
# Scan-root walk (scope supplied explicitly — never auto-discovered)
# ---------------------------------------------------------------------------


def find_interlocking_files(root: Path) -> list[Path]:
    """Return interlocking artifacts under ``root`` (the ``interlocking_yaml`` scope)."""
    root = Path(root)
    found: list[Path] = []
    for glob in _INTERLOCKING_GLOBS:
        found.extend(p for p in root.glob(glob) if p.is_file())
    # De-dup (the two globs can overlap) and stabilise order.
    return sorted(set(found))


def find_e2e_files(root: Path) -> list[Path]:
    """Return e2e test files under ``root`` (the ``e2e_tests`` scope)."""
    root = Path(root)
    return sorted(p for p in root.glob(_E2E_GLOB) if p.is_file())


def _read(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return ""


def scan_root(root: Path) -> list[dict]:
    """Scan one consumer ``root`` and return RAW v1.1 violation dicts.

    A violation is raised for each admissible route (across every interlocking
    artifact under ``root``) that no ``e2e/**/*.py`` test references. Each is
    ``{rule_id, file, line, col, evidence, source_line}``; ``file`` is the
    interlocking YAML path relative to ``root``. The detector NEVER applies
    disposition — ``strict`` is the gate's call.
    """
    root = Path(root)
    if not root.exists():
        return []
    e2e_texts = [_read(p) for p in find_e2e_files(root)]

    violations: list[dict] = []
    for il_file in find_interlocking_files(root):
        interlocking_id, routes = parse_routes(_read(il_file))
        if not routes:
            continue
        try:
            rel = str(il_file.relative_to(root))
        except ValueError:
            rel = str(il_file)
        for route in routes:
            if not is_route_covered(route, e2e_texts):
                violations.append(_violation(rel, interlocking_id, route))
    return violations


def scan_roots(roots: list[Path]) -> list[dict]:
    """Scan every root and return the concatenated RAW violation list."""
    out: list[dict] = []
    for r in roots:
        out.extend(scan_root(Path(r)))
    return out


def detect(roots: list[Path]) -> list[dict]:
    """Public entrypoint: RAW violations for interlocking routes lacking e2e coverage."""
    return scan_roots([Path(r) for r in roots])
