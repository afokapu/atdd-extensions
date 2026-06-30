"""Runnable enforcement for tester.interlocking.route-coverage (python-pytest).

Two layers, the same shape as the python-pytest fleet detectors
(pytest_test_filename, security_patterns):

  1. DETECTOR SELF-TESTS — pin the decision logic (route parsing from the
     interlocking YAML, coverage detection against e2e text, the clean fixture
     emits nothing, the dirty fixture flags exactly the uncovered route with the
     v1.1 shape and the route's category_digit surfaced in the evidence). Always
     green: they prove the detector is healthy.

  2. EMISSION (the v1.1 contract job, NOT a verdict) — scan ``ATDD_SCAN_ROOTS``
     and write the RAW structured violations to ``ATDD_VIOLATIONS_REPORT`` for
     ``adapter/run.py`` to read back.

CRITICAL — this enforcement does NOT ``assert violations == []`` in the emission
layer. The detector emits RAW facts; ``tester.interlocking.route-coverage`` is
``strict``, but applying that disposition (blocking) is the GATE's job
(``gates/interlocking-coverage.gate.yaml``), never the detector's. The emission
test passes once it emits.

No core (``atdd.coach.*``) imports; the detector is imported by path.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import sys

# The detector lives in ../src (manifest entrypoint: src/interlocking_coverage.py).
_HERE = Path(__file__).resolve().parent
_SRC = _HERE.parent / "src"
sys.path.insert(0, str(_SRC))

import interlocking_coverage as detector  # noqa: E402

_FIXTURES = _HERE.parent / "fixtures"

CONTRACT_VERSION = "1.1.0"
ENV_SCAN_ROOTS = "ATDD_SCAN_ROOTS"
ENV_REPORT = "ATDD_VIOLATIONS_REPORT"


# ── 1. detector self-tests ────────────────────────────────────────────────────


_INTERLOCKING_YAML = """\
schema_version: 1.0.0
interlocking_id: interlocking:match-resolution
routes:
  - route_id: nominal-all-voted
    category: nominal
    category_digit: "0"
    train_id: 3007-match-resolution-standard
  - route_id: alternate-timeout
    category: alternate
    category_digit: "2"
    train_id: 3207-match-resolution-timeout
"""


def test_parse_routes_extracts_route_space() -> None:
    interlocking_id, routes = detector.parse_routes(_INTERLOCKING_YAML)
    assert interlocking_id == "interlocking:match-resolution"
    assert [r["route_id"] for r in routes] == ["nominal-all-voted", "alternate-timeout"]
    nominal = routes[0]
    assert nominal["train_id"] == "3007-match-resolution-standard"
    assert nominal["category_digit"] == "0"
    # Line number is anchored at the route's declaration line (text scan).
    assert nominal["line"] >= 1
    assert "route_id: nominal-all-voted" in nominal["source_line"]


def test_parse_routes_ignores_documents_without_route_space() -> None:
    # The _interlockings.yaml index / generated projections carry no `routes:`.
    index = "schema_version: 1.0.0\ninterlockings:\n  - ref: interlocking:match-resolution\n"
    assert detector.parse_routes(index) == (None, [])
    coverage = "schema_version: 1.0.0\ngenerated: true\ncovered_routes: []\n"
    assert detector.parse_routes(coverage) == (None, [])


def test_route_covered_by_route_id_or_train_id() -> None:
    _, routes = detector.parse_routes(_INTERLOCKING_YAML)
    nominal, alternate = routes
    # Referenced by route_id ...
    assert detector.is_route_covered(nominal, ["calls nominal-all-voted route"]) is True
    # ... or by the train_id it resolves to.
    assert detector.is_route_covered(alternate, ["runs 3207-match-resolution-timeout"]) is True
    # Not referenced anywhere -> uncovered.
    assert detector.is_route_covered(alternate, ["only nominal-all-voted here"]) is False


def test_token_match_is_identifier_bounded() -> None:
    _, routes = detector.parse_routes(_INTERLOCKING_YAML)
    nominal = routes[0]
    # A longer slug that merely CONTAINS the route_id must not count as coverage.
    assert detector.is_route_covered(nominal, ["nominal-all-voted-extra"]) is False


def test_clean_fixture_has_no_violations() -> None:
    assert detector.scan_root(_FIXTURES / "clean") == []


def test_dirty_fixture_flags_the_uncovered_route_with_v11_shape() -> None:
    v = detector.scan_root(_FIXTURES / "dirty")
    assert len(v) == 1, f"expected exactly the uncovered route, got {len(v)}"
    item = v[0]
    assert item["rule_id"] == detector.RULE_ROUTE_COVERAGE
    assert set(item) >= {"rule_id", "file", "line", "col", "evidence", "source_line"}
    assert isinstance(item["source_line"], str)
    assert item["line"] >= 1 and item["col"] >= 0
    # It is the alternate-timeout route, anchored in the source interlocking YAML.
    assert "alternate-timeout" in item["evidence"]
    assert item["file"].endswith("match-resolution.yaml")
    assert "route_id: alternate-timeout" in item["source_line"]
    # The route's category_digit is surfaced in the resolution metadata (evidence).
    assert "digit '2'" in item["evidence"]


def test_dirty_fixture_does_not_flag_the_covered_route() -> None:
    v = detector.scan_root(_FIXTURES / "dirty")
    assert all("nominal-all-voted" not in item["evidence"] for item in v)


# ── 2. emission (writes the RAW report; does NOT decide disposition) ───────────


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


def test_emit_raw_route_coverage_report() -> None:
    """Scan the supplied roots and emit the RAW violation report (NOT a verdict)."""
    roots = _scan_roots()
    violations = detector.scan_roots(roots)

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
