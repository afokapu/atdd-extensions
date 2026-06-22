"""Decision-channel adapter for atdd.workspace.cmux-claude (contract_version 1.0.0).

Composes the provider's two capabilities — ``transport.command-feed`` (durable feed)
and ``orchestration.agent-session`` (deliver into a worker session) — into the
two-way decision round-trip the core ``atdd.coach.decision_channel`` contract
requires. This is the provider's implementation of the core ``DecisionChannel`` port;
core states the requirement, the provider carries it over a concrete transport.

The adapter is self-contained: it operates on the decision PAYLOAD SHAPE — the
cross-repo field-name contract with core (``request_id``, ``kind``, ``tool``,
``tool_input``, ``agent_id``, ``options[{label}]``, plus ``prompt``/``multi_select``
for questions) — and imports nothing from core. The session delivery is injected
(``deliver``) so the mechanics are exercisable with any process; production wires the
cmux-pane option-select + submit keystroke.

Round-trip semantics mirror the core reference (InMemoryDecisionChannel):
  * readiness       → whether the channel is LIVE (the cmux wrapper will publish); a
                      not-live verdict is the signal the core dispatch rule uses to
                      refuse/escalate instead of spawning an unmediated worker
  * surface_pending → the decisions still awaiting mediation (not yet resolved/escalated)
  * deliver_reply   → SELECT + SUBMIT so the worker advances; advances ONLY on a valid
                      option selection (the silent ``delivered:true`` footgun on a
                      non-matching label is refused, never reported as advanced — #1009)
  * escalate        → a durable escalation appended to the feed (never a silent HANDLED)
"""
from __future__ import annotations

from typing import Any, Callable, Dict, List, Mapping, Optional, Sequence

# The required decision payload fields (the cross-repo contract with core's
# DecisionRequest). A feed message carrying all of these is a surfaced decision.
_DECISION_FIELDS = ("request_id", "kind", "tool", "tool_input", "agent_id", "options")
_TERMINAL = ("resolved", "escalated")


class DecisionChannelAdapter:
    """Two-way decision channel over a CommandFeed + an injected session deliverer."""

    def __init__(
        self,
        feed: Any,
        *,
        deliver: Callable[[str], bool],
        readiness_probe: Optional[Callable[[], Any]] = None,
    ) -> None:
        # feed: a transport.command-feed (CommandFeed) — append(payload)->seq, poll(since)->[FeedMessage]
        # deliver: callable(prompt) -> bool — delivers the reply into the worker session
        #          and reports whether the worker ADVANCED (production: cmux select+submit).
        # readiness_probe: callable() -> ChannelReadiness — reports whether the channel is
        #          live (default: the live cmux env probe). Injected so readiness is
        #          exercisable without a live cmux.
        self._feed = feed
        self._deliver = deliver
        self._readiness_probe = readiness_probe

    def readiness(self) -> Any:
        """Report whether the decision channel is live — the core readiness obligation.

        Delegates to the injected readiness probe (default: the cmux env probe, which
        is live iff the wrapper will inject its ``PermissionRequest -> feed`` hook). A
        not-live verdict is the signal for the core dispatch rule to refuse or escalate
        rather than spawn an unmediated worker; the provider only supplies the live
        signal, it does not own the refuse/escalate policy.
        """
        probe = self._readiness_probe
        if probe is None:
            from readiness import cmux_channel_readiness  # lazy: default live cmux probe

            probe = cmux_channel_readiness
        return probe()

    def _scan(self) -> tuple[Dict[str, Mapping], set]:
        """Reduce the feed to (pending-decisions-by-id, terminal-request-ids)."""
        decisions: Dict[str, Mapping] = {}
        terminal: set = set()
        for msg in self._feed.poll(0):
            payload = msg.payload
            if payload.get("status") in _TERMINAL:
                terminal.add(payload.get("request_id"))
            elif all(field in payload for field in _DECISION_FIELDS):
                decisions[payload["request_id"]] = payload
        return decisions, terminal

    def surface_pending(self, *, since: int = 0) -> List[Mapping]:
        """The decisions still awaiting mediation (full payload, not yet terminal)."""
        decisions, terminal = self._scan()
        return [d for rid, d in decisions.items() if rid not in terminal]

    def deliver_reply(self, request_id: str, selection: Sequence[str]) -> Dict[str, Any]:
        """Select + submit so the worker advances; resolve on success.

        Advances ONLY when ``request_id`` is a real pending decision and every label
        in ``selection`` is one of its options. A non-matching/empty selection is
        refused (``advanced=False``) and the decision stays pending — never a silent
        success.
        """
        decisions, terminal = self._scan()
        decision = decisions.get(request_id)
        valid_labels = {o.get("label") for o in (decision or {}).get("options", [])}
        selection_ok = (
            decision is not None
            and request_id not in terminal
            and bool(selection)
            and set(selection) <= valid_labels
        )
        if not selection_ok:
            return {"request_id": request_id, "advanced": False}
        advanced = bool(self._deliver(f"{request_id}:{','.join(selection)}"))
        if advanced:
            self._feed.append(
                {"request_id": request_id, "status": "resolved", "selection": list(selection)}
            )
        return {"request_id": request_id, "advanced": advanced}

    def escalate(self, request_id: str, reason: str) -> Dict[str, Any]:
        """Append a durable escalation for an unanswered/undeliverable decision."""
        self._feed.append({"request_id": request_id, "status": "escalated", "reason": reason})
        return {"request_id": request_id, "reason": reason, "durable": True}


__all__ = ["DecisionChannelAdapter"]
