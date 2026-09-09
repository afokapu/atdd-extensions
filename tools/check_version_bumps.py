#!/usr/bin/env python3
"""A package whose enforced behaviour changed must carry a new version.

Twice a rule contract changed under an unchanged version label, and both times core
caught it rather than this repo. A downstream lock records a VERSION; if the version
does not move, the lock cannot express the difference.

DERIVED FROM GIT, NOT FROM A CHECKED-IN LEDGER. The first version of this compared a
digest against `registry/version-digests.yaml`, regenerated with `--update`. That is
guard-by-discipline: anyone could run `--update` to make red go away and launder the
change through, which was demonstrated in one command. Its own docstring predicted the
risk and shipped anyway.

There is nothing to launder here. The question is asked of the DIFF: between the base
and HEAD, did any file that decides what this package enforces change, and did its
version change with them? A state file cannot be quietly re-recorded because there is
no state file.

Fixtures, tests and conformance are deliberately excluded. A better fixture does not
change what a consumer must satisfy, and coupling them would make the check cry wolf
on every test improvement until people learned to ignore it.

    python3 tools/check_version_bumps.py                  # against origin/main
    python3 tools/check_version_bumps.py --base <ref>     # against any base
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

import yaml

HUB = Path(__file__).resolve().parent.parent

# Path fragments that decide enforced behaviour. A change under any of these is a
# change to what a consumer must satisfy.
BEHAVIOUR = ("atdd.extension.yaml", "atdd.workspace.yaml", "conventions/",
             "relationships.yaml", "atdd.implementation.yaml", "/src/", "/checks/",
             "/lib/", "/_shared/")
# ...unless it is one of these, which describe the rule rather than define it.
NOT_BEHAVIOUR = ("/fixtures/", "/tests/", "/conformance/")


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=HUB, capture_output=True,
                          text=True).stdout.strip()


def is_behaviour(path: str) -> bool:
    if any(part in path for part in NOT_BEHAVIOUR):
        return False
    if Path(path).name.startswith("test_") or ".test." in path or ".spec." in path:
        return False
    return any(part in path for part in BEHAVIOUR)


def version_at(ref: str, pkg: str) -> str | None:
    for name in ("atdd.extension.yaml", "atdd.workspace.yaml"):
        blob = git("show", f"{ref}:official/{pkg}/{name}")
        if blob:
            try:
                return str((yaml.safe_load(blob) or {}).get("version"))
            except yaml.YAMLError:
                return None
    return None


def version_now(pkg: str) -> str | None:
    for name in ("atdd.extension.yaml", "atdd.workspace.yaml"):
        p = HUB / "official" / pkg / name
        if p.is_file():
            return str((yaml.safe_load(p.read_text()) or {}).get("version"))
    return None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--base", default="origin/main",
                    help="base ref to compare against (default: origin/main)")
    args = ap.parse_args()

    base = git("merge-base", args.base, "HEAD") or git("rev-parse", args.base)
    if not base:
        # A shallow clone cannot answer the question. Say so rather than pass: a check
        # that reports success when it could not look is the failure it exists to catch.
        print(f"cannot resolve base ref {args.base!r} — fetch history "
              f"(actions/checkout with fetch-depth: 0) so this can compare against it",
              file=sys.stderr)
        return 1

    changed = [p for p in git("diff", "--name-only", f"{base}...HEAD").splitlines()
               if p.startswith("official/")]
    if not changed:
        print(f"no package files changed since {base[:8]}")
        return 0

    touched: dict[str, list[str]] = {}
    for path in changed:
        parts = path.split("/")
        if len(parts) < 2 or not is_behaviour(path):
            continue
        touched.setdefault(parts[1], []).append(path)

    stale: list[tuple[str, list[str]]] = []
    for pkg, paths in sorted(touched.items()):
        was, now = version_at(base, pkg), version_now(pkg)
        if was is None or now is None:
            continue                       # new package: nothing to compare against
        if was == now:
            stale.append((pkg, paths))

    if stale:
        print(f"{len(stale)} package(s) changed enforced behaviour without a version "
              f"bump (base {base[:8]}):\n", file=sys.stderr)
        for pkg, paths in stale:
            print(f"  {pkg}  still {version_now(pkg)}", file=sys.stderr)
            for p in paths[:4]:
                print(f"      {p}", file=sys.stderr)
            if len(paths) > 4:
                print(f"      … and {len(paths) - 4} more", file=sys.stderr)
        print("\nA downstream lock records a VERSION, so a version that does not move "
              "cannot express the change. Bump each package's manifest and its "
              "registry/entries/*.yaml, then regenerate the index.", file=sys.stderr)
        return 1

    n = len(touched)
    print(f"{n} package(s) changed enforced behaviour; every one carries a version bump"
          if n else "no enforced behaviour changed since " + base[:8])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
