#!/usr/bin/env node
// Detector: coder.convex.api-no-underscore-dir  (disposition: strict)
//
// Convex turns a module's PATH into its API path: `convex/foo/bar.ts` exporting
// `myQuery` becomes `api.foo.bar.myQuery`. As a hard rule of that auto-discovery,
// Convex EXCLUDES any path that contains an underscore-prefixed directory segment
// (`_internal/`, `_lib/`, `_generated/`, ...) from the registered API surface — a
// module there is never callable as `api.*` / `internal.*`. So an exported
// `query`/`mutation`/`action` (or its `internal*` sibling) that sits under an
// `_`-prefixed dir is a silent dead end: it compiles, it deploys, and it can never
// be invoked. This detector flags each such export.
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
// even when it finds violations (finding violations is not a run error); it exits
// non-zero only on a genuine runtime fault.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, sep } from "node:path";

const RULE_ID = "coder.convex.api-no-underscore-dir";

// Directories/segments never inspected: generated client code, deps, build out,
// and test files (a test is not part of the API surface).
const DEFAULT_EXCLUDES = ["_generated", "node_modules", "dist", "build", ".next"];
const TS_EXT = new Set([".ts", ".tsx", ".js", ".mjs"]);
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

// An exported Convex API entity: `export const NAME = <ctor>( … )`. The ctor set is
// the path-addressed function family Convex registers — both the public
// (`query`/`mutation`/`action`) and `internal*` forms; ALL of them are excluded
// from the surface when under an `_`-prefixed dir. `httpAction` is deliberately
// NOT here: HTTP handlers are mounted via the `http.ts` router, not by path.
const API_EXPORT_RE =
  /\bexport\s+const\s+(\w+)\s*=\s*(internalQuery|internalMutation|internalAction|query|mutation|action)\s*\(/g;

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

// The first path segment that is an `_`-prefixed DIRECTORY (i.e. not the file's own
// basename), or null if the path sits entirely on the API surface. `_generated` is
// already excluded from traversal, so in practice this catches `_internal`, `_lib`,
// etc. The basename is skipped — a file like `_helpers.ts` is a module name, not a
// directory carve-out, and Convex registers it (only DIR segments are excluded).
function underscoreDirSegment(path) {
  const segs = path.split(sep);
  for (let i = 0; i < segs.length - 1; i++) {
    if (segs[i].startsWith("_")) return segs[i];
  }
  return null;
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

function scanFile(file, violations) {
  const seg = underscoreDirSegment(file);
  if (!seg) return; // file is on the API surface — its exports are reachable
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return;
  }
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    API_EXPORT_RE.lastIndex = 0;
    let m;
    while ((m = API_EXPORT_RE.exec(line)) !== null) {
      violations.push({
        rule_id: RULE_ID,
        file,
        line: i + 1,
        col: m.index + 1,
        evidence:
          `exported ${m[2]} "${m[1]}" lives under "${seg}/" — Convex excludes ` +
          `underscore-prefixed dirs from the API surface, so it is never callable`,
        source_line: line.trim(),
      });
    }
  }
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
