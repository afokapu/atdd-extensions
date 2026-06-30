#!/usr/bin/env node
// Detector: coder.convex.schema-at-root  (disposition: strict)
//
// Convex auto-loads `convex/schema.ts` at the convex function root to define the
// database schema. An app whose convex root has no `schema.ts` directly under it
// ships without a declared schema — Convex falls back to an implicit, unvalidated
// table shape. This detector asserts, per scan root, that a `schema.ts` file sits
// DIRECTLY under the root (Convex does not recurse for the schema module).
//
// CONTRACT (atdd.workspace.convex v1.1 — the JS sibling of the python-pytest
// provider contract). The provider (adapter/run.py) shells out to `node` over
// THIS file and communicates ONLY through env + a JSON report file:
//
//   INPUT   env ATDD_SCAN_ROOTS     JSON array of convex/ roots to inspect.
//           env ATDD_SCAN_EXCLUDES  JSON array of substring/segment excludes (optional).
//           env ATDD_VIOLATIONS_REPORT  path to write the JSON report to.
//   OUTPUT  {"violations": [{rule_id,file,line,col,evidence,source_line}, ...]}
//
// RAW factual channel only — the detector applies ZERO disposition. It exits 0
// even when it finds violations (finding violations is not a run error); it exits
// non-zero only on a genuine runtime fault.

import { writeFileSync, statSync } from "node:fs";
import { join } from "node:path";

const RULE_ID = "coder.convex.schema-at-root";

// The module Convex auto-loads from the convex root. Must sit DIRECTLY under each
// scan root (no recursion — Convex does not look in subdirectories for it).
const SCHEMA_FILE = "schema.ts";

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

// True iff a regular file `schema.ts` exists directly under `root`.
function hasSchemaAtRoot(root) {
  try {
    return statSync(join(root, SCHEMA_FILE)).isFile();
  } catch {
    return false; // missing (ENOENT) or not a regular file → no schema at root
  }
}

// True iff `root` itself resolves to a directory we should inspect. A missing scan
// root is not a fault (mirrors the reference detector) — it is simply skipped.
function isExistingDir(root) {
  try {
    return statSync(root).isDirectory();
  } catch {
    return false;
  }
}

function main() {
  const reportPath = process.env.ATDD_VIOLATIONS_REPORT;
  if (!reportPath) {
    process.stderr.write("convex-detector: ATDD_VIOLATIONS_REPORT not set\n");
    process.exit(2);
  }
  const roots = parseJsonEnv("ATDD_SCAN_ROOTS", []);

  const violations = [];
  for (const root of roots) {
    if (!isExistingDir(root)) continue; // missing root — skip silently, not a fault
    if (hasSchemaAtRoot(root)) continue;
    violations.push({
      rule_id: RULE_ID,
      file: join(root, SCHEMA_FILE), // the path Convex expects but did not find
      line: 0, // structural (missing-file) violation — no source line
      col: 0,
      evidence: `convex root has no ${SCHEMA_FILE} (Convex auto-loads convex/${SCHEMA_FILE})`,
      source_line: "",
    });
  }

  writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
  process.stderr.write(
    `convex-detector: scanned ${roots.length} root(s), ${violations.length} violation(s)\n`,
  );
  process.exit(0); // run-health OK regardless of violation count (RAW channel)
}

main();
