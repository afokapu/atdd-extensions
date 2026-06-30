#!/usr/bin/env node
// Detector: coder.convex.http-router-at-root  (disposition: strict)
//
// Convex exposes custom HTTP endpoints through `httpAction(...)` handlers that must
// be registered on a router exported from `convex/http.ts` at the convex root —
// Convex auto-loads `convex/http.ts` to mount the HTTP API. If any server module
// uses `httpAction(` but the convex root has no `http.ts` directly under it, those
// handlers are never routed (the HTTP API is silently absent). This detector
// asserts, per scan root: if `httpAction(` appears anywhere under the root, a
// `http.ts` file must sit DIRECTLY under that root.
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

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, sep } from "node:path";

const RULE_ID = "coder.convex.http-router-at-root";

// The router module Convex auto-loads from the convex root to mount the HTTP API.
const HTTP_FILE = "http.ts";

// Directories/segments never inspected: generated client code, deps, build out,
// and test files.
const DEFAULT_EXCLUDES = ["_generated", "node_modules", "dist", "build", ".next"];
const TS_EXT = new Set([".ts", ".tsx", ".js", ".mjs"]);
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

// httpAction( … ) — the call that mandates a router. Capture column of the token.
const HTTP_ACTION_RE = /\bhttpAction\s*\(/g;

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

// True iff a regular file `http.ts` exists directly under `root`.
function hasHttpAtRoot(root) {
  try {
    return statSync(join(root, HTTP_FILE)).isFile();
  } catch {
    return false; // missing (ENOENT) or not a regular file → no router at root
  }
}

// Find the first `httpAction(` call site under `root`, or null if none is used.
// Returns {file, line, col, source_line} so the violation can point at the usage
// that demands a router.
function firstHttpActionSite(root, excludes) {
  for (const file of walk(root, excludes)) {
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      HTTP_ACTION_RE.lastIndex = 0;
      const m = HTTP_ACTION_RE.exec(lines[i]);
      if (m !== null) {
        return { file, line: i + 1, col: m.index + 1, source_line: lines[i].trim() };
      }
    }
  }
  return null;
}

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
  const excludes = [...DEFAULT_EXCLUDES, ...parseJsonEnv("ATDD_SCAN_EXCLUDES", [])];

  const violations = [];
  for (const root of roots) {
    if (!isExistingDir(root)) continue; // missing root — skip silently, not a fault
    if (hasHttpAtRoot(root)) continue; // router present — nothing to require
    const site = firstHttpActionSite(root, excludes);
    if (site === null) continue; // no httpAction usage — http.ts not required
    violations.push({
      rule_id: RULE_ID,
      file: join(root, HTTP_FILE), // the router path Convex expects but did not find
      line: 0, // structural (missing-file) violation — no source line in http.ts
      col: 0,
      evidence: `httpAction( used (${site.file}:${site.line}) but convex root has no ${HTTP_FILE} (Convex auto-loads convex/${HTTP_FILE})`,
      source_line: site.source_line, // the httpAction call site that demands a router
    });
  }

  writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
  process.stderr.write(
    `convex-detector: scanned ${roots.length} root(s), ${violations.length} violation(s)\n`,
  );
  process.exit(0); // run-health OK regardless of violation count (RAW channel)
}

main();
