"""Workspace scope filter — each consumer sees only its own decisions (#12, L005).

Core obligation (agnostic): a scoped consumer must see ONLY its own workspace's
decisions (no cross-decide), and must NOT silently drop one that IS its own. The cmux
satisfier resolves an item's owning workspace from cmux signals (the item's
surface/agent identity and its cwd / worktree set, via ``surface.list``).

RCA 2026-06-22 (l005, "workspace A scoped source saw no decision"): the prior cmux
resolution DROPPED a real item when the worktree-launched worker's cwd was not in the
resolved set, because the permissive degrade fired only on a TOTAL resolution failure,
not a PARTIAL miss. The asymmetry matters: a MISSED decision (worker hangs forever) is
strictly worse than a redundant one (mediated twice, idempotent). So this filter
degrades permissively on ANY item whose owner cannot be resolved — it keeps it for the
consumer rather than dropping it — while still excluding an item that resolves to a
DIFFERENT workspace (the no-cross-decide half).

Self-contained: the workspace ``resolve`` is injected so the policy is exercisable
without cmux ``surface.list``.
"""
from __future__ import annotations

from typing import Any, Callable, List, Mapping, Optional, Sequence

CONTRACT_VERSION = "1.0.0"

# resolve(item) -> owning workspace id, or None when the owner cannot be resolved.
Resolver = Callable[[Mapping[str, Any]], Optional[str]]


def owns(resolved_workspace: Optional[str], workspace_id: str) -> bool:
    """Whether a consumer scoped to ``workspace_id`` owns an item.

    Owned when the item resolves to this workspace. An UNRESOLVED owner
    (``resolved_workspace is None``) is owned too — degrade permissively rather than
    drop a possibly-own decision (the l005 fix). An item resolving to a DIFFERENT
    workspace is never owned (no cross-decide).
    """
    if resolved_workspace is None:
        return True
    return resolved_workspace == workspace_id


def filter_for_workspace(
    items: Sequence[Mapping[str, Any]],
    *,
    workspace_id: str,
    resolve: Resolver,
) -> List[Mapping[str, Any]]:
    """Return only the items owned by ``workspace_id``.

    Keeps items resolving to this workspace AND items whose owner cannot be resolved
    (permissive degrade — never silently drop a real decision); excludes items
    resolving to another workspace.
    """
    return [item for item in items if owns(resolve(item), workspace_id)]


__all__ = ["Resolver", "filter_for_workspace", "owns"]
