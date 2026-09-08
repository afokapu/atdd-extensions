#!/usr/bin/env python3
"""Every interlocking DOCUMENT in the hub validates against core's schema — and the
ones that are meant to be invalid stay invalid.

Both halves matter. Nothing checked the first, so all 50 artifacts disagreed with
`train-interlocking.schema.json` while every suite stayed green: the fixtures the
hub ships as exemplars were teaching a shape core rejects.

The second half is the guard on the guard. Three fixtures exist precisely BECAUSE
they are invalid — they carry the parallel reachability fields (`runtime_exposure`,
`station_actions`, `exposed_actions`) that a consumer invents instead of the
declared `entrypoint`, and the rules that catch that drift are tested against them.
"Fixing" those files would silently disable those rules, which is exactly the kind
of well-meant repair this hub keeps having to catch. So they are listed here with a
reason, and it is a FAILURE if one of them starts validating.

A document is identified by its CONTENT — a root `interlocking_id` and routes that
name a `train_id` — never by its path. `plan/_trains/_interlockings/` also holds
frontend route registries, which answer to a different schema; core's own
`entrypoint` description asks extension validators not to infer from filenames, and
a first cut of this migration did exactly that and corrupted a registry fixture.

    python3 tools/validate_interlocking_artifacts.py
"""
from __future__ import annotations

import json
import pathlib
import sys

import yaml

HUB = pathlib.Path(__file__).resolve().parent.parent

# Fixtures that MUST NOT validate, and why. Each demonstrates an artifact-level
# defect that a rule is tested against; making it conform would disarm that rule.
DELIBERATELY_INVALID = {
    "fail/parallel_reachability_field_used":
        "declares runtime_exposure/station_actions instead of entrypoint — the "
        "forked-reachability drift coder.train.interlocking-bilateral-binding rejects",
    "dirty_parallel_field/plan":
        "declares exposed_actions beside entrypoint — the same fork, bun/convex mirrors",
}


def load_schema() -> dict:
    try:
        import atdd
    except ImportError:
        print("cannot import `atdd`; install core so this check can actually run:\n"
              "  pip install 'git+https://github.com/afokapu/atdd.git@main'", file=sys.stderr)
        raise SystemExit(1)
    p = (pathlib.Path(atdd.__file__).resolve().parent / "planner" / "schemas"
         / "train-interlocking.schema.json")
    return json.loads(p.read_text())


def is_document(doc: object) -> bool:
    """A train-interlocking DOCUMENT, judged by what the file claims about itself."""
    if not isinstance(doc, dict) or "interlocking_id" not in doc:
        return False
    routes = doc.get("routes") or []
    return any(isinstance(r, dict) and "train_id" in r for r in routes)


def fixture_name(path: pathlib.Path) -> str:
    parts = path.parts
    if "fixtures" in parts:
        i = parts.index("fixtures")
        return "/".join(parts[i + 1:i + 3])
    return path.name


def main() -> int:
    from jsonschema import Draft202012Validator

    validator = Draft202012Validator(load_schema())
    invalid: list[tuple[pathlib.Path, list]] = []
    wrongly_valid: list[pathlib.Path] = []
    docs = registries = valid = expected_invalid = 0

    for path in sorted(HUB.glob("official/**/_interlockings/*.yaml")):
        try:
            doc = yaml.safe_load(path.read_text())
        except yaml.YAMLError as e:
            print(f"unparseable: {path}: {e}", file=sys.stderr)
            return 1
        if not is_document(doc):
            registries += 1
            continue
        docs += 1
        errors = list(validator.iter_errors(doc))
        expected_bad = fixture_name(path) in DELIBERATELY_INVALID
        if expected_bad:
            expected_invalid += 1
        if errors and not expected_bad:
            invalid.append((path, errors))
        elif not errors and expected_bad:
            wrongly_valid.append(path)
        elif not errors:
            valid += 1

    if invalid:
        print(f"{len(invalid)} interlocking document(s) do not match core's schema:\n",
              file=sys.stderr)
        for path, errors in invalid:
            print(f"  {path.relative_to(HUB)}", file=sys.stderr)
            for e in errors[:4]:
                loc = "/".join(str(p) for p in e.path) or "<root>"
                print(f"      {loc}: {e.message[:110]}", file=sys.stderr)

    if wrongly_valid:
        print(f"\n{len(wrongly_valid)} fixture(s) that must stay INVALID now validate:\n",
              file=sys.stderr)
        for path in wrongly_valid:
            name = fixture_name(path)
            print(f"  {path.relative_to(HUB)}\n      {DELIBERATELY_INVALID[name]}",
                  file=sys.stderr)
        print("\nA rule is tested against each of these. Conforming them disarms it — "
              "restore the defect, or delete the rule deliberately.", file=sys.stderr)

    if invalid or wrongly_valid:
        return 1
    print(f"{valid}/{docs} interlocking document(s) valid against core's schema; "
          f"{expected_invalid} deliberately invalid and still invalid; "
          f"{registries} route registr{'y' if registries == 1 else 'ies'} skipped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
