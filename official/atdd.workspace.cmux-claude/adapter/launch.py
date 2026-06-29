"""Production launch composition for atdd.workspace.cmux-claude (contract_version 1.0.0).

The #12 satisfiers (``readiness``, ``cmux_rpc``, ``scope``, ``decision_channel``)
landed as standalone primitives with hermetic tests, but nothing yet INVOKES them
together as a production cmux launch. This module is that composition — the single
entry the core dispatch calls to launch a *mediated* worker, wiring the four
satisfiers into the order that closes the three live-blocked loops:

  * l004 — a worker whose decisions never reach the Feed hangs unmediated. So the
    launch REFUSES to spawn when the channel is not live (``readiness``): a not-live
    verdict short-circuits before any spawn, and the core dispatch escalates instead
    of launching an unmediated worker. (The firebreak, not a best-effort warning.)
  * e012 — ``mediated == None`` after 603s because the worker never launched. The
    spawn goes through the broken-pipe-resilient invoker (``cmux_rpc``) so a stale-
    socket hiccup retries instead of aborting INIT->PLANNED; a genuine error still
    surfaces immediately.
  * l005 — a scoped consumer must see ONLY its own workspace's decisions and must
    never silently drop one that IS its own. The surfaced decisions are passed
    through the permissive scope filter (``scope``) bound to this launch's workspace.

The composition owns ORDER + REFUSAL, not policy: it does not decide whether a
not-live channel escalates or retries (that is the core dispatch rule riding on the
``ready`` signal) — it only guarantees an unmediated worker is never spawned and a
spawned worker's decisions are scoped. Everything is injected (probe, runner, feed,
deliver, resolve) so the whole sequence is exercisable without a live cmux, exactly
as the underlying satisfiers are.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, List, Mapping, Optional, Sequence

import cmux_rpc
import scope as scope_mod
from decision_channel import DecisionChannelAdapter
from readiness import ChannelReadiness, cmux_channel_readiness

CONTRACT_VERSION = "1.0.0"

# resolve(item) -> owning workspace id, or None when the owner cannot be resolved
# (the scope satisfier degrades permissively on None — keeps the item, never drops).
Resolver = Callable[[Mapping[str, Any]], Optional[str]]


class ScopedDecisionChannel:
    """A DecisionChannelAdapter whose surfaced decisions are scoped to one workspace.

    Delegates round-trip (``deliver_reply``/``escalate``/``readiness``) to the wrapped
    adapter unchanged, but filters ``surface_pending`` through the l005 scope satisfier
    so a consumer scoped to ``workspace_id`` sees only its own decisions — keeping any
    item whose owner cannot be resolved (permissive degrade) and excluding only items
    that resolve to a DIFFERENT workspace (no cross-decide).
    """

    def __init__(
        self,
        adapter: DecisionChannelAdapter,
        *,
        workspace_id: str,
        resolve: Resolver,
    ) -> None:
        self._adapter = adapter
        self._workspace_id = workspace_id
        self._resolve = resolve

    def readiness(self) -> Any:
        return self._adapter.readiness()

    def surface_pending(self, *, since: int = 0) -> List[Mapping]:
        return scope_mod.filter_for_workspace(
            self._adapter.surface_pending(since=since),
            workspace_id=self._workspace_id,
            resolve=self._resolve,
        )

    def deliver_reply(self, request_id: str, selection: Sequence[str]) -> dict:
        return self._adapter.deliver_reply(request_id, selection)

    def escalate(self, request_id: str, reason: str) -> dict:
        return self._adapter.escalate(request_id, reason)


@dataclass(frozen=True)
class LaunchResult:
    """Outcome of a mediated-worker launch.

    ``ready`` is the l004 gate: false means the channel is not live and NO worker was
    spawned (``spawned`` is false, ``channel`` is None) — the signal for the core
    dispatch to escalate rather than run unmediated. ``spawned`` is the e012 outcome
    of the broken-pipe-resilient spawn; ``attempts`` records how many cmux invocations
    it took (a transient broken pipe retried). ``channel`` is the scoped decision
    channel for the live worker, present only when ``ready and spawned``.
    """

    ready: bool
    reason: str = ""
    spawned: bool = False
    attempts: int = 0
    spawn_stderr: str = ""
    channel: Optional[ScopedDecisionChannel] = field(default=None)


def launch_mediated_worker(
    *,
    feed: Any,
    deliver: Callable[[str], bool],
    spawn_argv: Sequence[str],
    workspace_id: str,
    resolve: Resolver,
    readiness_probe: Optional[Callable[[], ChannelReadiness]] = None,
    runner: Optional[cmux_rpc.Runner] = None,
    retries: int = cmux_rpc.DEFAULT_RETRIES,
) -> LaunchResult:
    """Launch a mediated worker, refusing to spawn an unmediated one.

    Sequence (the l004 -> e012 -> l005 closure):
      1. Probe readiness. NOT live -> return ``LaunchResult(ready=False, reason=...)``
         WITHOUT spawning — an unmediated worker is never launched (l004).
      2. Spawn via the broken-pipe-resilient invoker (e012 spawn reliability): a stale-
         socket broken pipe retries; a genuine cmux error returns ``spawned=False``.
      3. On a live channel + successful spawn, return a ``ScopedDecisionChannel`` bound
         to ``workspace_id`` so surfaced decisions are scoped (l005).

    All collaborators are injected, so the full sequence runs without a live cmux.
    """
    probe = readiness_probe or cmux_channel_readiness
    readiness = probe()
    if not readiness.live:
        # l004 firebreak: do not spawn a worker whose decisions can't be mediated.
        return LaunchResult(ready=False, reason=readiness.reason)

    spawn = cmux_rpc.cmux_call(spawn_argv, runner=runner, retries=retries)
    if not spawn.ok:
        return LaunchResult(
            ready=True,
            reason=readiness.reason,
            spawned=False,
            attempts=spawn.attempts,
            spawn_stderr=spawn.stderr,
        )

    adapter = DecisionChannelAdapter(feed, deliver=deliver, readiness_probe=probe)
    channel = ScopedDecisionChannel(adapter, workspace_id=workspace_id, resolve=resolve)
    return LaunchResult(
        ready=True,
        spawned=True,
        attempts=spawn.attempts,
        channel=channel,
    )


__all__ = ["LaunchResult", "ScopedDecisionChannel", "launch_mediated_worker"]
