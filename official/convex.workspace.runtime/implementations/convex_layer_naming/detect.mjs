#!/usr/bin/env node
// Detector: coder.convex.layer-naming  (disposition: suppress-and-clean)
//
// The Convex stack uses a 4-layer feature architecture. Each layer a feature uses
// is rendered as a file named after the layer: `api.ts` (presentation), and
// `application.ts` / `domain.ts` / `integration.ts`. A feature module that is NOT
// named after one of those layers (and is not a recognized structural file) hides
// where it sits in the layering — it is an un-layered or mis-named module. This
// detector flags each such feature-level module so it can be renamed onto a layer.
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
// finds violations; it exits non-zero only on a genuine runtime fault.

import { writeFileSync, statSync, readdirSync } from "node:fs";
import { join, basename, dirname, extname, sep } from "node:path";

const RULE_ID = "coder.convex.layer-naming";

// Directories/segments never inspected: generated client code, deps, build out.
const DEFAULT_EXCLUDES = ["_generated", "node_modules", "dist", "build", ".next"];
const TS_EXT = new Set([".ts", ".tsx", ".js", ".mjs"]);
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

// The closed set of layer file names a feature module may carry. `api.ts` is the
// presentation layer's rendering (Convex queries/mutations/actions live there).
const ALLOWED_LAYER = new Set([
  "api.ts",
  "application.ts",
  "domain.ts",
  "integration.ts",
]);

// Structural / non-layer files that are legitimately NOT named after a layer:
// wagon + feature wiring, public barrels, train manifests, and the two Convex
// root modules. None of these are feature layer modules, so none are flagged.
const STRUCTURAL = new Set([
  "wagon.ts",
  "composition.ts",
  "index.ts",
  "trains.ts",
  "schema.ts",
  "http.ts",
]);

// Directories a PROMOTED layer expands into (`domain/` holding `domain/cell.ts`,
// ...). A file whose immediate parent is one of these is a member of an
// already-promoted layer — its naming is governed by feature-layout-promotion, not
// by this rule — so it is exempt here.
const LAYER_DIRS = new Set([
  "api",
  "application",
  "domain",
  "integration",
  "presentation",
]);

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

function checkFile(file, violations) {
  const base = basename(file);
  if (ALLOWED_LAYER.has(base)) return; // a properly named layer file
  if (STRUCTURAL.has(base)) return; // wiring / barrel / Convex root module
  if (LAYER_DIRS.has(basename(dirname(file)))) return; // member of a promoted layer dir
  violations.push({
    rule_id: RULE_ID,
    file,
    line: 1,
    col: 1,
    evidence:
      `feature module "${base}" is not named after a Convex layer ` +
      `(expected one of api.ts / application.ts / domain.ts / integration.ts)`,
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
