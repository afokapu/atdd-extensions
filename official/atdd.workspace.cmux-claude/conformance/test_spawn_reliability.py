"""Spawn-reliability conformance for atdd.workspace.cmux-claude (#12).

Proves the provider treats a cmux broken-pipe (the live ``Failed to write to socket
(Broken pipe, errno 32)`` stale-socket fault) as TRANSIENT — retried with a fresh
invocation + backoff — while a genuine command error is surfaced immediately, never
masked by retries. A REAL run: an injected runner stands in for the cmux binary per the
provider's self-contained contract; ``sleep`` is injected so no wall-clock time passes.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "adapter"))

import cmux_rpc as rpc  # noqa: E402

_BROKEN_PIPE = (1, "", "cmux: Failed to write to socket (Broken pipe, errno 32)")
_OK = (0, "pane-1\npane-2", "")
_REAL_ERROR = (2, "", "cmux: unknown command 'list-panez'")


def _scripted_runner(results):
    """A runner that yields successive scripted (rc, out, err) tuples per call."""
    seq = iter(results)

    def run(_argv):
        return next(seq)

    return run


def test_broken_pipe_is_retried_until_it_succeeds() -> None:
    # broken-pipe twice, then a fresh invocation succeeds
    runner = _scripted_runner([_BROKEN_PIPE, _BROKEN_PIPE, _OK])
    result = rpc.cmux_call(["cmux", "list-panes"], runner=runner, sleep=lambda _s: None)
    assert result.ok is True
    assert result.attempts == 3
    assert "pane-1" in result.stdout


def test_first_attempt_success_does_not_retry() -> None:
    runner = _scripted_runner([_OK])
    result = rpc.cmux_call(["cmux", "list-panes"], runner=runner, sleep=lambda _s: None)
    assert result.ok is True
    assert result.attempts == 1


def test_persistent_broken_pipe_fails_after_retries() -> None:
    calls = {"n": 0}

    def always_broken(_argv):
        calls["n"] += 1
        return _BROKEN_PIPE

    result = rpc.cmux_call(
        ["cmux", "list-panes"], runner=always_broken, retries=3, sleep=lambda _s: None
    )
    assert result.ok is False
    assert result.attempts == 4  # initial + 3 retries
    assert calls["n"] == 4
    assert "broken pipe" in result.stderr.lower()


def test_real_error_is_not_retried() -> None:
    calls = {"n": 0}

    def real_error(_argv):
        calls["n"] += 1
        return _REAL_ERROR

    result = rpc.cmux_call(["cmux", "list-panez"], runner=real_error, sleep=lambda _s: None)
    assert result.ok is False
    assert result.attempts == 1  # surfaced immediately, never masked by retries
    assert calls["n"] == 1


def test_backoff_is_applied_between_broken_pipe_retries() -> None:
    slept: list[float] = []
    runner = _scripted_runner([_BROKEN_PIPE, _BROKEN_PIPE, _OK])
    rpc.cmux_call(
        ["cmux", "list-panes"], runner=runner, sleep=slept.append, backoff=0.1
    )
    # one backoff per retry boundary (2 broken pipes -> 2 sleeps), strictly increasing
    assert slept == [0.1, 0.2]


def test_broken_pipe_signature_detection() -> None:
    assert rpc.is_broken_pipe(1, "Broken pipe, errno 32") is True
    assert rpc.is_broken_pipe(1, "errno 32") is True
    assert rpc.is_broken_pipe(0, "Broken pipe") is False  # success is never a fault
    assert rpc.is_broken_pipe(2, "unknown command") is False  # real error, not a pipe
