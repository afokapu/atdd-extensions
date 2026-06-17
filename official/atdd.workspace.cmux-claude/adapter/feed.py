"""Transport half of the cmux-claude provider contract (contract_version 1.0.0).

The ``transport.command-feed`` capability: a durable, append-only, ordered feed
carrying commands/events between the coach and its workers. Backed by a JSONL
file where the line number IS the sequence, so readers poll by ``since`` and the
feed survives a restart. This owns the MECHANISM only — message schemas are owned
by the coach/extensions that use the feed.

Self-contained: stdlib only (json + pathlib), no cmux/Claude coupling, so the
mechanism is exercisable anywhere.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

CONTRACT_VERSION = "1.0.0"


@dataclass(frozen=True)
class FeedMessage:
    """One feed entry: a monotonic ``seq`` (1-based) and its payload."""

    seq: int
    payload: dict


class CommandFeed:
    """A durable, append-only, ordered command/event feed (file-backed JSONL)."""

    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def append(self, payload: dict) -> int:
        """Append ``payload`` and return its 1-based sequence number.

        Single-writer: the sequence is the resulting line count, so the on-disk
        order is the delivery order. The write is newline-terminated JSON.
        """
        with self.path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(payload, separators=(",", ":"), sort_keys=True) + "\n")
        return self._line_count()

    def poll(self, since: int = 0) -> list[FeedMessage]:
        """Return messages with ``seq > since``, in order. ``since=0`` → all."""
        if not self.path.exists():
            return []
        messages: list[FeedMessage] = []
        with self.path.open(encoding="utf-8") as fh:
            for seq, line in enumerate(fh, start=1):
                line = line.strip()
                if seq > since and line:
                    messages.append(FeedMessage(seq=seq, payload=json.loads(line)))
        return messages

    def _line_count(self) -> int:
        with self.path.open(encoding="utf-8") as fh:
            return sum(1 for _ in fh)
