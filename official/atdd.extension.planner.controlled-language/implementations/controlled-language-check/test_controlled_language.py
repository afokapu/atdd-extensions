"""Runnable enforcement for the two planner.controlled-language.* conventions: detector
self-tests plus the v1.1 EMISSION job. Both rule_ids are suppress-and-clean, so this suite only
EMITS. EVERY checker call is mocked — no Java, no TechScribe install, no network.
"""
from __future__ import annotations

import contextlib
import json
import os
import sys
import urllib.error
from pathlib import Path
from types import SimpleNamespace

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

import controlled_language as detector  # noqa: E402

_HERE = Path(__file__).resolve().parent
_REPO = _HERE / "fixtures" / "repo"
_STE = _HERE.parent.parent / "ste"
_URL = "http://127.0.0.1:8081/v2/check"
_EXCLUDES = ["_generated/**"]

# Mirrors run.py::_VIOLATION_KEYS — a record missing one of these is dropped by the provider and
# silently degrades to the v1.0.0 exit-code fallback, i.e. to a clean pass.
_V11_KEYS = ("rule_id", "file", "line", "col", "evidence", "source_line")

# Every prose string in the fixture wagon, and nothing else. The absences are the point: urn,
# slug, status, severity, given.fixtures.0, term_id and commands.0 are structure, not writing.
_EXPECTED_PROSE = {
    "identity.purpose", "description", "acceptances.0.identity.purpose",
    "acceptances.0.given.abstract.0", "acceptances.0.given.abstract.1",
    "acceptances.0.outcome", "terms.0.text", "terms.1.text", "notes.operator", "notes.agent",
}

_WORD_MATCH = {"offset": 5, "length": 7, "message": "Use an approved word.",
               "replacements": [{"value": "use"}],
               "rule": {"id": "STE_RULE_1_1", "category": {"id": "DICT"}}}
_WRITING_MATCH = {"offset": 0, "length": 4, "message": "Keep a procedural sentence short.",
                  "replacements": [],
                  "rule": {"id": "STE_RULE_5_2", "category": {"id": "SENTENCE"}}}


def _opener(matches=(), *, status=200, payload=None, raises=None):
    """Stand-in for urllib.request.urlopen — the ONLY thing this suite ever talks to."""
    calls: list = []

    @contextlib.contextmanager
    def open_(url, body, timeout):
        calls.append((url, body, timeout))
        if raises is not None:
            raise raises
        answer = payload or json.dumps({"matches": list(matches)}).encode()
        yield SimpleNamespace(status=status, read=lambda: answer)

    open_.calls = calls
    return open_


def _scan(opener):
    return detector.scan_root(_REPO, url=_URL, excludes=_EXCLUDES, opener=opener)


def test_only_prose_keys_are_extracted() -> None:
    """String, list-of-strings and mapping-of-strings prose are all reached; identifiers,
    paths, enums and numbers are not."""
    wagon = _REPO / "plan" / "wagons" / "resolve-match.yaml"
    assert {p for p, _ in detector.prose_fields(wagon.read_text())} == _EXPECTED_PROSE


def test_unparseable_yaml_carries_no_prose() -> None:
    assert detector.prose_fields((_REPO / "plan" / "broken.yaml").read_text()) == []


def test_one_post_per_prose_field_and_a_clean_answer_is_clean() -> None:
    opener = _opener()
    assert _scan(opener) == []
    assert len(opener.calls) == len(_EXPECTED_PROSE)  # the excluded _generated/ tree is silent
    for url, body, _timeout in opener.calls:
        assert url == _URL
        assert b"language=en-US" in body and b"text=" in body
        assert b"Generated+prose" not in body


def test_findings_route_to_the_two_rule_ids() -> None:
    violations = _scan(_opener([_WORD_MATCH, _WRITING_MATCH]))
    assert {v["rule_id"] for v in violations} == detector.ALL_RULE_IDS
    assert len(violations) == 2 * len(_EXPECTED_PROSE)


@pytest.mark.parametrize(
    "match,expected",
    [(_WORD_MATCH, detector.RULE_VOCABULARY), (_WRITING_MATCH, detector.RULE_STE),
     ({"rule": {"id": "ATDD_TERM_TRAIN_AS_VERB"}}, detector.RULE_VOCABULARY),
     ({}, detector.RULE_STE)],  # unknown taxonomy -> the general rule
)
def test_word_choice_and_writing_findings_route_apart(match, expected) -> None:
    assert detector.rule_for(match) == expected


def test_project_term_xml_rule_ids_route_to_the_vocabulary_rule() -> None:
    """XML and detector must agree, or a project-term finding gets fixed the wrong way."""
    ids = [line.split('id="')[1].split('"')[0]
           for xml in sorted(_STE.glob("*.xml"))
           for line in xml.read_text().splitlines() if "<rule id=" in line]
    assert ids
    assert all(detector.rule_for({"rule": {"id": i}}) == detector.RULE_VOCABULARY for i in ids)


def test_evidence_is_the_checker_finding_verbatim() -> None:
    assert detector.evidence_for(_WORD_MATCH) == (
        'offset=5 length=7 lt_rule=STE_RULE_1_1 msg="Use an approved word." replacements=["use"]')


def test_records_carry_the_location_and_the_v11_keys() -> None:
    violations = _scan(_opener([_WORD_MATCH]))
    assert {v["location"] for v in violations} == {
        f"plan/wagons/resolve-match.yaml:{p}" for p in _EXPECTED_PROSE}
    for violation in violations:
        assert all(k in violation for k in _V11_KEYS)
        assert violation["rule_id"] in detector.ALL_RULE_IDS
        assert isinstance(violation["line"], int) and violation["line"] >= 1
        assert isinstance(violation["col"], int) and violation["col"] >= 0
        assert violation["source_line"]


@pytest.mark.parametrize(
    "opener",
    [_opener(raises=urllib.error.URLError("connection refused")),
     _opener(raises=TimeoutError("timed out")),
     _opener(raises=urllib.error.HTTPError(_URL, 503, "unavailable", {}, None)),
     _opener(status=418),
     _opener(payload=b"<html>not json</html>"),
     _opener(payload=b'{"software": {}}')],
    ids=["unreachable", "timeout", "http-error", "non-2xx", "bad-json", "no-matches-key"],
)
def test_checker_failures_fail_closed(opener) -> None:
    violations = _scan(opener)
    assert len(violations) == 1
    assert violations[0]["rule_id"] == detector.RULE_STE
    assert violations[0]["evidence"].startswith("checker-unavailable:")


def test_fail_closed_keeps_the_findings_gathered_before_the_failure() -> None:
    real, state = _opener([_WORD_MATCH]), {"n": 0}

    def flaky(url, body, timeout):
        state["n"] += 1
        if state["n"] > 1:
            raise urllib.error.URLError("connection refused")
        return real(url, body, timeout)

    violations = _scan(flaky)
    assert [v["rule_id"] for v in violations] == [detector.RULE_VOCABULARY, detector.RULE_STE]
    assert violations[1]["evidence"].startswith("checker-unavailable:")


def test_emit_raw_controlled_language_report(tmp_path) -> None:
    roots = detector.scan_roots_from_env(_HERE) or [_REPO]
    # CI has no STE checker and must never reach for one.
    opener = detector._urlopen if os.environ.get(detector.ENV_STE_URL) else _opener()
    violations = detector.scan_roots(
        roots, url=detector.ste_url(), excludes=detector.excludes_from_env() or _EXCLUDES,
        opener=opener)
    assert all(k in v for v in violations for k in _V11_KEYS)

    report_path = os.environ.get(detector.ENV_REPORT) or (tmp_path / "report.json")
    detector.write_report(report_path, roots, violations)
    payload = json.loads(Path(report_path).read_text(encoding="utf-8"))
    assert payload["contract_version"] == detector.CONTRACT_VERSION
    assert isinstance(payload["violations"], list)
