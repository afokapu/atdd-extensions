#!/usr/bin/env node
// Detector: coder.convex.feature-layout-promotion  (disposition: advisory)
//
// A Convex feature layer starts life as a single file (`api.ts`, `application.ts`,
// `domain.ts`, `integration.ts`). It should be PROMOTED to a directory
// (`<layer>/index.ts` + `<layer>/<topic>.ts`) once it outgrows that single file —
// the project threshold is > 150 lines OR > 3 exported entities. A single-file
// layer past either threshold has stopped being discoverable at a glance and is due
// for promotion. This advisory detector flags each single-file layer over threshold.
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
// RAW factual channel only — the detector applies ZERO disposition. It exits 0
// even when it finds violations; it exits non-zero only on a genuine runtime fault.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, basename, extname, sep } from "node:path";

const RULE_ID = "coder.convex.feature-layout-promotion";

// Directories/segments never inspected: generated client code, deps, build out,
// and test files.
const DEFAULT_EXCLUDES = ["_generated", "node_modules", "dist", "build", ".next"];
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

// The single-file layer renderings this rule watches for promotion. Once a layer is
// promoted to a directory, its members are no longer one of these basenames and are
// not flagged (the dir layout is the desired end state).
const SINGLE_FILE_LAYERS = new Set([
  "api.ts",
  "application.ts",
  "domain.ts",
  "integration.ts",
]);

// Promotion thresholds (project policy): promote a single-file layer to a directory
// once it exceeds EITHER bound.
const MAX_LINES = 150;
const MAX_EXPORTS = 3;

// A top-level exported ENTITY declaration: `export const/let/var/function/async
// function/class/abstract class/type/interface/enum NAME` or `export default`.
// Re-export forms (`export { ... }`, `export * from ...`) are not entity
// declarations and are not counted.
const EXPORT_DECL_RE =
  /^\s*export\s+(?:default\b|(?:abstract\s+)?class\b|(?:async\s+)?function\b|const\b|let\b|var\b|type\b|interface\b|enum\b)/;

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
    if (SINGLE_FILE_LAYERS.has(basename(root)) && !TEST_RE.test(root)) yield root;
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
    } else if (SINGLE_FILE_LAYERS.has(basename(full)) && !TEST_RE.test(full)) {
      yield full;
    }
  }
}

function countExports(lines) {
  let n = 0;
  for (const line of lines) if (EXPORT_DECL_RE.test(line)) n++;
  return n;
}

function scanFile(file, violations) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return;
  }
  const lines = text.split(/\r?\n/);
  // A trailing newline yields a final empty element; count physical lines as the
  // number of line separators + 1 only when the last element is non-empty.
  const lineCount =
    lines.length > 0 && lines[lines.length - 1] === "" ? lines.length - 1 : lines.length;
  const exportCount = countExports(lines);

  const overLines = lineCount > MAX_LINES;
  const overExports = exportCount > MAX_EXPORTS;
  if (!overLines && !overExports) return;

  const reasons = [];
  if (overLines) reasons.push(`${lineCount} lines (> ${MAX_LINES})`);
  if (overExports) reasons.push(`${exportCount} exported entities (> ${MAX_EXPORTS})`);
  violations.push({
    rule_id: RULE_ID,
    file,
    line: 1,
    col: 1,
    evidence:
      `single-file layer "${basename(file)}" has ${reasons.join(" and ")} — ` +
      `promote it to a "<layer>/" directory (index.ts + <topic>.ts)`,
    source_line: basename(file),
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
    for (const file of walk(root, excludes)) scanFile(file, violations);
  }

  writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
  process.stderr.write(
    `convex-detector: scanned ${roots.length} root(s), ${violations.length} violation(s)\n`,
  );
  process.exit(0); // run-health OK regardless of violation count (RAW channel)
}

main();
