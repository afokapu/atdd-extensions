#!/usr/bin/env node
// Detector: tester.convex.migration-naming  (disposition: documentation-only)
//
// A Convex migration is a TypeScript module under `convex/migrations/**` that
// exports a one-shot migration function (an `internalMutation`/`mutation`/etc., or
// a migrations-component `migration(...)`). For the persistence change and its test
// to stay traceable, a migration file MUST be named DETERMINISTICALLY from its
// migration id: the file's snake_case stem must equal the snake_case rendering of
// the exported migration function's name (the migration id). Convex addresses a
// migration as `migrations/<file_stem>:<exportName>` (e.g.
// `migrations/backfill_matches:backfillMatches`), so `backfill_matches.ts`
// exporting `backfillMatches` is derivable; any drift between the two is not.
//
// This is the Convex/TypeScript sibling of Core's `tester.migration.naming` (which
// renders Supabase `<timestamp>_<slug>.sql`). The agnostic invariant — a persistent
// contract has a backing store — stays in CORE; what lives here is the per-stack
// FILENAME-from-migration-id rendering for Convex migrations.
//
// CONTRACT (convex.workspace.runtime v1.1 — the JS sibling of the python-pytest
// provider contract). The provider (adapter/run.py) shells out to `node` over
// THIS file and communicates ONLY through env + a JSON report file:
//
//   INPUT   env ATDD_SCAN_ROOTS     JSON array of dir/file roots to inspect.
//           env ATDD_SCAN_EXCLUDES  JSON array of substring/segment excludes (optional).
//           env ATDD_VIOLATIONS_REPORT  path to write the JSON report to.
//   OUTPUT  {"violations": [{rule_id,file,line,col,evidence,source_line}, ...]}
//
// RAW factual channel only — the detector applies ZERO disposition. For a filename
// rule line/col are 1 and source_line is the basename. It exits 0 even when it
// finds violations; it exits non-zero only on a genuine runtime fault. UNLIKE the
// coder detectors, this one is scoped to the `convex/migrations/**` subtree.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, basename, extname, sep } from "node:path";

const RULE_ID = "tester.convex.migration-naming";

// Directories/segments never inspected: generated client code, deps, build out.
const DEFAULT_EXCLUDES = ["_generated", "node_modules", "dist", "build", ".next"];
const TS_EXT = new Set([".ts", ".tsx", ".js", ".mjs"]);
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

// The directory that scopes this rule — only files beneath a `migrations/` segment
// are migration artifacts.
const MIGRATIONS_DIR = "migrations";

// A barrel/registry that is not itself a migration artifact.
const NON_MIGRATION_BASENAMES = new Set(["index.ts", "index.js", "index.mjs"]);

// An exported migration function: `export const NAME = <ctor>( … )`. The ctor set
// covers the persistence-mutating Convex constructors a one-shot migration uses,
// plus the convex-helpers migrations component's `migration(`.
const MIGRATION_EXPORT_RE =
  /\bexport\s+const\s+(\w+)\s*=\s*(?:internalMutation|mutation|internalAction|action|migration)\s*\(/g;

// A deterministic snake_case stem: lowercase, digit-or-letter words joined by single
// underscores, no leading/trailing/double underscore.
const SNAKE_RE = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

function parseJsonEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function isExcluded(path, excludes) {
  const segs = path.split(sep);
  return excludes.some((ex) => segs.includes(ex) || path.includes(ex));
}

// True iff `file` lives beneath a directory segment named `migrations`.
function underMigrationsDir(file) {
  const segs = file.split(sep);
  for (let i = 0; i < segs.length - 1; i++) {
    if (segs[i] === MIGRATIONS_DIR) return true;
  }
  return false;
}

// camelCase / PascalCase -> snake_case. `backfillMatches` -> `backfill_matches`,
// `HTTPBackfill` -> `http_backfill`.
function snakeCase(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toLowerCase();
}

function* walk(root, excludes) {
  let st;
  try {
    st = statSync(root);
  } catch {
    return; // missing root — skip silently; a missing scan root is not a fault
  }
  if (st.isFile()) {
    if (TS_EXT.has(extname(root)) && !TEST_RE.test(root)) yield root;
    return;
  }
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    if (isExcluded(full, excludes)) continue;
    let cst;
    try {
      cst = statSync(full);
    } catch {
      continue;
    }
    if (cst.isDirectory()) {
      yield* walk(full, excludes);
    } else if (TS_EXT.has(extname(full)) && !TEST_RE.test(full)) {
      yield full;
    }
  }
}

function exportedMigrationNames(text) {
  const names = [];
  MIGRATION_EXPORT_RE.lastIndex = 0;
  let m;
  while ((m = MIGRATION_EXPORT_RE.exec(text)) !== null) names.push(m[1]);
  return names;
}

function checkFile(file, violations) {
  if (!underMigrationsDir(file)) return; // only migration artifacts are in scope
  const base = basename(file);
  if (NON_MIGRATION_BASENAMES.has(base)) return; // a barrel/registry, not a migration
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return;
  }
  const names = exportedMigrationNames(text);
  if (names.length === 0) return; // not a migration artifact (no migration export)

  const stem = base.replace(/\.[cm]?[jt]sx?$/, "");
  const expected = names.map(snakeCase);
  const derivable = SNAKE_RE.test(stem) && expected.includes(stem);
  if (derivable) return;

  violations.push({
    rule_id: RULE_ID,
    file,
    line: 1,
    col: 1,
    evidence:
      `migration file "${base}" is not named deterministically from its migration id — ` +
      `expected "${expected[0]}.ts" (snake_case of exported "${names[0]}")`,
    source_line: base,
  });
}

function main() {
  const reportPath = process.env.ATDD_VIOLATIONS_REPORT;
  if (!reportPath) {
    process.stderr.write("convex-detector: ATDD_VIOLATIONS_REPORT not set\n");
    process.exit(2);
  }
  const roots = parseJsonEnv("ATDD_SCAN_ROOTS", []);
  const excludes = [...DEFAULT_EXCLUDES, ...parseJsonEnv("ATDD_SCAN_EXCLUDES", [])];

  const violations = [];
  for (const root of roots) {
    for (const file of walk(root, excludes)) checkFile(file, violations);
  }

  writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
  process.stderr.write(
    `convex-detector: scanned ${roots.length} root(s), ${violations.length} violation(s)\n`,
  );
  process.exit(0); // run-health OK regardless of violation count (RAW channel)
}

main();
