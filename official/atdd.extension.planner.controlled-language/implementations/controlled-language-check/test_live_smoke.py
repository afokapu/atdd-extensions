"""LIVE smoke for the controlled-language gate. NOTHING in this file is mocked.

The sibling suite (test_controlled_language.py) mocks every HTTP call and stays the fast path. It
proves our logic in isolation and cannot prove the one thing that matters at the seam: that a REAL
LanguageTool/TechScribe server answers a shape we actually parse, that its offsets land on the
prose we sent, and that a REAL connection refusal fails closed. Those are what this file proves,
against a live server and a genuinely dead TCP port.

RUNNING IT. Locally these tests skip unless ATDD_STE_URL points at a live checker. In the CI job
that exists to run them, ATDD_STE_LIVE=1 turns a skip into a FAILURE — a live smoke that quietly
skips is theatre, and it is worse than no live smoke because the badge still goes green.

EVIDENCE IS COMPUTED, NEVER CONSTANT. Every assertion here derives its expectation from the live
response: offsets are read back out of the emitted evidence and compared against the server's own
numbers, and the flagged span is sliced out of the prose we sent. No test asserts a hard-coded
evidence string, and one test explicitly proves two different inputs produce different evidence.
This mirrors core's tester.acceptance-violation.live-smoke-evidence-must-not-be-constant: a harness
that returns a constant dict passes for the wrong reason and hides a dead round trip.
"""
from __future__ import annotations

import json
import os
import re
import socket
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

import controlled_language as detector  # noqa: E402

ENV_LIVE = "ATDD_STE_LIVE"

# Prose carrying a defect any English checker flags, with a replacement. Two distinct strings so we
# can prove evidence VARIES with the response instead of being a constant.
PROSE_A = "The wagon recieve the cargo."
BAD_A = "recieve"
PROSE_B = "The interlocking was definately resolved."
BAD_B = "definately"


def _live_url() -> str:
    """The live endpoint, or skip — unless ATDD_STE_LIVE=1, where skipping is a failure."""
    url = os.environ.get(detector.ENV_STE_URL)
    if os.environ.get(ENV_LIVE) == "1":
        assert url, f"{ENV_LIVE}=1 but {detector.ENV_STE_URL} is unset — the live job is misconfigured"
        return url
    if not url:
        pytest.skip(f"no live checker configured (set {detector.ENV_STE_URL}, or {ENV_LIVE}=1 in CI)")
    return url


def _match_for(matches: list, token: str, prose: str) -> dict:
    """The live match whose own offset/length slices *token* out of *prose*.

    Selected by the server's numbers, not by index — the server may report several defects and
    their order is not ours to assume.
    """
    for m in matches:
        offset, length = m.get("offset"), m.get("length")
        if isinstance(offset, int) and isinstance(length, int):
            if prose[offset:offset + length] == token:
                return m
    raise AssertionError(
        f"live server reported no match covering {token!r} in {prose!r}; "
        f"raw matches were: {json.dumps(matches, indent=2)[:2000]}")


def _parse_evidence(evidence: str) -> dict:
    """Read the emitted evidence back into fields, so we can compare it to the live response."""
    m = re.match(
        r'^offset=(?P<offset>\d+) length=(?P<length>\d+) lt_rule=(?P<rule>\S+) '
        r'msg=(?P<msg>".*") replacements=(?P<reps>\[.*\])$', evidence)
    assert m, f"evidence did not match the documented format: {evidence!r}"
    return {"offset": int(m["offset"]), "length": int(m["length"]), "rule": m["rule"],
            "message": json.loads(m["msg"]), "replacements": json.loads(m["reps"])}


# ── 1. the live server answers a shape we parse ────────────────────────────────

def test_live_checker_answers_the_v2_check_contract() -> None:
    """Real socket, real form encoding, real JSON. check_text uses the production _urlopen."""
    url = _live_url()
    matches = detector.check_text(PROSE_A, url)
    assert matches, f"live checker found no defect in {PROSE_A!r}"

    match = _match_for(matches, BAD_A, PROSE_A)
    print(f"\n[live] matched rule payload:\n{json.dumps(match, indent=2)[:1200]}")

    assert isinstance(match["offset"], int) and match["offset"] >= 0
    assert isinstance(match["length"], int) and match["length"] > 0
    assert isinstance(match.get("message"), str) and match["message"]
    assert isinstance(match.get("rule"), dict) and match["rule"].get("id")
    assert isinstance(match.get("replacements"), list)
    # The defect is a misspelling, so the server must offer at least one correction.
    assert any(r.get("value") for r in match["replacements"] if isinstance(r, dict)), \
        f"no replacements offered for {BAD_A!r}: {match['replacements']}"


# ── 2. evidence + routing are COMPUTED from the live response ──────────────────

def test_evidence_is_computed_from_the_live_response() -> None:
    """Every field in the emitted evidence must equal the server's own value. Nothing constant."""
    url = _live_url()
    match = _match_for(detector.check_text(PROSE_A, url), BAD_A, PROSE_A)
    parsed = _parse_evidence(detector.evidence_for(match))

    assert parsed["offset"] == match["offset"]
    assert parsed["length"] == match["length"]
    assert parsed["rule"] == match["rule"]["id"]
    assert parsed["message"] == match["message"]
    assert parsed["replacements"] == [
        r["value"] for r in match["replacements"][:5] if isinstance(r, dict) and r.get("value")]
    # The numbers are the server's, and they really do point at the defect we planted.
    assert PROSE_A[parsed["offset"]:parsed["offset"] + parsed["length"]] == BAD_A


def test_evidence_varies_with_the_response_so_it_cannot_be_a_constant() -> None:
    """The anti-constant control: two different live defects must yield different evidence.

    A harness that returns a fixed dict passes every other assertion here and proves nothing. This
    is the test that would catch it.
    """
    url = _live_url()
    ev_a = detector.evidence_for(_match_for(detector.check_text(PROSE_A, url), BAD_A, PROSE_A))
    ev_b = detector.evidence_for(_match_for(detector.check_text(PROSE_B, url), BAD_B, PROSE_B))
    assert ev_a != ev_b, f"identical evidence for two different defects — constant harness? {ev_a}"
    assert _parse_evidence(ev_a)["replacements"] != _parse_evidence(ev_b)["replacements"]


def test_routing_follows_the_live_servers_own_taxonomy() -> None:
    """rule_for must agree with what VOCABULARY_TOKENS says about the REAL rule/category id."""
    url = _live_url()
    match = _match_for(detector.check_text(PROSE_A, url), BAD_A, PROSE_A)
    rule = match["rule"]
    taxonomy = f"{rule.get('id', '')} {(rule.get('category') or {}).get('id', '')}".upper()
    expected = (detector.RULE_VOCABULARY
                if any(t in taxonomy for t in detector.VOCABULARY_TOKENS) else detector.RULE_STE)
    assert detector.rule_for(match) == expected, f"live taxonomy {taxonomy!r} routed wrong"
    print(f"\n[live] taxonomy {taxonomy!r} -> {detector.rule_for(match)}")


# ── 3. real offsets land on our dotted prose paths ─────────────────────────────

def test_live_violation_carries_our_location_and_real_positions(tmp_path) -> None:
    """The whole chain on a real artifact: YAML -> prose extraction -> live checker -> v1.1 record."""
    url = _live_url()
    artifact = tmp_path / "plan" / "wagons" / "live.yaml"
    artifact.parent.mkdir(parents=True)
    artifact.write_text(
        "identity:\n"
        "  urn: \"wmbt:live:D001\"\n"      # not prose -> must never be sent
        f"  purpose: {PROSE_A}\n"
        "status: RED\n", encoding="utf-8")

    violations = detector.scan_root(tmp_path, url=url)
    assert violations, "live scan produced no violations for prose with a planted defect"
    assert not any(v["evidence"].startswith("checker-unavailable") for v in violations), \
        f"checker went away mid-test: {violations}"

    ours = [v for v in violations
            if _parse_evidence(v["evidence"])["length"] == len(BAD_A)
            and PROSE_A[_parse_evidence(v["evidence"])["offset"]:][:len(BAD_A)] == BAD_A]
    assert ours, f"no violation whose live offset covers {BAD_A!r}: {violations}"
    violation = ours[0]

    assert violation["location"] == "plan/wagons/live.yaml:identity.purpose"
    assert violation["file"] == "plan/wagons/live.yaml"
    # line/col are the real position of the prose SCALAR, derived from the file rather than
    # hard-coded, so the assertion cannot drift away from what the artifact actually says.
    raw_line = artifact.read_text(encoding="utf-8").splitlines()[violation["line"] - 1]
    assert raw_line.index(PROSE_A) == violation["col"]
    assert BAD_A in violation["source_line"]
    assert violation["rule_id"] in detector.ALL_RULE_IDS
    # The URN sat next to the prose and must not have been checked.
    assert not any("urn" in v["location"] for v in violations)
    print(f"\n[live] record: {json.dumps(violation, indent=2)}")


# ── 4. a REAL connection refusal fails closed ──────────────────────────────────

def _dead_port() -> int:
    """Bind an ephemeral port and release it: connecting there is a real ECONNREFUSED."""
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    return port


def test_real_connection_refusal_fails_closed(tmp_path) -> None:
    """Not a mocked exception — a real TCP connect to a port with nothing listening."""
    (tmp_path / "a.yaml").write_text(f"description: {PROSE_A}\n", encoding="utf-8")
    url = f"http://127.0.0.1:{_dead_port()}/v2/check"

    violations = detector.scan_root(tmp_path, url=url)

    assert len(violations) == 1, f"expected exactly one fail-closed violation, got {violations}"
    violation = violations[0]
    assert violation["rule_id"] == detector.RULE_STE
    assert violation["evidence"].startswith("checker-unavailable:")
    assert "unreachable" in violation["evidence"]
    assert violation["location"] == "a.yaml:description"
    assert all(k in violation for k in
               ("rule_id", "file", "line", "col", "evidence", "source_line"))
    print(f"\n[live] refusal evidence: {violation['evidence']}")


def test_a_refused_checker_makes_the_consumer_verdict_fail(tmp_path) -> None:
    """The 'passed=False' half, stated in the terms the contract actually uses.

    PROVIDER-CONTRACT-v1.1 §1: the provider's `passed` is RUN-HEALTH and stays True here, because
    the detector ran and emitted correctly. The pass/fail VERDICT is the consumer's, computed from
    `violations`. So the thing that must be False is the verdict — and with the checker refused it
    is, under either disposition, because a fail-closed violation carries no suppression marker.
    """
    (tmp_path / "a.yaml").write_text(f"description: {PROSE_A}\n", encoding="utf-8")
    violations = detector.scan_root(tmp_path, url=f"http://127.0.0.1:{_dead_port()}/v2/check")

    def consumer_verdict(raw: list) -> bool:
        """Faithful stand-in for core's disposition_gate: unsuppressed violations -> FAIL."""
        return not [v for v in raw if "atdd:suppress" not in v["source_line"]]

    assert consumer_verdict(violations) is False, "a dead checker must not read as a clean pass"
    assert consumer_verdict([]) is True          # control: the same gate passes on no violations
