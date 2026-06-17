"""Orchestration half of the cmux-claude provider contract (contract_version 1.0.0).

The ``orchestration.agent-session`` capability: manage the lifecycle of an agent
session — spawn the agent process, deliver a prompt to it, collect its response,
and signal it (terminate). In production the agent is a Claude worker launched
inside a cmux pane; here the launch COMMAND is injectable so the mechanics are
exercisable with any process. The provider owns session lifecycle, not the
agent's behavior.

Self-contained: stdlib subprocess only, no cmux/Claude binary required.
"""
from __future__ import annotations

import signal
import subprocess
from dataclasses import dataclass

CONTRACT_VERSION = "1.0.0"
DEFAULT_TIMEOUT = 30.0


@dataclass(frozen=True)
class SessionResult:
    """Outcome of an agent session: what the agent emitted + how it exited."""

    output: str
    exit_code: int
    timed_out: bool = False

    @property
    def delivered(self) -> bool:
        """True when the prompt was delivered and the agent responded cleanly."""
        return not self.timed_out and self.exit_code == 0


def open_session(
    command: list[str],
    *,
    prompt: str | None = None,
    timeout: float = DEFAULT_TIMEOUT,
) -> SessionResult:
    """Spawn an agent process, deliver ``prompt`` to its stdin, collect output.

    ``command`` is the launch argv (production: the cmux+claude launch; here: any
    process). A timeout terminates the session and is reported, never raised past
    this boundary.
    """
    proc = subprocess.Popen(  # noqa: S603 — caller-supplied argv, no shell
        command,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    try:
        out, _ = proc.communicate(input=prompt, timeout=timeout)
        return SessionResult(output=out or "", exit_code=proc.returncode)
    except subprocess.TimeoutExpired:
        signal_session(proc)
        out, _ = proc.communicate()
        return SessionResult(output=out or "", exit_code=proc.returncode, timed_out=True)


def signal_session(proc: subprocess.Popen, sig: int = signal.SIGTERM) -> None:
    """Signal a running session (default SIGTERM → terminate); no-op if exited."""
    if proc.poll() is None:
        proc.send_signal(sig)
