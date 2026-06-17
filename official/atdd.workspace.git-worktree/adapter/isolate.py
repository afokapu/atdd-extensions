"""Isolation half of the git-worktree provider contract (contract_version 1.0.0).

The ``environment.isolation`` capability: give each unit of work its own git
worktree — a flat-sibling checkout of a single branch that shares the object
store but isolates the working tree and index. The provider NEVER mutates the
shared git directory; per-worktree configuration is written with
``git config --worktree`` only, and the keys below would corrupt sibling
worktrees if set on the shared config.

This is a contract stub — the executable adapter lands with the provider's
runtime wagon. It is versioned WITH the provider so a contract bump is a single,
reviewable change.
"""
from __future__ import annotations

CONTRACT_VERSION = "1.0.0"

# Worktrees are flat siblings of the main checkout, one per branch.
WORKTREE_LAYOUT = "flat-sibling"

# Create / remove a worktree. Removal happens only AFTER the branch's PR lands —
# tearing down before the merge orphans the work.
CREATE_TEMPLATE = ("git", "worktree", "add", "../<prefix>-<slug>", "-b", "<prefix>/<slug>")
REMOVE_TEMPLATE = ("git", "worktree", "remove", "<path>")

# Per-worktree config scope. Any write to these keys MUST use this scope.
CONFIG_SCOPE = "--worktree"
DANGER_KEYS = ("core.bare", "core.worktree", "core.hooksPath")
