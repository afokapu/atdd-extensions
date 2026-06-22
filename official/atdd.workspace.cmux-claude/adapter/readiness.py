"""Channel-readiness satisfier for atdd.workspace.cmux-claude (contract_version 1.0.0).

Core states the agnostic obligation (``atdd.coach.decision_channel``): a
``DecisionChannel`` MUST report whether it is live, and a dispatch MUST refuse or
escalate a not-live channel before relying on mediation — the transport-agnostic
generalization of the (dead) ``assert_dispatch_feed_hook_active`` gate. This module
is the cmux SATISFIER of that obligation: it reports the channel live iff the cmux
Claude wrapper will inject its ``PermissionRequest -> 'cmux hooks feed'`` hook for the
worker, which requires the worker to run under the wrapper with ``CMUX_SURFACE_ID``
set and a reachable cmux socket. Without both, a spawned worker's decisions never
reach the Feed and it hangs unmediated (live 2026-06-22: l004 — 202s, no
``permissionRequest``; e012 — ``mediated == None`` after 603s).

CROSS-REPO CONTRACT: ``ChannelReadiness{live: bool, reason: str}`` mirrors core's
``ChannelReadiness`` by FIELD NAME. The provider imports nothing from core; keep the
field names in sync.

Self-contained: stdlib only (``os`` + ``stat``); the environment is injectable so the
probe is exercisable without a live cmux.
"""
from __future__ import annotations

import os
import stat
from dataclasses import dataclass
from typing import Mapping, Optional

CONTRACT_VERSION = "1.0.0"


@dataclass(frozen=True)
class ChannelReadiness:
    """Whether the decision channel is live, and why-not when it is not.

    ``live`` is the core requirement signal: a not-live channel MUST cause dispatch to
    refuse/escalate rather than spawn an unmediated worker. ``reason`` names the first
    missing precondition so an operator (or the escalation) gets an actionable cause
    instead of a silent 603s hang.
    """

    live: bool
    reason: str = ""


def cmux_channel_readiness(env: Optional[Mapping[str, str]] = None) -> ChannelReadiness:
    """Live iff ``CMUX_SURFACE_ID`` is set and the cmux socket path is a live socket.

    The cmux Claude wrapper injects its ``PermissionRequest -> feed`` hook only when the
    worker runs under it with ``CMUX_SURFACE_ID`` set and a reachable socket. We check
    both preconditions and name the first that is missing, so a non-publishing launch is
    detected loudly instead of looking falsely healthy.
    """
    env = env if env is not None else os.environ
    surface_id = env.get("CMUX_SURFACE_ID")
    if not surface_id:
        return ChannelReadiness(
            live=False,
            reason="CMUX_SURFACE_ID not set (worker is not running under a cmux surface)",
        )
    socket_path = env.get("CMUX_SOCKET_PATH")
    if not socket_path:
        return ChannelReadiness(
            live=False,
            reason="CMUX_SOCKET_PATH not set (no cmux socket to publish decisions to)",
        )
    try:
        mode = os.stat(socket_path).st_mode
    except OSError as exc:
        return ChannelReadiness(
            live=False,
            reason=f"CMUX_SOCKET_PATH {socket_path!r} not reachable: {exc}",
        )
    if not stat.S_ISSOCK(mode):
        return ChannelReadiness(
            live=False,
            reason=f"CMUX_SOCKET_PATH {socket_path!r} is not a socket",
        )
    return ChannelReadiness(live=True)


__all__ = ["ChannelReadiness", "cmux_channel_readiness"]
