"""Feed-daemon conformance for atdd.workspace.cmux-claude (#16 / ext#29).

Proves the provider holds the runtime SUPERVISION half of the two-way channel: the
continuous loop that drives surfaced decisions to resolution or escalation. It runs
the REAL ``FeedDaemon`` over the REAL ``DecisionChannelAdapter`` + an on-disk
``CommandFeed`` and REAL durable JSONL ledgers — only the decide BRAIN is injected
(it is core policy the provider must NOT own), matching the core/provider split.

The runtime properties asserted here are the ones the daemon exists to guarantee:
  * idempotency — a decision handled once is never re-handled (within a run AND
    across a restart, via ledger re-hydration).
  * escalation is NEVER auto-answered — escalate verdicts, decide failures, and a
    worker that would not advance all record a durable escalation + deliver nothing.
  * single-instance — ``run_forever`` refuses to start behind a held lock.

CROSS-REPO CONTRACT: the decision payload field names are the contract with core's
``DecisionRequest``; the daemon carries them without importing core.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "adapter"))

import daemon as daemon_mod  # noqa: E402
import decision_channel as dc  # noqa: E402
import durable as durable_mod  # noqa: E402
import feed as feed_mod  # noqa: E402

Decision = daemon_mod.Decision


_PERMISSION = {
    "request_id": "req-1",
    "kind": "permissionRequest",
    "tool": "Bash",
    "tool_input": {"command": "git push", "description": "push branch"},
    "agent_id": "workstream-7",
    "options": [{"label": "Yes"}, {"label": "No"}],
}
_QUESTION = {
    "request_id": "req-2",
    "kind": "question",
    "tool": "AskUserQuestion",
    "tool_input": {},
    "agent_id": "workstream-7",
    "options": [{"label": "Blue"}, {"label": "Green"}],
    "prompt": "Which color?",
    "multi_select": False,
}


def _always_advances(_prompt: str) -> bool:
    """A worker that always advances — so 'delivered' == 'advanced'."""
    return True


def _never_advances(_prompt: str) -> bool:
    """A stuck worker: the reply is delivered but the worker never advances."""
    return False


def _build(tmp_path, *, deliver=_always_advances, decisions=(_PERMISSION, _QUESTION)):
    feed = feed_mod.CommandFeed(tmp_path / "decisions.jsonl")
    for d in decisions:
        feed.append(d)
    channel = dc.DecisionChannelAdapter(feed, deliver=deliver)
    verdicts = durable_mod.JsonlLedger(tmp_path / "verdicts.jsonl")
    escalations = durable_mod.JsonlLedger(tmp_path / "escalations.jsonl")
    return feed, channel, verdicts, escalations


def _daemon(channel, verdicts, escalations, *, decide, answered=None):
    return daemon_mod.FeedDaemon(
        channel=channel,
        decide=decide,
        verdict_ledger=verdicts,
        escalation_ledger=escalations,
        answered=answered,
    )


# ── deliver path: auto-answer resolves + records a durable verdict ───────────────


def test_tick_delivers_and_records_verdict(tmp_path):
    feed, channel, verdicts, escalations = _build(tmp_path)
    d = _daemon(channel, verdicts, escalations, decide=lambda dec: Decision.deliver(["Yes"] if dec["request_id"] == "req-1" else ["Blue"]))
    outcomes = d.tick()
    assert {o.status for o in outcomes} == {"resolved"}
    # both decisions resolved and no longer surfaced
    assert channel.surface_pending() == []
    # verdicts recorded durably; escalation ledger untouched
    assert durable_mod.read_request_ids(verdicts.path) == {"req-1", "req-2"}
    assert durable_mod.read_request_ids(escalations.path) == set()


# ── escalation is NEVER auto-answered (headline safety property) ─────────────────


def test_escalate_verdict_records_escalation_and_delivers_nothing(tmp_path):
    delivered_prompts = []

    def _spy_deliver(prompt: str) -> bool:
        delivered_prompts.append(prompt)
        return True

    feed, channel, verdicts, escalations = _build(tmp_path, deliver=_spy_deliver)
    d = _daemon(channel, verdicts, escalations, decide=lambda dec: Decision.escalate("dangerous: unmediated"))
    outcomes = d.tick()
    assert {o.status for o in outcomes} == {"escalated"}
    # NOTHING was delivered into a worker session
    assert delivered_prompts == []
    # escalations recorded durably; no verdicts
    assert durable_mod.read_request_ids(escalations.path) == {"req-1", "req-2"}
    assert durable_mod.read_request_ids(verdicts.path) == set()


def test_decide_failure_escalates_and_continues(tmp_path):
    feed, channel, verdicts, escalations = _build(tmp_path)

    def _boom(dec):
        if dec["request_id"] == "req-1":
            raise RuntimeError("claude -p died in detached daemon")
        return Decision.deliver(["Blue"])

    d = _daemon(channel, verdicts, escalations, decide=_boom)
    outcomes = d.tick()
    by_id = {o.request_id: o for o in outcomes}
    # the failed item escalated (not swallowed); the loop kept going and resolved req-2
    assert by_id["req-1"].status == "escalated"
    assert by_id["req-1"].reason == daemon_mod.CAUSE_DECIDE_FAILED
    assert by_id["req-2"].status == "resolved"
    assert durable_mod.read_request_ids(escalations.path) == {"req-1"}
    assert durable_mod.read_request_ids(verdicts.path) == {"req-2"}


def test_stuck_worker_escalates_never_claims_delivered(tmp_path):
    # A valid selection, but the worker never advances → must escalate, not record a verdict.
    feed, channel, verdicts, escalations = _build(tmp_path, deliver=_never_advances, decisions=(_PERMISSION,))
    d = _daemon(channel, verdicts, escalations, decide=lambda dec: Decision.deliver(["Yes"]))
    outcomes = d.tick()
    assert outcomes[0].status == "escalated"
    assert outcomes[0].reason == daemon_mod.CAUSE_WORKER_STUCK
    assert durable_mod.read_request_ids(verdicts.path) == set()
    assert durable_mod.read_request_ids(escalations.path) == {"req-1"}


def test_malformed_decision_escalates(tmp_path):
    feed, channel, verdicts, escalations = _build(tmp_path, decisions=(_PERMISSION,))
    d = _daemon(channel, verdicts, escalations, decide=lambda dec: Decision())  # neither arm
    outcomes = d.tick()
    assert outcomes[0].status == "escalated"
    assert durable_mod.read_request_ids(escalations.path) == {"req-1"}


# ── idempotency: within a run and across a restart ───────────────────────────────


def test_second_tick_is_idempotent(tmp_path):
    calls = []
    feed, channel, verdicts, escalations = _build(tmp_path)

    def _count(dec):
        calls.append(dec["request_id"])
        return Decision.deliver(["Yes"] if dec["request_id"] == "req-1" else ["Blue"])

    d = _daemon(channel, verdicts, escalations, decide=_count)
    d.tick()
    d.tick()  # nothing new to do
    assert sorted(calls) == ["req-1", "req-2"]  # each decided exactly once


def test_restart_rehydrates_answered_set_from_ledgers(tmp_path):
    # First daemon resolves req-1 and escalates req-2, then "restarts".
    feed, channel, verdicts, escalations = _build(tmp_path)
    d1 = _daemon(
        channel, verdicts, escalations,
        decide=lambda dec: Decision.deliver(["Yes"]) if dec["request_id"] == "req-1" else Decision.escalate("needs human"),
    )
    d1.tick()

    # A fresh process: re-hydrate the answered-set from the durable ledgers.
    calls = []

    def _count(dec):
        calls.append(dec["request_id"])
        return Decision.deliver(["Yes"])

    seeded = daemon_mod.AnsweredSet(durable_mod.read_request_ids(verdicts.path, escalations.path))
    # reopen the channel over the same feed file (escalated req-2 is already terminal)
    channel2 = dc.DecisionChannelAdapter(feed_mod.CommandFeed(tmp_path / "decisions.jsonl"), deliver=_always_advances)
    d2 = _daemon(channel2, verdicts, escalations, decide=_count, answered=seeded)
    d2.tick()
    assert calls == []  # both already handled before the restart — nothing re-decided


# ── single-instance guard ────────────────────────────────────────────────────────


def test_run_forever_refuses_behind_held_lock(tmp_path):
    import pytest

    feed, channel, verdicts, escalations = _build(tmp_path, decisions=())
    lock = daemon_mod.PidfileLock(tmp_path / "daemon.pid")
    assert lock.acquire() is True  # a first holder owns the lock
    d = daemon_mod.FeedDaemon(
        channel=channel,
        decide=lambda dec: Decision.escalate("unused"),
        verdict_ledger=verdicts,
        escalation_ledger=escalations,
        lock=daemon_mod.PidfileLock(tmp_path / "daemon.pid"),
    )
    with pytest.raises(daemon_mod.SingleInstanceError):
        d.run_forever()


def test_run_forever_stops_on_signal_and_releases_lock(tmp_path):
    # A stop that is already set → the loop ticks zero times and exits cleanly,
    # releasing the lock (a second acquire must then succeed).
    feed, channel, verdicts, escalations = _build(tmp_path, decisions=())
    stop = daemon_mod.SignalStop()
    stop.set()
    lock = daemon_mod.PidfileLock(tmp_path / "daemon.pid")
    d = daemon_mod.FeedDaemon(
        channel=channel,
        decide=lambda dec: Decision.escalate("unused"),
        verdict_ledger=verdicts,
        escalation_ledger=escalations,
        stop=stop,
        lock=lock,
    )
    d.run_forever()
    # lock released in finally → a fresh holder can take it
    assert daemon_mod.PidfileLock(tmp_path / "daemon.pid").acquire() is True
