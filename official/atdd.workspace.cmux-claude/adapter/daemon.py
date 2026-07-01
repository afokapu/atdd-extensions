"""The feed daemon: the continuous supervision loop of the cmux-claude runtime.

This is the workspace-runtime "hub" the migration analysis (§4) puts in the
provider: a loop that polls the decision channel and, for each fresh blocked
decision, drives it to resolution or escalation — under a single-instance lock,
until a stop signal fires. It is pure TRANSPORT + SUPERVISION.

The decide/escalate BRAIN is NOT here. Per the core/provider split (analysis §2,
``bridge_cmux_feed``/``mediate_decision`` are SPLIT), the policy "which reply, or
escalate" is a CORE requirement. So the daemon takes ``decide`` as an INJECTED
callable and never imports it — the same firebreak the import-discipline
conformance enforces (no ``import atdd.*``). The daemon only guarantees the
runtime properties around that policy:

  * idempotency — a request_id answered/escalated once is never acted on twice,
    across a restart too (the answered-set is re-hydrated from the durable ledgers).
  * escalation is NEVER auto-answered — an escalate decision (or a decide failure,
    or a worker that would not advance) is recorded durably AND loudly logged, and
    NO reply is delivered. This is the headline safety property.
  * single-instance — ``run_forever`` refuses to start if another daemon holds the
    lock, so the same feed is never answered by two loops.
  * graceful stop — the loop checks the stop signal between ticks and releases the
    lock in a ``finally`` so a SIGINT/SIGTERM never wedges it.

Self-contained: stdlib only (os/signal/threading/time/logging), no cmux/Claude
binary and no core import. The decision channel it drives is duck-typed on the
``DecisionChannelAdapter`` surface (``surface_pending`` / ``deliver_reply`` /
``escalate``), so the loop is exercisable with any channel that honors it.
"""
from __future__ import annotations

import logging
import os
import signal
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Iterable, List, Mapping, Optional, Protocol, Sequence, Set

_LOG = logging.getLogger("atdd.workspace.cmux_claude.daemon")

# Causes recorded on an escalation the daemon raises itself (the injected decide
# brain owns the cause for the decisions IT escalates).
CAUSE_DECIDE_FAILED = "decide_failed"
CAUSE_WORKER_STUCK = "worker_stuck"


# ── the injected decide brain's result ──────────────────────────────────────────


@dataclass(frozen=True)
class Decision:
    """A decide-brain verdict for one surfaced decision: deliver a reply OR escalate.

    Exactly one arm is meaningful. Build with the constructors so intent is explicit
    and a malformed both-arms/neither-arm decision is caught as an escalation, never
    a silent auto-answer.
    """

    selection: Optional[Sequence[str]] = None
    escalate_reason: Optional[str] = None

    @classmethod
    def deliver(cls, selection: Sequence[str]) -> "Decision":
        """Auto-answer: SELECT + SUBMIT these option labels so the worker advances."""
        return cls(selection=list(selection))

    @classmethod
    def escalate(cls, reason: str) -> "Decision":
        """Human-required: do NOT auto-answer; record a durable escalation."""
        return cls(escalate_reason=reason)

    @property
    def is_escalation(self) -> bool:
        return self.escalate_reason is not None

    @property
    def is_deliver(self) -> bool:
        return self.selection is not None and self.escalate_reason is None


@dataclass(frozen=True)
class FeedOutcome:
    """What the loop did with one decision this tick (for tests + audit)."""

    request_id: str
    status: str  # "resolved" | "escalated"
    reason: Optional[str] = None


# ── ports (duck-typed; production impls below) ──────────────────────────────────


class Ledger(Protocol):
    """A durable audit sink — see ``durable.JsonlLedger``."""

    def record(self, entry: Mapping[str, Any]) -> None: ...


class Sleeper(Protocol):
    """Paces the poll loop; injected so tests stay instant."""

    def sleep(self, seconds: float) -> None: ...


class Lock(Protocol):
    """Single-instance guard: ``acquire()`` is False when a live holder owns it."""

    def acquire(self) -> bool: ...

    def release(self) -> None: ...


class StopSignal(Protocol):
    """True once a SIGINT/SIGTERM (or a test) has requested shutdown."""

    def is_set(self) -> bool: ...


# ── idempotency set ─────────────────────────────────────────────────────────────


class AnsweredSet:
    """Pure idempotency set over request_ids.

    Seed it from ``durable.read_request_ids(verdict_ledger, escalation_ledger)`` at
    startup so a request_id already handled before a restart is not acted on again.
    """

    def __init__(self, seed: Iterable[str] = ()) -> None:
        self._seen: Set[str] = {r for r in seed if r}

    def seen(self, request_id: str) -> bool:
        return request_id in self._seen

    def mark(self, request_id: str) -> None:
        if request_id:
            self._seen.add(request_id)

    def __len__(self) -> int:
        return len(self._seen)

    def __contains__(self, request_id: str) -> bool:
        return request_id in self._seen


# ── the daemon ──────────────────────────────────────────────────────────────────


class SingleInstanceError(RuntimeError):
    """Raised when ``run_forever`` cannot acquire the single-instance lock."""


class FeedDaemon:
    """Continuous poll loop around an injected decide brain over a decision channel."""

    def __init__(
        self,
        *,
        channel: Any,
        decide: Callable[[Mapping[str, Any]], Decision],
        verdict_ledger: Ledger,
        escalation_ledger: Ledger,
        answered: Optional[AnsweredSet] = None,
        sleeper: Optional[Sleeper] = None,
        stop: Optional[StopSignal] = None,
        lock: Optional[Lock] = None,
        poll_interval_s: float = 2.0,
        logger: Optional[logging.Logger] = None,
    ) -> None:
        # channel: a DecisionChannelAdapter — surface_pending()/deliver_reply()/escalate()
        # decide:  the injected core policy — (decision payload) -> Decision
        self._channel = channel
        self._decide = decide
        self._verdicts = verdict_ledger
        self._escalations = escalation_ledger
        self._answered = answered or AnsweredSet()
        self._sleeper = sleeper or RealSleeper()
        self._stop = stop or SignalStop()
        self._lock = lock or _NullLock()
        self._interval = poll_interval_s
        self._log = logger or _LOG

    def tick(self) -> List[FeedOutcome]:
        """One poll pass: handle each fresh pending decision exactly once.

        Idempotency is enforced HERE, before ``decide`` is paid — a request_id in
        the answered-set is skipped so the brain is never re-run and a still-pending
        escalated item is not re-escalated every poll.
        """
        outcomes: List[FeedOutcome] = []
        for decision in self._channel.surface_pending():
            request_id = decision.get("request_id")
            if not request_id or self._answered.seen(request_id):
                continue
            try:
                verdict = self._decide(decision)
            except Exception:
                outcome = self._on_decide_failure(request_id)
            else:
                outcome = self._act(request_id, verdict)
            self._answered.mark(request_id)
            outcomes.append(outcome)
        return outcomes

    def _act(self, request_id: str, decision: Decision) -> FeedOutcome:
        """Apply one decide verdict: deliver a reply, or escalate — never both."""
        if decision.is_deliver:
            result = self._channel.deliver_reply(request_id, list(decision.selection or ()))
            if result.get("advanced"):
                # Auto-answered: record the verdict durably for audit + re-hydration.
                self._verdicts.record(
                    {
                        "request_id": request_id,
                        "status": "resolved",
                        "selection": list(decision.selection or ()),
                    }
                )
                return FeedOutcome(request_id=request_id, status="resolved")
            # The reply did NOT advance the worker (a non-matching selection / stuck
            # pane). NEVER silently claim it delivered: escalate durably (#1009/#986).
            return self._escalate(request_id, CAUSE_WORKER_STUCK)
        if decision.is_escalation:
            return self._escalate(request_id, decision.escalate_reason or "escalated")
        # Malformed decision (neither arm, or both): fail safe — escalate, never
        # auto-answer on an ambiguous brain result.
        self._log.error(
            "MALFORMED DECISION — request_id=%s decide returned neither a reply nor "
            "an escalation; escalating to a human",
            request_id,
        )
        return self._escalate(request_id, CAUSE_DECIDE_FAILED)

    def _escalate(self, request_id: str, cause: str) -> FeedOutcome:
        """Record a durable escalation AND loudly surface it; deliver NOTHING (C004)."""
        self._channel.escalate(request_id, cause)
        self._escalations.record(
            {"request_id": request_id, "status": "escalated", "cause": cause}
        )
        self._log.warning(
            "ESCALATION REQUIRED — decision NOT auto-resolved: request_id=%s "
            "cause=%s (a human must review)",
            request_id,
            cause,
        )
        return FeedOutcome(request_id=request_id, status="escalated", reason=cause)

    def _on_decide_failure(self, request_id: str) -> FeedOutcome:
        """A raised decide failure becomes an observable escalation, never a swallow.

        The decide brain raised for this item (e.g. the injected LLM call died in a
        detached, no-TTY daemon context). Loud-log with the traceback AND escalate so
        the failure leaves a durable trace, then keep polling rather than crash the
        whole daemon.
        """
        self._log.exception(
            "DECIDE FAILED — request_id=%s could not be auto-resolved; escalating to "
            "a human and continuing",
            request_id,
        )
        return self._escalate(request_id, CAUSE_DECIDE_FAILED)

    def run_forever(self) -> None:
        """Loop ``tick()`` + sleep under the single-instance lock until stop fires.

        The single-instance guard is acquired up front: if another daemon holds it,
        we refuse to start rather than answer the same feed twice. The lock is
        released in a ``finally`` so a signal-driven stop never leaves it wedged.
        """
        if not self._lock.acquire():
            raise SingleInstanceError(
                "another feed daemon already holds the single-instance lock"
            )
        try:
            while not self._stop.is_set():
                self.tick()
                self._sleeper.sleep(self._interval)
        finally:
            self._lock.release()


# ── production plumbing (stdlib only) ───────────────────────────────────────────


class RealSleeper:
    """Production pacing sleeper."""

    def sleep(self, seconds: float) -> None:
        time.sleep(max(0.0, seconds))


class SignalStop:
    """A stop signal backed by a ``threading.Event``; ``install`` wires SIGINT/SIGTERM."""

    def __init__(self) -> None:
        self._event = threading.Event()

    def install(self) -> "SignalStop":
        for sig in (signal.SIGINT, signal.SIGTERM):
            signal.signal(sig, self._on_signal)
        return self

    def _on_signal(self, signum, frame) -> None:  # noqa: ANN001 — signal handler
        self._event.set()

    def set(self) -> None:
        self._event.set()

    def is_set(self) -> bool:
        return self._event.is_set()


class PidfileLock:
    """Single-instance guard via a pidfile.

    ``acquire()`` writes our pid iff no LIVE holder owns the path; a pidfile naming
    a dead pid is stale and reclaimed, so a crashed daemon never wedges the lock.
    Returns False when a live holder already owns it.
    """

    def __init__(self, path: str | Path) -> None:
        self._path = Path(path)
        self._held = False

    def acquire(self) -> bool:
        if self._held:
            return True
        if self._path.exists() and self._holder_alive():
            return False
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._path.write_text(str(os.getpid()), encoding="utf-8")
        self._held = True
        return True

    def release(self) -> None:
        if not self._held:
            return
        try:
            self._path.unlink()
        except FileNotFoundError:
            pass
        self._held = False

    def _holder_alive(self) -> bool:
        try:
            pid = int(self._path.read_text(encoding="utf-8").strip())
        except (OSError, ValueError):
            return False  # unreadable / not an int → stale
        if pid <= 0:
            return False
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            return False  # holder gone → stale
        except PermissionError:
            return True  # exists, owned by another user
        except OSError:
            return False
        return True


class _NullLock:
    """Default no-op lock (single-instance guard is opt-in via ``PidfileLock``)."""

    def acquire(self) -> bool:
        return True

    def release(self) -> None:
        return None


__all__ = [
    "Decision",
    "FeedOutcome",
    "FeedDaemon",
    "AnsweredSet",
    "SingleInstanceError",
    "RealSleeper",
    "SignalStop",
    "PidfileLock",
    "CAUSE_DECIDE_FAILED",
    "CAUSE_WORKER_STUCK",
]
