"""Workspace-scope conformance for atdd.workspace.cmux-claude (#12, L005).

Proves the provider satisfies core's scope-ownership obligation in BOTH directions:
a consumer sees its own workspace's decisions and NOT another's (no cross-decide), and
it does NOT silently drop a real decision whose owner can't be resolved (the l005
partial-resolution-drop fix — degrade permissively, since a missed decision is worse
than a redundant one). A REAL run over plain payloads; the workspace ``resolve`` is
injected per the provider's self-contained contract.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "adapter"))

import scope  # noqa: E402

_A = {"request_id": "a1", "agent_id": "ws-A"}
_B = {"request_id": "b1", "agent_id": "ws-B"}
_UNRESOLVED = {"request_id": "u1", "agent_id": "ws-?"}


def _resolver(mapping):
    """resolve(item) -> workspace id from a fixed map; None when absent (unresolved)."""

    def resolve(item):
        return mapping.get(item["request_id"])

    return resolve


# ── owns(): the ownership predicate ───────────────────────────────────────────────


def test_owns_when_resolved_to_same_workspace() -> None:
    assert scope.owns("ws-A", "ws-A") is True


def test_not_owned_when_resolved_to_other_workspace() -> None:
    assert scope.owns("ws-B", "ws-A") is False  # no cross-decide


def test_owned_when_owner_unresolved() -> None:
    # the l005 fix: an unresolved owner degrades permissively (keep, don't drop)
    assert scope.owns(None, "ws-A") is True


# ── filter_for_workspace(): the end-to-end scope ─────────────────────────────────


def test_filter_keeps_only_own_and_unresolved() -> None:
    items = [_A, _B, _UNRESOLVED]
    resolve = _resolver({"a1": "ws-A", "b1": "ws-B"})  # u1 absent -> unresolved
    kept = scope.filter_for_workspace(items, workspace_id="ws-A", resolve=resolve)
    kept_ids = {i["request_id"] for i in kept}
    assert kept_ids == {"a1", "u1"}  # own + unresolved kept; other excluded


def test_filter_excludes_other_workspace_no_cross_decide() -> None:
    resolve = _resolver({"b1": "ws-B"})
    kept = scope.filter_for_workspace([_B], workspace_id="ws-A", resolve=resolve)
    assert kept == []  # B's decision never leaks to A


def test_filter_never_drops_a_real_unresolved_decision() -> None:
    # the exact l005 symptom: a worktree-launched worker's item whose cwd is not in the
    # resolved set must NOT be silently dropped.
    resolve = _resolver({})  # nothing resolves -> all unresolved
    kept = scope.filter_for_workspace([_A, _UNRESOLVED], workspace_id="ws-A", resolve=resolve)
    assert {i["request_id"] for i in kept} == {"a1", "u1"}
