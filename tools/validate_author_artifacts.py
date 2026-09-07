#!/usr/bin/env python3
"""Validate every gate, scope and convention node against ATDD core's author schemas.

Nothing did this, and the cost was measurable. `atdd validate package` checks manifest
shape and composition; `tools/validate_graphs.py` applies `relationship.schema.json` to
edges. Neither ever applied `gate.schema.json` or `scope.schema.json` to the files they
govern — so for as long as this hub has existed, EVERY gate in it was missing all four
of its required properties (`trigger`, `selection`, `on_violation`, `exit`) and every
scope used `id` where the schema requires a dotted `selector_id` plus a `type`.

They were not caught by review either, because the broken shape WAS the house style:
the newest package in the repo reproduced it faithfully by copying an existing one.
That is the argument for this script rather than for more care — a convention that only
lives in existing files propagates its own defects.

The schemas are read from the INSTALLED core, which is where they are authoritative.
CI installs the toolkit (`pip install git+https://github.com/afokapu/atdd.git@main`), so
a missing core there is a broken job, not a reason to pass: this script FAILS rather
than skipping. A check that quietly does nothing is worse than no check, because it
reports green.

    python3 tools/validate_author_artifacts.py            # report; non-zero on any error
    python3 tools/validate_author_artifacts.py --summary  # one line per kind; always 0
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import yaml

HUB = Path(__file__).resolve().parent.parent

# artifact kind -> (schema file, glob it governs)
KINDS: dict[str, tuple[str, str]] = {
    "gate": ("gate.schema.json", "official/*/gates/*.yaml"),
    "scope": ("scope.schema.json", "official/*/scopes/*.yaml"),
    "convention": ("convention-node.schema.json", "official/*/conventions/*.convention.yaml"),
}


def schema_dir() -> Path:
    """Where the installed core keeps its author schemas."""
    try:
        import atdd
    except ImportError as exc:  # pragma: no cover - CI installs it
        raise SystemExit(
            "cannot import `atdd`, so core's author schemas are unavailable.\n"
            "This script FAILS rather than skipping: a schema check that silently does "
            "nothing reports green over invalid files, which is the exact defect it "
            "exists to catch.\n"
            "  pip install 'git+https://github.com/afokapu/atdd.git@main'"
        ) from exc
    return Path(atdd.__file__).resolve().parent / "planner" / "schemas" / "author"


def check(path: Path, validator) -> list[str]:
    try:
        doc = yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as e:
        return [f"unparseable: {str(e).splitlines()[0]}"]
    if doc is None:
        return ["empty document"]
    return [
        f"{'.'.join(str(p) for p in e.path) or '<root>'}: {e.message}"
        for e in sorted(validator.iter_errors(doc), key=lambda e: list(e.path))
    ]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--summary", action="store_true",
                    help="one line per kind; always exit 0")
    args = ap.parse_args()

    try:
        import jsonschema
    except ImportError as exc:
        raise SystemExit("jsonschema is required: pip install jsonschema") from exc

    sdir = schema_dir()
    total = failures = 0
    for kind, (schema_file, pattern) in KINDS.items():
        schema = json.loads((sdir / schema_file).read_text(encoding="utf-8"))
        validator = jsonschema.Draft7Validator(schema)
        files = sorted(HUB.glob(pattern))
        bad = 0
        for f in files:
            errs = check(f, validator)
            total += 1
            if not errs:
                continue
            bad += 1
            failures += len(errs)
            if not args.summary:
                rel = f.relative_to(HUB)
                print(f"\n{rel}")
                for e in errs[:8]:
                    print(f"  - {e}")
                if len(errs) > 8:
                    print(f"  … {len(errs) - 8} more")
        if args.summary:
            print(f"  {'ok  ' if not bad else 'BAD '} {kind:12s} {len(files) - bad}/{len(files)} valid")

    if args.summary:
        return 0
    if failures:
        print(f"\n{failures} schema error(s) across {total} author artifacts")
        return 1
    print(f"{total} author artifacts valid against core's schemas")
    return 0


if __name__ == "__main__":
    sys.exit(main())
