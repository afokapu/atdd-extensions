"""Each rule fires on the RIGHT target, not merely somewhere in its dirty fixture.

The last real gap between this suite and the python-pytest detectors' own tests.
`test_families.py` proves rule X fires on the dirty tree and is silent on the clean
one — which a detector that fires on the WRONG thing still satisfies, as long as it
fires. The python siblings go further:

    def test_cyclomatic_trips_on_its_function():
        hits = [x for x in v if x["rule_id"] == RULE_CYCLO_TS]
        assert any("classify" in x["evidence"] for x in hits)

That pins the function the detector had to identify. This suite does the same for
all 62 rules.

WHAT AN EXPECTATION PINS. Each row names the fixture file the finding must land in,
plus substrings its EVIDENCE must contain. Evidence only, deliberately: a mutation
test showed that also accepting `source_line` makes the check worthless, because the
source line of a complexity finding already carries the function name, so a detector
reporting the wrong name still passed. The evidence is the sentence a human reads.
Every substring is a value the detector had to COMPUTE, never boilerplate it could
emit blindly: a function name
it extracted, a metric it calculated, a URN segment it parsed, an endpoint it
matched, the test case it landed on. `complexity-
cyclomatic` must say `decide` and `13`; a detector reporting the wrong function, or
the right function with the wrong number, fails here and passes `test_families`.

Writing this found a real weakness it was meant to find: `swap-oob-asserts-
destination-id` emitted the same sentence for every case, so a report of three
findings made the reader diff line numbers to tell them apart. It now names the case.

`test_every_rule_has_an_expectation` keeps the table honest: a rule added without a
precision row fails the suite rather than sliding in uncovered.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest
import yaml

_WS = Path(__file__).resolve().parent.parent
_CLI = _WS / "cli" / "scan.py"
_IMPLS = _WS / "implementations"

requires_bun = pytest.mark.skipif(shutil.which("bun") is None, reason="bun not on PATH")

# rule_id -> (fixture file the finding must land in, substrings the evidence must
#             contain, expected line or None when the line is not the finding)
EXPECT: dict[str, tuple[str, tuple[str, ...], int | None]] = {
    # ── coder.bun · GREEN traceability ──────────────────────────────────────
    "coder.bun.green-urn-marker":            ("OrderRow.ts", ("URN:", "first meaningful line"), None),
    "coder.bun.green-urn-pattern":           ("OrderRow.ts", ("component:orders:checkout:OrderRow",), None),
    "coder.bun.green-urn-wagon-feature":     ("OrderRow.ts", ("Orders", "Check_Out"), None),
    "coder.bun.green-urn-name-matches":      ("OrderRow.ts", ("SomethingElse", "OrderRow"), None),
    "coder.bun.green-urn-side":              ("OrderRow.ts", ("server", "frontend|backend"), None),
    "coder.bun.green-urn-layer":             ("OrderRow.ts", ("widgets",), None),
    "coder.bun.green-header-runtime":        ("OrderRow.ts", ("Runtime:",), None),
    "coder.bun.green-header-purpose":        ("OrderRow.ts", ("Purpose:",), None),
    "coder.bun.green-header-tested-by":      ("OrderRow.ts", ("Tested-By:", "- test:"), None),
    "coder.bun.green-header-order":          ("OrderRow.ts", ("Runtime", "Tested-By"), 3),
    # ── coder.bun · TypeScript metrics ──────────────────────────────────────
    "coder.bun.complexity-cyclomatic":       ("gnarly.ts", ("decide", "13"), 2),
    "coder.bun.complexity-nesting":          ("gnarly.ts", ("decide", "6"), 2),
    "coder.bun.complexity-length":           ("long.ts", ("longOne", "64"), None),
    "coder.bun.quality-mi":                  ("big.ts", ("maintainability index",), None),
    "coder.bun.quality-comments":            ("orphan.ts", ("0.0%",), None),
    "coder.bun.dead-code-reachability":      ("orphan.ts", ("unreachable", "orphan.ts"), None),
    "coder.bun.duplication-intra-layer":     ("a.ts", ("domain", "b.ts"), None),
    # ── coder.bun · security / logging / errors ─────────────────────────────
    "coder.bun.security-hardcoded-secret":   ("secrets.ts", ("aws_access_key",), None),
    "coder.bun.security-sql-injection":      ("db.ts", ("template literal", "query sink"), None),
    "coder.bun.security-missing-auth":       ("routes.ts", ("POST", "authorisation"), None),
    "coder.bun.logging-console":             ("logging.ts", ("console.log",), None),
    "coder.bun.logging-structured":          ("logging.ts", ("logger.info", "context object"), None),
    "coder.bun.error-response-bare-string":  ("errors.ts", ("404", "order not found"), None),
    "coder.bun.error-response-code-format":  ("errors.ts", ("orderNotFound", "UPPER_SNAKE_CASE"), None),
    # ── coder.bun · clean architecture ──────────────────────────────────────
    "coder.bun.commons-domain-no-outbound":        ("rules.ts", ("integration",), None),
    "coder.bun.commons-application-no-integration":("flow.ts", ("integration",), None),
    "coder.bun.commons-cross-feature-imports-in":  ("rules.ts", ("orders",), None),
    "coder.bun.commons-domain-no-framework-import":("rules.ts", ("bun:sqlite",), None),
    "coder.bun.design-hierarchy-import":           ("flow.ts", ("application", "integration"), None),
    "coder.bun.composition-root":                  ("api.ts", ("InvoiceRepository",), None),
    "coder.bun.composition-consumer":              ("api.ts", ("presentation", "InvoiceRepository"), None),
    "coder.bun.dto-purity":                        ("pay.ts", ("InvoiceDTO", "method member", "non-readonly"), None),
    "coder.bun.dto-placement":                     ("pay.ts", ("InvoiceDTO", "contracts/"), None),
    "coder.bun.dto-mapper":                        ("pay.ts", ("toInvoiceDTO", "application"), None),
    "coder.bun.boundaries-http-client":            ("api.ts", ("presentation",), None),
    "coder.bun.layer-naming":                      ("helper.ts", ("helper.ts",), None),
    # ── coder.bun · runtime ─────────────────────────────────────────────────
    "coder.bun.runtime-server-is-bun-serve": ("server.ts", ("express", "Bun.serve"), None),
    "coder.bun.runtime-single-lockfile":     ("package-lock.json", ("npm", "package-lock.json"), None),
    # ── coder.bun · interlocking (route control) ────────────────────────────
    # Each row pins the failure mode the detector had to CLASSIFY from the tree —
    # which of a check's several branches fired — plus, where the check computes
    # one, the concrete value it extracted (the missing resolution field, the
    # artifact literal that bled into the route-control layer).
    "coder.bun.interlocking-runner-exists":            ("interlocking.ts", ("missing-resolve-train", "resolveTrain"), None),
    "coder.bun.interlocking-resolution-model-exists":  ("interlocking.ts", ("bare-train-id-resolution", "interlockingId"), None),
    "coder.bun.station-master-interlocking-routing":   ("server.ts", ("no-trainrunner-delegation", "TrainRunner"), None),
    "coder.bun.interlocking-delegates-to-trainrunner": ("interlocking.ts", ("direct-wagon-execution", "runTrain"), None),
    "coder.bun.interlocking-does-not-carry-cargo":     ("interlocking.ts", ("cargo-mutation", "artifact_urn"), None),
    # The systemic one. Pins the DIRECTION the detector classified plus the route id
    # it extracted from the runtime and failed to find in the declared route space —
    # a hidden route is the interlocking analogue of a fabricated graph node.
    "coder.bun.interlocking-bilateral-binding":        ("interlocking.ts", ("runtime_to_declaration", "phantom-hidden-route"), None),
    # ── tester.bun · interlocking (four ways a green suite can lie) ─────────
    "tester.bun.interlocking-route-coverage":                    ("match-resolution.yaml", ("alternate-timeout",), None),
    "tester.bun.interlocking-production-runner-used":            ("routes.test.ts", ("MockInterlockingRunner",), None),
    "tester.bun.interlocking-smoke-coverage-for-station-master": ("match-resolution.yaml", ("resolve_match",), None),
    "tester.bun.interlocking-trace-binds-declared-route":        ("trace.test.ts", ("guardId",), None),
    # ── coder.htmx ──────────────────────────────────────────────────────────
    "coder.htmx.verb-endpoint-same-origin":     ("panel.html", ("hx-get", "same-origin"), None),
    "coder.htmx.verb-destructive-confirms":     ("delete.html", ("hx-delete", "hx-confirm"), None),
    "coder.htmx.verb-mutation-signals-progress":("form.html", ("hx-post", "hx-indicator"), None),
    "coder.htmx.swap-oob-carries-id":           ("fragment.html", ("hx-swap-oob", "no id"), None),
    "coder.htmx.swap-no-inline-handler":        ("row.html", ("onclick", "hx-trigger"), None),
    "coder.htmx.fragment-escapes-interpolation":("render.ts", ("${order.title}", "escape"), None),
    # ── tester.bun ──────────────────────────────────────────────────────────
    "tester.bun.test-carries-urn-identity":  ("no_header.test.ts", ("URN: test:",), None),
    "tester.bun.acceptance-binding-declared":("unbound.test.ts", ("Acceptance:", "Train:"), None),
    "tester.bun.test-phase-declared":        ("badphase.test.ts", ("INTEGRATION", "RED|UNIT|SMOKE|E2E"), None),
    "tester.bun.acceptance-covers-tag-well-formed": ("badcovers.test.ts", ("E005-UNIT-001", "acc:"), None),
    "tester.bun.red-fails-first":            ("vacuous.red.test.ts", ("guaranteed-fail marker",), None),
    "tester.bun.red-behavioral-assertion":   ("vacuous.red.test.ts", ("toBeDefined",), None),
    "tester.bun.smoke-observable-assertion": ("internal.smoke.test.ts", ("operator-observable",), None),
    "tester.bun.smoke-no-collaborator-substitution": ("substituted.smoke.test.ts", ("spyOn",), None),
    "tester.bun.test-no-self-skip":          ("skipped.test.ts", (".skip",), None),
    "tester.bun.test-isolation-no-live-state":("polluting.test.ts", ("process.env",), None),
    "tester.bun.routing-runtime-family":     ("wrongruntime.test.ts", ("python", "JS/TS family"), None),
    "tester.bun.security-auth":              ("happy.auth.test.ts", ("401", "403"), None),
    "tester.bun.security-input":             ("happy.input.test.ts", ("rejects", "422"), None),
    "tester.bun.telemetry-emit":             ("quiet.telemetry.test.ts", ("toHaveBeenCalled",), None),
    "tester.bun.test-imports-bun-test":      ("foreign_harness.test.ts", ("vitest", "bun:test"), None),
    # ── tester.htmx ─────────────────────────────────────────────────────────
    "tester.htmx.verb-endpoint-coverage":          ("panel.html", ("/invoices/overdue",), None),
    "tester.htmx.fragment-asserts-returned-markup":("statusonly.test.ts", ("status line", "markup"), None),
    "tester.htmx.swap-oob-asserts-destination-id": ("orders.test.ts", ("updates the badge out of band", "destination id"), None),
}


def _impls() -> list[Path]:
    return sorted(p for p in _IMPLS.iterdir() if (p / "atdd.implementation.yaml").is_file())


def _declared() -> dict[str, Path]:
    """rule_id -> owning implementation."""
    out = {}
    for impl in _impls():
        for rid in yaml.safe_load((impl / "atdd.implementation.yaml").read_text())["emits_rule_ids"]:
            out[rid] = impl
    return out


def _scan(impl: Path, root: Path) -> list[dict]:
    env = {**os.environ, "ATDD_SCAN_ROOTS": json.dumps([str(root.resolve())])}
    p = subprocess.run([sys.executable, str(_CLI), "--impl", impl.name],
                       capture_output=True, text=True, env=env)
    assert p.returncode == 0, f"{impl.name} CLI failed: {p.stderr[-400:]}"
    return json.loads(p.stdout or "[]")


def _findings(rid: str) -> list[dict]:
    """Every finding for `rid` across its family's dirty fixtures, both layouts."""
    impl = _declared()[rid]
    mp = impl / "checks" / "_map.json"
    roots = []
    if mp.is_file():
        for alias, mapped in json.loads(mp.read_text()).items():
            d = impl / "fixtures" / "dirty" / alias
            if d.is_dir():
                roots.append(d)
    if not roots:
        roots = [impl / "fixtures" / "dirty"]
    out = []
    for r in roots:
        out.extend(v for v in _scan(impl, r) if v["rule_id"] == rid)
    return out


@requires_bun
@pytest.mark.parametrize("rid", sorted(EXPECT), ids=list(sorted(EXPECT)))
def test_rule_names_its_actual_target(rid: str) -> None:
    want_file, want_subs, want_line = EXPECT[rid]
    hits = _findings(rid)
    assert hits, f"{rid} produced no finding on its dirty fixture"

    on_file = [h for h in hits if Path(h["file"]).name == want_file]
    assert on_file, (
        f"{rid} fired, but on {sorted({Path(h['file']).name for h in hits})} — "
        f"expected {want_file}")

    # EVIDENCE ONLY, deliberately. An earlier cut also accepted a match in
    # `source_line`, and a mutation test showed why that is worthless: the source
    # line of a complexity finding already contains the function name, so a detector
    # that reported the WRONG name in its evidence still passed. The evidence is the
    # sentence a human reads in a report; that is what must name the target.
    for sub in want_subs:
        assert any(sub in h["evidence"] for h in on_file), (
            f"{rid} evidence never names {sub!r}. Got: "
            + " | ".join(h["evidence"][:110] for h in on_file[:3]))

    if want_line is not None:
        assert any(h["line"] == want_line for h in on_file), (
            f"{rid} expected line {want_line}, got {sorted({h['line'] for h in on_file})}")


def test_every_rule_has_a_precision_expectation() -> None:
    """A rule added without a precision row fails here rather than sliding in uncovered."""
    declared = set(_declared())
    missing = declared - set(EXPECT)
    stale = set(EXPECT) - declared
    assert not missing, f"rules with no precision expectation: {sorted(missing)}"
    assert not stale, f"expectations for rules that no longer exist: {sorted(stale)}"
