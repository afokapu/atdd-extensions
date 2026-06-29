"""Safety-escalation conformance for atdd.workspace.cmux-claude (#13, provider boundary).

The core safety REQUIREMENT — *dangerous ⇒ escalate, never auto-execute* — is owned and
unit/integration-tested in core; the cmux LIVE harness cannot induce a blocked dangerous
decision under auto-mode (#13's documented gap). This suite covers the provider-boundary
safety guarantee that IS hermetically provable: once a (dangerous) decision is escalated,
the adapter can NEVER report it auto-resolved/advanced — escalation is terminal, so a
dangerous decision that took the safe path cannot subsequently be silently auto-approved.

A REAL run over an on-disk command-feed; the session deliverer is injected per the
provider's self-contained contract.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "adapter"))

import decision_channel as dc  # noqa: E402
import feed as feed_mod  # noqa: E402

# A dangerous decision: a Bash command that must take the escalate path, never auto-run.
_DANGEROUS = {
    "request_id": "danger-1",
    "kind": "permissionRequest",
    "tool": "Bash",
    "tool_input": {"command": "rm -rf /", "description": "destructive"},
    "agent_id": "workstream-7",
    "options": [{"label": "Yes"}, {"label": "No"}],
}


def _adapter(tmp_path):
    feed = feed_mod.CommandFeed(tmp_path / "decisions.jsonl")
    feed.append(_DANGEROUS)
    # deliver returns True ("worker advanced") so any auto-approval WOULD show as advanced
    # — the safety property must hold even when the deliver mechanism itself succeeds.
    return dc.DecisionChannelAdapter(feed, deliver=lambda _p: True), feed


def test_escalated_dangerous_decision_cannot_be_auto_resolved(tmp_path):
    adapter, _ = _adapter(tmp_path)
    escalated = adapter.escalate("danger-1", reason="dangerous: rm -rf, unmediated")
    assert escalated["durable"] is True
    # an escalated decision is terminal — a later deliver_reply is refused, even with a
    # valid option and a deliver() that would otherwise report success.
    result = adapter.deliver_reply("danger-1", ["Yes"])
    assert result["advanced"] is False
    assert "danger-1" not in {d["request_id"] for d in adapter.surface_pending()}


def test_escalate_and_resolve_are_mutually_exclusive(tmp_path):
    adapter, feed = _adapter(tmp_path)
    adapter.escalate("danger-1", reason="dangerous")
    adapter.deliver_reply("danger-1", ["Yes"])  # must be a no-op (already terminal)
    statuses = [
        m.payload.get("status")
        for m in feed.poll(0)
        if m.payload.get("request_id") == "danger-1"
    ]
    # exactly one terminal mark, and it is the escalation — never a resolved entry too.
    assert "resolved" not in statuses
    assert statuses.count("escalated") == 1


def test_dangerous_decision_is_never_silently_advanced_without_escalation(tmp_path):
    adapter, _ = _adapter(tmp_path)
    # a non-matching / empty selection must never report success for a dangerous decision
    assert adapter.deliver_reply("danger-1", ["Maybe"])["advanced"] is False
    assert adapter.deliver_reply("danger-1", [])["advanced"] is False
    # still pending — neither auto-approved nor lost; the safe path remains available
    assert "danger-1" in {d["request_id"] for d in adapter.surface_pending()}
