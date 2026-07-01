"""End-to-end LIVE smoke — the launch composition against a REAL cmux (e012/l004/l005).

This is the addition the hermetic ``test_launch_composition.py`` pointed at: it drives
``launch_mediated_worker`` against the ACTUAL cmux this process runs under, closing the
three loops the standalone satisfiers could only cover in isolation:

  * l004 — under a live cmux surface the readiness probe reports LIVE, so the launch
    does NOT refuse; without a surface it refuses (covered hermetically + by the skip).
  * e012 — the spawn argv round-trips through the broken-pipe-resilient invoker against
    real cmux (a real spawn would launch a worker; here we assert the resilient invoker
    reaches cmux so the e012 hang — ``mediated == None`` after 603s — cannot recur from
    a stale-socket abort).
  * l005 — the scope filter is bound to this surface's workspace.

It SKIPS when not launched inside a cmux surface (``CMUX_SURFACE_ID`` unset), so CI and
non-cmux runs are unaffected; it runs for real when a live surface is present.

NOTE (cross-repo, #16): the FULL e012/l004/l005 closure — core dispatch calling this
composition instead of its bespoke spawn path — lands when core #1190 wires the
``DecisionChannel`` port to ``launch_mediated_worker``. Until then this smoke proves the
provider half end-to-end (real readiness + real cmux spawn round-trip + scoped channel);
the core wiring adds the worker-actually-proceeds assertion.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "adapter"))

import feed as feed_mod  # noqa: E402
import launch as launch_mod  # noqa: E402
import readiness as rd  # noqa: E402

pytestmark = pytest.mark.skipif(
    not os.environ.get("CMUX_SURFACE_ID"),
    reason="not under a live cmux surface (CMUX_SURFACE_ID unset) — e2e live smoke skipped",
)


def test_l004_live_surface_does_not_refuse(tmp_path: Path) -> None:
    # under a real live cmux surface the readiness probe is live, so a launch using a
    # no-op spawn must NOT refuse on the l004 firebreak.
    assert rd.cmux_channel_readiness(os.environ).live is True
    feed = feed_mod.CommandFeed(tmp_path / "f.jsonl")
    result = launch_mod.launch_mediated_worker(
        feed=feed,
        deliver=lambda _p: True,
        spawn_argv=["cmux", "list-pane-surfaces"],  # a benign, real cmux command
        workspace_id=os.environ["CMUX_SURFACE_ID"],
        resolve=lambda _item: None,
        # default readiness_probe + default subprocess runner: REAL cmux
    )
    assert result.ready is True, f"expected live channel, got: {result.reason!r}"


def test_e012_spawn_round_trips_real_cmux(tmp_path: Path) -> None:
    # the resilient invoker reaches real cmux: a benign command spawns/returns ok in a
    # bounded number of attempts (a stale-socket broken pipe would retry, never abort).
    feed = feed_mod.CommandFeed(tmp_path / "f.jsonl")
    result = launch_mod.launch_mediated_worker(
        feed=feed,
        deliver=lambda _p: True,
        spawn_argv=["cmux", "list-pane-surfaces"],
        workspace_id=os.environ["CMUX_SURFACE_ID"],
        resolve=lambda _item: None,
    )
    assert result.spawned is True, f"real cmux spawn failed: {result.spawn_stderr!r}"
    assert result.attempts >= 1
    assert result.channel is not None


def test_l005_channel_is_scoped_to_this_surface(tmp_path: Path) -> None:
    # a decision owned by a different workspace is excluded from this surface's channel.
    surface = os.environ["CMUX_SURFACE_ID"]
    feed = feed_mod.CommandFeed(tmp_path / "f.jsonl")
    feed.append(
        {
            "request_id": "r-other",
            "kind": "permission",
            "tool": "Bash",
            "tool_input": {"command": "ls"},
            "agent_id": "agent-x",
            "options": [{"label": "allow"}],
            "workspace": "some-other-workspace",
        }
    )
    result = launch_mod.launch_mediated_worker(
        feed=feed,
        deliver=lambda _p: True,
        spawn_argv=["cmux", "list-pane-surfaces"],
        workspace_id=surface,
        resolve=lambda item: item.get("workspace"),
    )
    surfaced = {d["request_id"] for d in result.channel.surface_pending()}
    assert "r-other" not in surfaced  # no cross-decide
