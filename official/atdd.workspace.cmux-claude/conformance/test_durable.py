"""Durable-write util conformance for atdd.workspace.cmux-claude (ext#29).

The daemon's audit ledgers ride on ``durable.append_jsonl`` — a standalone
single-writer append kept SEPARATE from the command-transport feed. These prove
the mechanism: append order is preserved, a fresh ledger's parent dir is created
on demand, re-hydration collects request_ids across ledgers, and a partial/garbled
line never crashes the reader (so a daemon boots cleanly off a truncated ledger).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "adapter"))

import durable as durable_mod  # noqa: E402


def test_append_creates_parent_and_preserves_order(tmp_path):
    path = tmp_path / "nested" / "verdicts.jsonl"
    durable_mod.append_jsonl(path, {"request_id": "a", "n": 1})
    durable_mod.append_jsonl(path, {"request_id": "b", "n": 2})
    lines = path.read_text(encoding="utf-8").splitlines()
    assert [json.loads(x)["request_id"] for x in lines] == ["a", "b"]


def test_read_request_ids_across_ledgers(tmp_path):
    v = tmp_path / "verdicts.jsonl"
    e = tmp_path / "escalations.jsonl"
    durable_mod.append_jsonl(v, {"request_id": "req-1", "status": "resolved"})
    durable_mod.append_jsonl(e, {"request_id": "req-2", "status": "escalated"})
    assert durable_mod.read_request_ids(v, e) == {"req-1", "req-2"}


def test_read_request_ids_missing_file_is_empty(tmp_path):
    assert durable_mod.read_request_ids(tmp_path / "nope.jsonl") == set()


def test_read_skips_blank_and_malformed_lines(tmp_path):
    path = tmp_path / "verdicts.jsonl"
    durable_mod.append_jsonl(path, {"request_id": "req-1"})
    with path.open("a", encoding="utf-8") as fh:
        fh.write("\n")               # blank
        fh.write("{not json}\n")     # garbled (e.g. a torn write on crash)
        fh.write(json.dumps({"no_id": True}) + "\n")  # valid json, no request_id
    durable_mod.append_jsonl(path, {"request_id": "req-2"})
    assert durable_mod.read_request_ids(path) == {"req-1", "req-2"}


def test_jsonl_ledger_record_appends(tmp_path):
    ledger = durable_mod.JsonlLedger(tmp_path / "escalations.jsonl")
    ledger.record({"request_id": "req-1", "status": "escalated"})
    ledger.record({"request_id": "req-2", "status": "escalated"})
    assert durable_mod.read_request_ids(ledger.path) == {"req-1", "req-2"}
