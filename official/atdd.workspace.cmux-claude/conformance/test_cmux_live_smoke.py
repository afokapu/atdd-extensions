"""LIVE provider smoke for atdd.workspace.cmux-claude — runs against a REAL cmux.

Unlike the hermetic conformance (injected env/runner), this exercises the cmux-specific
satisfiers against the ACTUAL cmux this process runs under. It SKIPS when not launched
inside a cmux surface (so CI and non-cmux runs are unaffected) and runs for real when
``CMUX_SURFACE_ID`` is set.

SCOPE: this proves the part the provider can verify WITHOUT core wiring — that the
readiness probe reports a real live cmux as live, and that the broken-pipe-resilient
invoker round-trips a real ``cmux`` command. It does NOT close the full e012/l004/l005
loop end-to-end — that needs the core dispatch to call these satisfiers (afokapu/atdd#1190
+ the runtime-move #16). When core wires it, the end-to-end live smoke is the addition.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "adapter"))

import cmux_rpc  # noqa: E402
import readiness as rd  # noqa: E402

pytestmark = pytest.mark.skipif(
    not os.environ.get("CMUX_SURFACE_ID"),
    reason="not under a live cmux surface (CMUX_SURFACE_ID unset) — live smoke skipped",
)


def test_readiness_reports_real_cmux_as_live() -> None:
    # against the ACTUAL cmux env: a real surface id + a reachable real socket
    result = rd.cmux_channel_readiness(os.environ)
    assert result.live is True, f"expected live cmux, got reason: {result.reason!r}"


def test_cmux_call_round_trips_a_real_cmux_command() -> None:
    # the resilient invoker against a real cmux RPC — proves the happy path live and
    # that a real cmux call returns through the wrapper (broken-pipe retry is exercised
    # only if cmux actually broken-pipes; the happy path must succeed regardless)
    result = cmux_rpc.cmux_call(["cmux", "list-pane-surfaces"])
    assert result.ok is True, f"cmux call failed (rc={result.returncode}): {result.stderr!r}"
    assert result.stdout != ""
