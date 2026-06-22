"""Readiness conformance for atdd.workspace.cmux-claude (the core readiness obligation).

Proves the cmux provider satisfies core's ``DecisionChannel.readiness()`` obligation:
report the channel LIVE iff the cmux wrapper will inject its ``PermissionRequest -> feed``
hook (``CMUX_SURFACE_ID`` + a reachable socket), and NOT-live (with an actionable reason)
otherwise — the signal the core dispatch rule uses to refuse/escalate instead of spawning
an unmediated worker. A REAL run: the live case binds an actual unix socket on disk; the
env is injected per the provider's self-contained contract (no live cmux required).
"""
from __future__ import annotations

import shutil
import socket
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "adapter"))

import decision_channel as dc  # noqa: E402
import feed as feed_mod  # noqa: E402
import readiness as rd  # noqa: E402


# ── cmux env probe: live iff surface id + a reachable socket ──────────────────────


def test_readiness_live_when_surface_id_and_live_socket() -> None:
    # macOS caps AF_UNIX paths at ~104 chars, so bind under a short /tmp dir rather
    # than the (long) pytest tmp_path.
    short_dir = tempfile.mkdtemp(dir="/tmp")
    sock_path = Path(short_dir) / "c.sock"
    srv = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    srv.bind(str(sock_path))  # a real on-disk socket
    try:
        env = {"CMUX_SURFACE_ID": "surface-7", "CMUX_SOCKET_PATH": str(sock_path)}
        result = rd.cmux_channel_readiness(env)
        assert result.live is True
        assert result.reason == ""
    finally:
        srv.close()
        shutil.rmtree(short_dir, ignore_errors=True)


def test_readiness_not_live_names_missing_surface_id() -> None:
    result = rd.cmux_channel_readiness({})
    assert result.live is False
    assert "CMUX_SURFACE_ID" in result.reason


def test_readiness_not_live_names_missing_socket() -> None:
    result = rd.cmux_channel_readiness({"CMUX_SURFACE_ID": "surface-7"})
    assert result.live is False
    assert "CMUX_SOCKET_PATH" in result.reason


def test_readiness_not_live_when_socket_path_unreachable(tmp_path: Path) -> None:
    env = {"CMUX_SURFACE_ID": "surface-7", "CMUX_SOCKET_PATH": str(tmp_path / "absent.sock")}
    result = rd.cmux_channel_readiness(env)
    assert result.live is False
    assert "not reachable" in result.reason


def test_readiness_not_live_when_path_is_not_a_socket(tmp_path: Path) -> None:
    plain = tmp_path / "plain.file"
    plain.write_text("not a socket")
    env = {"CMUX_SURFACE_ID": "surface-7", "CMUX_SOCKET_PATH": str(plain)}
    result = rd.cmux_channel_readiness(env)
    assert result.live is False
    assert "not a socket" in result.reason


# ── the adapter exposes readiness() and delegates to the injected probe ───────────


def test_adapter_readiness_delegates_to_injected_probe(tmp_path: Path) -> None:
    fd = feed_mod.CommandFeed(tmp_path / "feed.jsonl")
    adapter = dc.DecisionChannelAdapter(
        fd,
        deliver=lambda _prompt: True,
        readiness_probe=lambda: rd.ChannelReadiness(live=False, reason="stub: hook down"),
    )
    result = adapter.readiness()
    assert result.live is False
    assert result.reason == "stub: hook down"


def test_adapter_readiness_live_signal_passes_through(tmp_path: Path) -> None:
    fd = feed_mod.CommandFeed(tmp_path / "feed.jsonl")
    adapter = dc.DecisionChannelAdapter(
        fd,
        deliver=lambda _prompt: True,
        readiness_probe=lambda: rd.ChannelReadiness(live=True),
    )
    assert adapter.readiness().live is True
