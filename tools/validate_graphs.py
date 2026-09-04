#!/usr/bin/env python3
"""Validate every package's relationship graph against ATDD core's edge schema.

Nothing does this today. `atdd validate package` enforces core's
`planner.relationship.no-orphan-nodes` (an owned node must be an endpoint of some
edge) but never applies `relationship.schema.json` to an extension's edges, and never
checks the reverse direction — an edge citing a node that does not exist. The result
is visible across the hub: ad-hoc `type` values that are not in core's enum, two
incompatible edge key shapes, and at least one graph that referenced a node after it
had moved packages.

Checks, per package:
  1. every edge uses the canonical keys  source_ref / target_ref / type
  2. `type` is in core's enum, and every metadata field is in its own enum
  3. no orphan nodes      (core's rule, re-checked here so one tool reports both)
  4. no dangling refs     (the direction core does not check)
  5. every edge states a reason

NODE -> ARTIFACT links are exempt from 2. One package links each convention node to
the gate, scope and implementation that realize it — a richer use of the graph than
node relations, with verbs (realized-by / scoped-by / gated-by) core's scheduling
enum does not model. Mapping them onto `requires` would destroy the distinction, so
they are counted and reported, never failed.

The enums are read from the INSTALLED core when `atdd` is importable, and fall back
to a transcription otherwise, so the check still runs in a bare CI container before
the toolkit is installed.

    python3 tools/validate_graphs.py            # report and exit non-zero on any error
    python3 tools/validate_graphs.py --summary  # one line per package, always exit 0
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import yaml

HUB = Path(__file__).resolve().parent.parent

# Verbs used for NODE -> ARTIFACT links rather than node relations. Core's edge
# schema has no vocabulary for them; see the module docstring.
ARTIFACT_VERBS = {"realized-by", "scoped-by", "gated-by"}

# Transcribed from src/atdd/planner/schemas/author/relationship.schema.json
# ("ATDD relationship edge, spec 6"). Re-read from installed core when available.
ENUMS = {
    "type": {"requires", "blocks", "enables", "follows", "awaits",
             "triggered_by", "starts_with", "runs_alongside", "finishes_with", "relieves"},
    "foundation": {"finish_to_start", "start_to_start", "finish_to_finish", "start_to_finish"},
    "constraint": {"mandatory", "discretionary", "conditional"},
    "control": {"internal", "external", "autonomous"},
    "strength": {"critical", "important", "minor"},
}


def load_enums() -> dict[str, set[str]]:
    try:
        import atdd
        p = (Path(atdd.__file__).resolve().parent / "planner" / "schemas" / "author"
             / "relationship.schema.json")
        props = json.loads(p.read_text())["properties"]
        return {k: set(props[k]["enum"]) for k in ENUMS if k in props and "enum" in props[k]}
    except Exception:  # noqa: BLE001 — core is optional here by design
        return ENUMS


def check(path: Path, enums: dict[str, set[str]]) -> list[str]:
    try:
        g = yaml.safe_load(path.read_text()) or {}
    except yaml.YAMLError as e:
        return [f"unparseable: {e}"]
    nodes = set(g.get("nodes") or [])
    edges = g.get("edges") or []
    errs: list[str] = []
    referenced: set[str] = set()

    for i, e in enumerate(edges):
        if not isinstance(e, dict):
            errs.append(f"edge[{i}] is not a mapping")
            continue
        if "source_ref" not in e or "target_ref" not in e:
            legacy = [k for k in ("from", "to", "rationale") if k in e]
            errs.append(f"edge[{i}] uses non-canonical keys {legacy or sorted(e)}; "
                        "expected source_ref / target_ref / reason")
            continue
        src, tgt = e["source_ref"], e["target_ref"]
        # A path-valued target is a NODE -> ARTIFACT link (a node to the gate, scope
        # or implementation that realizes it), not a node relation.
        # atdd.extension.train-interlocking-enforcement uses the graph that way
        # deliberately, with verbs core's scheduling enum does not model
        # (realized-by / scoped-by / gated-by). Mapping those onto `requires` would
        # destroy the distinction, so they are reported separately, never as errors.
        artifact_link = "/" in tgt
        referenced.add(src)
        if not artifact_link:
            referenced.add(tgt)
        t = e.get("type")
        if artifact_link:
            if t in ARTIFACT_VERBS:
                continue
            errs.append(f"edge[{i}] {src} -> {tgt}: artifact link with unknown verb {t!r}")
            continue
        if t not in enums["type"]:
            errs.append(f"edge[{i}] {src} -> {tgt}: type {t!r} is not in core's enum")
        for key in ("foundation", "constraint", "control", "strength"):
            if key in e and e[key] not in enums.get(key, set()):
                errs.append(f"edge[{i}]: {key}={e[key]!r} is not in core's enum")
        if not str(e.get("reason", "")).strip():
            errs.append(f"edge[{i}] {e['source_ref']} -> {e['target_ref']}: no reason")

    if nodes:
        orphans = nodes - referenced
        if orphans and len(nodes) > 1:
            errs.append(f"orphan node(s) in no edge: {sorted(orphans)}")
        dangling = referenced - nodes
        if dangling:
            errs.append(f"edge(s) cite unknown node(s): {sorted(dangling)}")
    return errs


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--summary", action="store_true",
                    help="one line per package; always exit 0")
    args = ap.parse_args()
    enums = load_enums()

    graphs = sorted(HUB.glob("official/*/relationships.yaml"))
    total = 0
    for gpath in graphs:
        pkg = gpath.parent.name
        errs = check(gpath, enums)
        total += len(errs)
        if args.summary:
            print(f"  {'ok  ' if not errs else 'BAD '} {pkg:46s} {len(errs)} error(s)")
        elif errs:
            print(f"\n{pkg}")
            for e in errs:
                print(f"  - {e}")
    if args.summary:
        return 0
    if total:
        print(f"\n{total} graph error(s) across {len(graphs)} package(s)", file=sys.stderr)
        return 1
    print(f"all {len(graphs)} relationship graphs valid")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
