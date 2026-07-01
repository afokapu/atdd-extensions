"""Durable append-only JSONL writing for the cmux-claude provider runtime.

A standalone single-writer append util, deliberately SEPARATE from the
``transport.command-feed`` (``feed.py``): the command feed carries the live
decision traffic, while these are the daemon's AUDIT ledgers — the verdict ledger
(auto-applied replies) and the escalation ledger (decisions a human must review).
Keeping them apart means the transport feed is not polluted with audit records and
each ledger can be re-read independently to re-hydrate the daemon after a restart.

Mirrors the core wagon's ``commons/jsonl_writer`` (``append_jsonl``) so the
"mkdir + append one JSON line" logic lives in exactly one place, but is
self-contained: stdlib only (``json`` + ``pathlib``), no cmux/Claude/core coupling.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Mapping, Set


def append_jsonl(path: str | Path, record: Mapping[str, Any]) -> None:
    """Append ``record`` as one newline-terminated JSON line to ``path``.

    Single-writer: the on-disk order is the write order. Parent directories are
    created on demand so the first write to a fresh ledger never fails.
    """
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n")


def read_request_ids(*paths: str | Path) -> Set[str]:
    """Collect every ``request_id`` already recorded across the given ledgers.

    Used to re-hydrate the daemon's answered-set at startup: a request_id present
    in the verdict or escalation ledger was already handled, so the daemon must not
    act on it again after a restart. Malformed/blank lines are skipped — a partial
    or truncated ledger never crashes the daemon on boot.
    """
    handled: Set[str] = set()
    for path in paths:
        target = Path(path)
        if not target.exists():
            continue
        for line in target.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                continue
            request_id = record.get("request_id") if isinstance(record, dict) else None
            if request_id:
                handled.add(request_id)
    return handled


class JsonlLedger:
    """A durable audit sink: ``record(dict)`` appends one line via ``append_jsonl``.

    The daemon's verdict ledger and escalation ledger are both this — same durable
    mechanism, different file. It is intentionally a thin wrapper so production and
    conformance share one write path.
    """

    def __init__(self, path: str | Path) -> None:
        self._path = Path(path)

    @property
    def path(self) -> Path:
        return self._path

    def record(self, entry: Mapping[str, Any]) -> None:
        append_jsonl(self._path, entry)


__all__ = ["append_jsonl", "read_request_ids", "JsonlLedger"]
