#!/usr/bin/env python3
"""Build the core-consumable registry index from the hub's curated entry files.

WHY THIS EXISTS
---------------
The hub keeps two registry documents, and they are not redundant:

  registry/registry.yaml   AUTHORED. A curated list of entry FILE PATHS, each
                           pointing at a hand-written `registry/entries/*.yaml`
                           describing one artifact in the hub's own vocabulary
                           (`artifact_id`, `version`, `source: {repository, type}`,
                           `categories`, `compatible_atdd_core`, …).

  registry/index.yaml      GENERATED (this script). The SAME catalog expressed in
                           the vocabulary ATDD core actually reads — the
                           `registry-index.schema.json` shape: inline entries with
                           `id` / `kind` / `latest_version` / `source` / `tags` /
                           `trust`.

Before this script the hub shipped only the authored form, which core REFUSES:

    SubstrateSchemaError: schema violation at <root>:
      Additional properties are not allowed ('registry_id' was unexpected)

and, past that, core's `RegistryEntry.from_dict` needs inline objects keyed `id`,
not a list of path strings. The practical consequence was that `atdd substrate add
<ref>` could not resolve ANY artifact in this hub — every install had to name a
directory with `--path`. That is the missing link in the packaging story: authored
packages existed, but nothing turned them into something core could resolve by
name.

Keeping the authored form as the source of truth (rather than rewriting it into
core's schema) is deliberate: the entry files carry curation this index has no
field for — `compatible_atdd_core` ranges, `requires_workspaces` contracts,
prose descriptions — and a human curates those. This script projects them.

A NOTE ON `source` RESOLUTION (why --absolute exists)
-----------------------------------------------------
Core resolves a registry entry's relative `source` against the CONSUMER repo root,
not against the registry the entry came from:

    package_dir = Path(entry.source)                       # substrate/commands.py
    if not package_dir.is_absolute():
        package_dir = Path(project_root) / package_dir     # <- consumer root

So a hub-relative `official/atdd.workspace.bun` resolves to
`<consumer>/official/atdd.workspace.bun`, which does not exist unless the consumer
has vendored the hub at its own root. In other words a registry living OUTSIDE the
consumer repo — the normal case, and the entire point of a shared registry — can
never resolve its entries by ref today. That is a core defect, not a hub one.

Until core joins the entry source against the REGISTRY's base, `--absolute` emits a
machine-local index whose sources are absolute and therefore immune to the wrong
join. Use it for local development; keep the portable index committed.

USAGE
    python3 tools/build_registry_index.py [--check] [--absolute]

    --check     exit 1 if the generated index differs from the committed one, so
                CI can refuse a hub whose index has drifted from its entry files.
    --absolute  write registry/index.local.yaml with ABSOLUTE source paths, so
                `atdd substrate add <ref>` resolves from any consumer repo. Local
                only — never commit it; it embeds this machine's paths.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import yaml

HUB = Path(__file__).resolve().parent.parent
AUTHORED = HUB / "registry" / "registry.yaml"
GENERATED = HUB / "registry" / "index.yaml"
GENERATED_LOCAL = HUB / "registry" / "index.local.yaml"

# hub `status` → core `trust` enum (official | community | local)
_TRUST = {"official": "official", "community": "community", "local": "local"}


def _alias_for(artifact_id: str) -> str | None:
    """The short ref a human would type: everything after `<publisher>.<scope>.`.

    `atdd.workspace.bun` → `bun`; `atdd.extension.coder.htmx` → `coder.htmx`.
    Returned as a CANDIDATE — the caller drops any alias that is not unique across
    the whole catalog, because core's resolver refuses an ambiguous alias rather
    than guessing, and an alias that can never resolve is worse than none.
    """
    parts = artifact_id.split(".")
    if len(parts) < 3:
        return None
    return ".".join(parts[2:])


def _load_authored() -> list[dict]:
    doc = yaml.safe_load(AUTHORED.read_text(encoding="utf-8")) or {}
    entries = []
    for rel in doc.get("entries", []):
        path = HUB / "registry" / rel if not str(rel).startswith("registry/") else HUB / rel
        if not path.exists():
            print(f"warning: entry file missing, skipped: {rel}", file=sys.stderr)
            continue
        entries.append(yaml.safe_load(path.read_text(encoding="utf-8")) or {})
    return entries


def build(absolute: bool = False) -> dict:
    authored = _load_authored()

    counts: dict[str, int] = {}
    for e in authored:
        a = _alias_for(e.get("artifact_id", ""))
        if a:
            counts[a] = counts.get(a, 0) + 1

    out = []
    for e in authored:
        artifact_id = e.get("artifact_id")
        kind = e.get("kind")
        if not artifact_id or kind not in ("extension", "workspace"):
            print(f"warning: unusable entry {artifact_id!r} (kind={kind!r}), skipped", file=sys.stderr)
            continue
        version = str(e.get("version", "0.1.0"))
        entry = {
            "id": artifact_id,
            "kind": kind,
            "latest_version": version,
            "versions": [version],
        }
        alias = _alias_for(artifact_id)
        if alias and counts.get(alias) == 1:
            entry["aliases"] = [alias]
        if e.get("publisher"):
            entry["publisher"] = e["publisher"]
        trust = _TRUST.get(str(e.get("status", "")).lower())
        if trust:
            entry["trust"] = trust
        src = (e.get("source") or {}).get("repository")
        if src:
            rel = src[2:] if src.startswith("./") else src
            # Hub-relative by default (portable, committed). Absolute on request,
            # to sidestep core's consumer-root join — see the module docstring.
            entry["source"] = str(HUB / rel) if absolute else rel
        if e.get("description"):
            entry["summary"] = " ".join(str(e["description"]).split())
        if e.get("categories"):
            entry["tags"] = list(e["categories"])
        for ws in e.get("requires_workspaces", []) or []:
            entry.setdefault("workspaces", []).append(
                {k: v for k, v in ws.items() if k in ("id", "contract")}
            )
        out.append(entry)

    out.sort(key=lambda x: x["id"])
    return {"schema_version": "1.0.0", "entries": out}


_LOCAL_HEADER = """\
# GENERATED by tools/build_registry_index.py --absolute — DO NOT EDIT, DO NOT COMMIT.
#
# Machine-local index with ABSOLUTE source paths, so `atdd substrate add <ref>`
# resolves from a consumer repo anywhere on disk. It exists only because core joins
# a relative entry source against the CONSUMER root rather than the registry root
# (see the module docstring); delete it once core resolves sources registry-relative.
#
"""

_HEADER = """\
# GENERATED by tools/build_registry_index.py — DO NOT EDIT BY HAND.
#
# The core-consumable projection of registry/registry.yaml + registry/entries/*.
# This is the file ATDD core reads (registry-index.schema.json); the authored
# catalog beside it stays the source of truth. Regenerate after editing any entry:
#
#     python3 tools/build_registry_index.py
#
"""


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--check", action="store_true",
                    help="exit 1 if the committed index differs from the generated one")
    ap.add_argument("--absolute", action="store_true",
                    help="also write registry/index.local.yaml with absolute source paths")
    args = ap.parse_args()

    doc = build()
    rendered = _HEADER + yaml.safe_dump(doc, sort_keys=False, width=100)

    # A registry entry whose source path does not exist is a BROKEN registry: the
    # index is what core reads to resolve `atdd substrate add <ref>`, so a dangling
    # entry sends a consumer at a package that is not there. This happened once, when
    # a persona split removed a package and deferred the registry update — the index
    # went on advertising ./official/atdd.extension.train-interlocking-enforcement
    # after the directory was gone, and nothing noticed because only index-vs-entries
    # drift was checked, never entry-vs-disk.
    dangling = [
        (e.get("id"), e.get("source"))
        for e in doc.get("entries", [])
        if e.get("source") and not (HUB / str(e["source"])).exists()
    ]
    if dangling:
        for eid, src in dangling:
            print(f"registry entry {eid!r} points at {src!r}, which does not exist")
        print(f"\n{len(dangling)} dangling registry entr(ies); the index core reads is broken")
        return 1

    if args.check:
        current = GENERATED.read_text(encoding="utf-8") if GENERATED.exists() else ""
        if current != rendered:
            print("registry/index.yaml is STALE — run: python3 tools/build_registry_index.py",
                  file=sys.stderr)
            return 1
        print(f"registry/index.yaml is up to date ({len(doc['entries'])} entries)")
        return 0

    GENERATED.write_text(rendered, encoding="utf-8")
    print(f"wrote {GENERATED.relative_to(HUB)} ({len(doc['entries'])} entries)")

    if args.absolute:
        local = _LOCAL_HEADER + yaml.safe_dump(build(absolute=True), sort_keys=False, width=100)
        GENERATED_LOCAL.write_text(local, encoding="utf-8")
        print(f"wrote {GENERATED_LOCAL.relative_to(HUB)} (absolute sources; do not commit)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
