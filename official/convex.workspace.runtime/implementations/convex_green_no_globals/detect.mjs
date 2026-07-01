#!/usr/bin/env node
// Detector: coder.convex.green-no-globals  (disposition: strict)
//
// GREEN guardrail GR-NOGLOBALS: "No globals/singletons; inject dependencies (even
// if manually)". A Convex server module MUST NOT stand up a module-level mutable
// singleton — a global DB handle, connection pool, or HTTP/service client — because
// it blocks testing and future dependency-injection refactors. This detector flags
// each such top-level construct. It is the Convex/TS realization of the agnostic
// green obligation (the guardrail also carries a `**/*.dart` variant); the
// obligation is stack-neutral, the detector is JS-specific.
//
// CONTRACT (convex.workspace.runtime v1.1): reads ATDD_SCAN_ROOTS / ATDD_SCAN_EXCLUDES,
// writes RAW {rule_id,file,line,col,evidence,source_line} violations to
// ATDD_VIOLATIONS_REPORT, exits 0 regardless of violation count (run-health, not a
// verdict). Skips _generated/, node_modules, build dirs, and *.test/*.spec files.
// Zero dependencies, no AST — a line scan for TOP-LEVEL (column-0) declarations.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, sep } from "node:path";

const RULE_ID = "coder.convex.green-no-globals";

const DEFAULT_EXCLUDES = ["_generated", "node_modules", "dist", "build", ".next"];
const TS_EXT = new Set([".ts", ".tsx", ".js", ".mjs"]);
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

// Only column-0 (module top-level) declarations are singletons; anything indented
// is inside a function/class/composition scope and is out of scope for this rule.
// A composition root (`composition.ts` / `wagon.ts`) is the one place wiring is
// allowed, so those filenames are exempt.
const EXEMPT_FILE = /(^|[\\/])(composition|wagon|main|server|index)\.[cm]?[jt]sx?$/;

// Named exported singletons of the DB/client/pool family.
const NAMED_SINGLETON = /^export\s+const\s+(db|client|pool|conn|connection|prisma|sql|redis|cache|database)\b\s*=/;
// Any exported const initialised with `new <Something>Client/Pool/Database/Connection(...)`.
const NEW_CLIENT = /^export\s+const\s+[A-Za-z_$][\w$]*\s*=\s*(await\s+)?new\s+[A-Za-z_$][\w$]*(Client|Pool|Database|Connection)\s*\(/;
// Mutation of a global/globalThis slot.
const GLOBAL_ASSIGN = /^(globalThis|global)\s*\.\s*[A-Za-z_$][\w$]*\s*=/;

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
    return;
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

function classify(line) {
  if (NAMED_SINGLETON.test(line)) return "module-level global singleton (DB/client/pool)";
  if (NEW_CLIENT.test(line)) return "module-level `new …Client/Pool/Database` singleton";
  if (GLOBAL_ASSIGN.test(line)) return "assignment to a global/globalThis slot";
  return null;
}

function scanFile(file, violations) {
  if (EXEMPT_FILE.test(file)) return; // composition roots may wire singletons
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return;
  }
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Only column-0 declarations are module-level singletons.
    if (/^\s/.test(line)) continue;
    const why = classify(line);
    if (!why) continue;
    violations.push({
      rule_id: RULE_ID,
      file,
      line: i + 1,
      col: 1,
      evidence: `${why} — inject the dependency instead (constructor/parameter injection)`,
      source_line: line.trim(),
    });
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
  process.exit(0);
}

main();
