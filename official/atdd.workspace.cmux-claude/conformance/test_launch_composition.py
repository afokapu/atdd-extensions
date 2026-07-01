"""Launch-composition conformance — the #12 satisfiers wired as a production launch.

Proves the cmux provider's ``launch_mediated_worker`` composes the four standalone
satisfiers into the order that closes the three live-blocked loops, WITHOUT a live
cmux (every collaborator injected):

  * l004 — a not-live channel REFUSES to spawn (no unmediated worker is ever launched).
  * e012 — the spawn rides the broken-pipe-resilient invoker, so a stale-socket hiccup
    retries instead of aborting; a genuine cmux error surfaces as a failed launch.
  * l005 — the surfaced decisions are scoped to the launch's workspace (no cross-decide,
    no silent drop of an own decision).

This is the hermetic half; ``test_e012_l004_l005_e2e.py`` exercises the same composition
against a REAL cmux when run under a live surface.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "adapter"))

import feed as feed_mod  # noqa: E402
import launch as launch_mod  # noqa: E402
from readiness import ChannelReadiness  # noqa: E402


def _live():
    return ChannelReadiness(live=True)


def _not_live(reason="hook down"):
    return ChannelReadiness(live=False, reason=reason)


def _ok_runner(_argv):
    return (0, "spawned", "")


def _resolve_none(_item):
    return None


# ── l004: a not-live channel never spawns ─────────────────────────────────────────


def test_not_live_refuses_to_spawn(tmp_path):
    spawned_argvs = []

    def spy_runner(argv):
        spawned_argvs.append(argv)
        return (0, "", "")

    feed = feed_mod.CommandFeed(tmp_path / "f.jsonl")
    result = launch_mod.launch_mediated_worker(
        feed=feed,
        deliver=lambda _p: True,
        spawn_argv=["cmux", "spawn", "worker"],
        workspace_id="ws-A",
        resolve=_resolve_none,
        readiness_probe=lambda: _not_live("CMUX_SURFACE_ID not set"),
        runner=spy_runner,
    )
    assert result.ready is False
    assert "CMUX_SURFACE_ID" in result.reason
    assert result.spawned is False
    assert result.channel is None
    assert spawned_argvs == []  # the firebreak: not a single spawn attempt


# ── e012: spawn rides the broken-pipe-resilient invoker ───────────────────────────


def test_transient_broken_pipe_retries_then_spawns(tmp_path):
    attempts = {"n": 0}

    def flaky_runner(_argv):
        attempts["n"] += 1
        if attempts["n"] == 1:
            return (1, "", "Failed to write to socket (Broken pipe, errno 32)")
        return (0, "spawned", "")

    feed = feed_mod.CommandFeed(tmp_path / "f.jsonl")
    result = launch_mod.launch_mediated_worker(
        feed=feed,
        deliver=lambda _p: True,
        spawn_argv=["cmux", "spawn", "worker"],
        workspace_id="ws-A",
        resolve=_resolve_none,
        readiness_probe=_live,
        runner=flaky_runner,
    )
    assert result.ready is True
    assert result.spawned is True
    assert result.attempts == 2  # one broken pipe, then success
    assert result.channel is not None


def test_genuine_spawn_error_surfaces_not_masked(tmp_path):
    def bad_runner(_argv):
        return (2, "", "unknown command 'spwan'")

    feed = feed_mod.CommandFeed(tmp_path / "f.jsonl")
    result = launch_mod.launch_mediated_worker(
        feed=feed,
        deliver=lambda _p: True,
        spawn_argv=["cmux", "spwan"],
        workspace_id="ws-A",
        resolve=_resolve_none,
        readiness_probe=_live,
        runner=bad_runner,
    )
    assert result.ready is True  # channel was live...
    assert result.spawned is False  # ...but the spawn genuinely failed
    assert result.attempts == 1  # a real error is not retried
    assert "unknown command" in result.spawn_stderr
    assert result.channel is None


# ── l005: surfaced decisions are scoped to the launch's workspace ─────────────────


def _decision(rid, agent_id, workspace=None):
    payload = {
        "request_id": rid,
        "kind": "permission",
        "tool": "Bash",
        "tool_input": {"command": "ls"},
        "agent_id": agent_id,
        "options": [{"label": "allow"}, {"label": "deny"}],
    }
    if workspace is not None:
        payload["workspace"] = workspace
    return payload


def test_scope_excludes_other_workspace_keeps_own_and_unresolved(tmp_path):
    feed = feed_mod.CommandFeed(tmp_path / "f.jsonl")
    feed.append(_decision("r-own", "agent-1", workspace="ws-A"))
    feed.append(_decision("r-other", "agent-2", workspace="ws-B"))
    feed.append(_decision("r-unknown", "agent-3"))  # owner unresolvable

    def resolve(item):
        return item.get("workspace")  # None when absent -> permissive keep

    result = launch_mod.launch_mediated_worker(
        feed=feed,
        deliver=lambda _p: True,
        spawn_argv=["cmux", "spawn", "worker"],
        workspace_id="ws-A",
        resolve=resolve,
        readiness_probe=_live,
        runner=_ok_runner,
    )
    assert result.spawned is True
    surfaced = {d["request_id"] for d in result.channel.surface_pending()}
    assert surfaced == {"r-own", "r-unknown"}  # own + permissive-degrade; ws-B excluded


# ── e012 full round-trip: surface -> reply advances -> resolved ───────────────────


def test_end_to_end_round_trip_through_composition(tmp_path):
    feed = feed_mod.CommandFeed(tmp_path / "f.jsonl")
    feed.append(_decision("r-1", "agent-1", workspace="ws-A"))

    delivered = []

    def deliver(prompt):
        delivered.append(prompt)
        return True  # worker advanced

    result = launch_mod.launch_mediated_worker(
        feed=feed,
        deliver=deliver,
        spawn_argv=["cmux", "spawn", "worker"],
        workspace_id="ws-A",
        resolve=lambda item: item.get("workspace"),
        readiness_probe=_live,
        runner=_ok_runner,
    )
    channel = result.channel
    assert [d["request_id"] for d in channel.surface_pending()] == ["r-1"]

    reply = channel.deliver_reply("r-1", ["allow"])
    assert reply["advanced"] is True
    assert delivered == ["r-1:allow"]
    # once resolved it is no longer pending (terminal status appended to the feed)
    assert channel.surface_pending() == []
