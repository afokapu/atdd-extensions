"""Conformance: the provider declares the realizes edge onto the core mediation obligation.

Core's forcing rule ``coach.substrate.transport-realizes-mediation`` (afokapu/atdd#1268)
REFUSES admission of a provider that declares a transport / agent-session capability but
does not declare a ``realizes`` edge onto ``coach.execution.dispatch-verifies-channel-live``.
This is the provider-local regression guard for that edge — it parses the manifest only and
imports nothing from core (the cross-repo admission check itself lives in core against this
provider's manifest). Drop the edge and a real ``atdd add`` of this provider would be refused.
"""
from __future__ import annotations

from pathlib import Path

import yaml

_MANIFEST = Path(__file__).resolve().parent.parent / "atdd.workspace.yaml"
_OBLIGATION = "coach.execution.dispatch-verifies-channel-live"


def _manifest() -> dict:
    return yaml.safe_load(_MANIFEST.read_text())


def test_manifest_realizes_the_dispatch_verifies_channel_live_obligation() -> None:
    realized = {e.get("core_node") for e in (_manifest().get("realizes") or [])}
    assert _OBLIGATION in realized, (
        f"manifest must declare a realizes edge onto {_OBLIGATION!r} or core admission "
        f"refuses this transport provider (#1268); found core_nodes={realized}"
    )


def test_edge_is_required_because_we_declare_a_transport_capability() -> None:
    # the forcing rule only fires because we declare orchestration/transport capabilities;
    # this pins WHY the edge is mandatory, so the guard stays meaningful if capabilities change
    domains = {c.get("domain") for c in (_manifest().get("capabilities") or [])}
    assert domains & {"transport", "orchestration"}, (
        "provider no longer declares a transport/orchestration capability — if intentional, "
        "the realizes-mediation edge may no longer be required; revisit this guard"
    )
