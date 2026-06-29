"""cmux RPC invoker — broken-pipe-resilient calls to the cmux socket (#12 spawn reliability).

Live 2026-06-22: ``atdd coach <fixture>`` reproducibly fails INIT->PLANNED with
``cmux list-panes failed (exit 1): Failed to write to socket (Broken pipe, errno 32)``
on all retries, while a DIRECT ``cmux list-panes`` succeeds — the coach's cmux
invocation broken-pipes on a stale socket connection where a fresh call does not. The
worker never launches, so there is nothing to mediate.

A broken pipe to the cmux socket is a TRANSIENT fault, not a real command failure: the
fix is to retry with a FRESH invocation + backoff, and to do so ONLY for the broken-pipe
signature — a genuine command error (bad args, cmux not running) must surface immediately,
never be masked by retries.

Self-contained: stdlib only; the command ``runner`` and ``sleep`` are injectable so the
retry/backoff behaviour is exercisable without a cmux binary or real wall-clock waits.
"""
from __future__ import annotations

import subprocess
import time
from dataclasses import dataclass
from typing import Callable, List, Optional, Sequence, Tuple

CONTRACT_VERSION = "1.0.0"
DEFAULT_RETRIES = 3

# A command runner returns (returncode, stdout, stderr). Injectable for conformance.
Runner = Callable[[Sequence[str]], Tuple[int, str, str]]


@dataclass(frozen=True)
class CmuxCallResult:
    """Outcome of a (possibly retried) cmux invocation."""

    ok: bool
    returncode: int
    stdout: str
    stderr: str
    attempts: int


def is_broken_pipe(returncode: int, stderr: str) -> bool:
    """True for the cmux stale-socket broken-pipe signature (the only retryable fault).

    Matches the live error ``Failed to write to socket (Broken pipe, errno 32)`` so a
    transient socket fault is retried while a genuine command error is not.
    """
    if returncode == 0:
        return False
    text = (stderr or "").lower()
    return "broken pipe" in text or "errno 32" in text


def _subprocess_runner(argv: Sequence[str]) -> Tuple[int, str, str]:
    proc = subprocess.run(  # noqa: S603 — caller-supplied argv, no shell
        list(argv),
        capture_output=True,
        text=True,
    )
    return proc.returncode, proc.stdout or "", proc.stderr or ""


def cmux_call(
    argv: Sequence[str],
    *,
    runner: Optional[Runner] = None,
    retries: int = DEFAULT_RETRIES,
    sleep: Callable[[float], None] = time.sleep,
    backoff: float = 0.1,
) -> CmuxCallResult:
    """Invoke a cmux command, retrying ONLY the transient broken-pipe fault.

    ``runner`` (default: subprocess) runs the argv fresh each attempt — a fresh
    invocation is the point, since the broken pipe is a stale connection. A broken-pipe
    result triggers up to ``retries`` further attempts with linear ``backoff`` between
    them; any other non-zero exit (a real error) is returned immediately, unretried.
    """
    runner = runner or _subprocess_runner
    last: Tuple[int, str, str] = (0, "", "")
    attempts = 0
    for attempt in range(retries + 1):
        attempts = attempt + 1
        returncode, stdout, stderr = runner(argv)
        last = (returncode, stdout, stderr)
        if returncode == 0:
            return CmuxCallResult(True, returncode, stdout, stderr, attempts)
        if not is_broken_pipe(returncode, stderr):
            # A genuine command error — surface it immediately, never mask with retries.
            return CmuxCallResult(False, returncode, stdout, stderr, attempts)
        if attempt < retries:
            sleep(backoff * (attempt + 1))
    returncode, stdout, stderr = last
    return CmuxCallResult(False, returncode, stdout, stderr, attempts)


__all__ = ["CmuxCallResult", "Runner", "cmux_call", "is_broken_pipe"]
