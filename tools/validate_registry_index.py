#!/usr/bin/env python3
"""registry/index.yaml must satisfy the schema the CONSUMER validates it against.

Nothing checked this, and it broke every consumer. A `behaviour_digest` field was
added to each entry as a drift-detection aid; core's registry-index.schema.json is
`additionalProperties: false` and does not list it, so all 16 entries became invalid
and any consumer running the released toolkit got SubstrateSchemaError from
`atdd search` and from a registry-resolved `atdd substrate add`.

The hub had checks for gates, scopes, convention nodes, relationship graphs and
interlocking documents — everything EXCEPT the one file consumers actually read to
find packages. The index is the hub's public interface, and it was the only artifact
whose schema nobody enforced.

The ordering this exists to protect: an additive field lands in the consumer's schema
FIRST, and only then does the producer emit it. Done the other way round, the producer
breaks every consumer that has not upgraded yet — including all of them, on the day
it ships.

FAILS rather than skips when core is absent, for the same reason its siblings do: a
schema check that silently does nothing reports green over an invalid file.

    python3 tools/validate_registry_index.py
"""
from __future__ import annotations

import json
import pathlib
import sys

import yaml

HUB = pathlib.Path(__file__).resolve().parent.parent
INDEX = HUB / "registry" / "index.yaml"


def main() -> int:
    try:
        import atdd
    except ImportError:
        print("cannot import `atdd`, so core's registry-index schema is unavailable.\n"
              "This script FAILS rather than skipping: a schema check that silently does "
              "nothing reports green over an invalid index, which is the exact defect it "
              "exists to catch.\n"
              "  pip install 'git+https://github.com/afokapu/atdd.git@main'", file=sys.stderr)
        return 1

    from jsonschema import Draft202012Validator

    schema_path = (pathlib.Path(atdd.__file__).resolve().parent / "planner" / "schemas"
                   / "registry-index.schema.json")
    if not schema_path.is_file():
        print(f"installed core ships no {schema_path.name}", file=sys.stderr)
        return 1

    if not INDEX.is_file():
        print(f"{INDEX.relative_to(HUB)} is missing", file=sys.stderr)
        return 1

    schema = json.loads(schema_path.read_text())
    index = yaml.safe_load(INDEX.read_text())
    errors = sorted(Draft202012Validator(schema).iter_errors(index),
                    key=lambda e: list(e.path))

    if errors:
        print(f"{len(errors)} error(s) — consumers reading this index will reject it:\n",
              file=sys.stderr)
        for e in errors[:12]:
            loc = "/".join(str(p) for p in e.path) or "<root>"
            print(f"  {loc}: {e.message[:130]}", file=sys.stderr)
        if len(errors) > 12:
            print(f"  … and {len(errors) - 12} more", file=sys.stderr)
        print("\nAn additive field must land in the CONSUMER's schema before the producer "
              "emits it.", file=sys.stderr)
        return 1

    n = len((index or {}).get("entries") or [])
    print(f"registry/index.yaml valid against core's registry-index schema ({n} entries)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
