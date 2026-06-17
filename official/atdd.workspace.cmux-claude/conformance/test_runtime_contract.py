"""Conformance suite for atdd.workspace.cmux-claude (contract_version 1.0.0).

A REAL run — not a stub: it round-trips a durable feed on disk and spawns an
actual subprocess as the agent, including the two-way channel (a feed message is
delivered into a session and the response appended back). No cmux binary and no
Claude API are required — the agent command is injected, per the provider's
``command_injectable`` contract.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "adapter"))

import feed as feed_mod  # noqa: E402
import session as session_mod  # noqa: E402

# A trivial, dependency-free stand-in agent: echo stdin back, prefixed.
_ECHO_AGENT = [sys.executable, "-c", "import sys;print('AGENT:'+sys.stdin.read().strip())"]


# ── transport.command-feed ────────────────────────────────────────────────────


def test_feed_appends_are_ordered_by_sequence(tmp_path: Path) -> None:
    fd = feed_mod.CommandFeed(tmp_path / "feed.jsonl")
    assert fd.append({"cmd": "a"}) == 1
    assert fd.append({"cmd": "b"}) == 2
    assert fd.append({"cmd": "c"}) == 3
    msgs = fd.poll(0)
    assert [m.seq for m in msgs] == [1, 2, 3]
    assert [m.payload["cmd"] for m in msgs] == ["a", "b", "c"]


def test_feed_poll_since_returns_only_newer(tmp_path: Path) -> None:
    fd = feed_mod.CommandFeed(tmp_path / "feed.jsonl")
    for c in "abc":
        fd.append({"cmd": c})
    newer = fd.poll(since=2)
    assert [m.seq for m in newer] == [3]


def test_feed_is_durable_across_reopen(tmp_path: Path) -> None:
    path = tmp_path / "feed.jsonl"
    feed_mod.CommandFeed(path).append({"cmd": "persisted"})
    # a fresh handle on the same path sees prior messages (survives a restart)
    reopened = feed_mod.CommandFeed(path)
    assert [m.payload["cmd"] for m in reopened.poll(0)] == ["persisted"]
    assert reopened.append({"cmd": "next"}) == 2


def test_poll_empty_feed_is_empty(tmp_path: Path) -> None:
    assert feed_mod.CommandFeed(tmp_path / "none.jsonl").poll(0) == []


# ── orchestration.agent-session ──────────────────────────────────────────────


def test_open_session_delivers_prompt_and_collects_output() -> None:
    res = session_mod.open_session(_ECHO_AGENT, prompt="hello world")
    assert res.delivered
    assert res.exit_code == 0
    assert "AGENT:hello world" in res.output


def test_session_timeout_is_reported_not_raised() -> None:
    sleeper = [sys.executable, "-c", "import time;time.sleep(5)"]
    res = session_mod.open_session(sleeper, prompt="", timeout=0.5)
    assert res.timed_out
    assert not res.delivered


# ── two-way channel: feed -> session -> feed ─────────────────────────────────


def test_feed_message_routes_through_session_and_back(tmp_path: Path) -> None:
    fd = feed_mod.CommandFeed(tmp_path / "feed.jsonl")
    fd.append({"role": "coach", "prompt": "do the thing"})

    # coach->worker: take the latest unread command and deliver it to an agent
    inbound = fd.poll(since=0)[-1]
    res = session_mod.open_session(_ECHO_AGENT, prompt=inbound.payload["prompt"])
    assert res.delivered

    # worker->coach: append the agent's response back onto the same feed
    seq = fd.append({"role": "worker", "response": res.output.strip()})
    assert seq == 2
    roundtrip = fd.poll(since=1)[-1]
    assert roundtrip.payload["role"] == "worker"
    assert "AGENT:do the thing" in roundtrip.payload["response"]
