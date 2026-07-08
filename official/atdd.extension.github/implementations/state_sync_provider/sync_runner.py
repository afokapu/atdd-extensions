"""Composition root — register the GitHub provider into core, then heal both ways.

This is the ONE place that imports BOTH core (``atdd.state``) and the GitHub
provider module. It is the extension→obligation **satisfier**: core never imports
the provider (doctrine — see ``atdd.workspace.cmux-claude/docs/agnostic-runtime-architecture.md``),
and the provider never imports ``atdd``; this runner wires the two.

``atdd-github-sync`` (or ``python sync_runner.py``) heals ``store↔GitHub`` in BOTH
directions with one command:

  1. ``ingest`` — GitHub issues → canonical inbox events → ``apply_inbox`` (state);
  2. ``push``   — the outbox → GitHub (issue create / label / comment).

It registers the provider via core's ``register_provider`` seam and then invokes
core's own provider-agnostic ``atdd state sync --ingest --push``. ``atdd`` is only
importable where core is installed (an operator machine / core-side CI), so this
runner is a runtime artifact, not part of the extension's pytest surface.
"""
from __future__ import annotations

from typing import Optional, Sequence

import github_sync


def _register_into_core() -> None:
    """Import core's seam lazily and register the GitHub provider (idempotent)."""
    from atdd.state.providers import register_provider  # imported here: core-side only

    github_sync.register(register_provider)


def main(argv: Optional[Sequence[str]] = None) -> int:
    """Register the provider, then run core's agnostic sync (ingest + push).

    ``argv`` overrides the default ``["--ingest", "--push"]`` (e.g. drop ``--push``
    for an ingest-only heal). Returns core's ``run_sync_cli`` exit code.
    """
    _register_into_core()
    from atdd.state.sync_cli import run_sync_cli  # imported here: core-side only

    return run_sync_cli(list(argv) if argv is not None else ["--ingest", "--push"])


if __name__ == "__main__":  # pragma: no cover - operator entrypoint
    import sys

    raise SystemExit(main(sys.argv[1:]))
