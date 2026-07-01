#!/usr/bin/env node
// Detector: tester.convex.smoke-observable-assertion  (disposition: documentation-only)
//
// The Convex/TypeScript sibling of the CORE rule
// `tester.smoke.operator-observable-assertion` (#843). A SMOKE test that performs a
// STATE-MUTATING call MUST assert on operator-observable state (a database row read
// back, a query result) — not merely on the HTTP response shape or an intermediate
// artifact write. A smoke that POSTs/PUTs/PATCHes/DELETEs (or invokes a Convex
// mutation) but never queries the resulting state proves nothing about persistence;
// it is false-positive green (the CORE convention's `db_assertion_present` check and
// `response_only_assertions` anti-pattern).
//
// DECIDABLE realization: within a smoke test file, if a state-mutating call appears
// but NO observable/DB read-back assertion appears anywhere in the file, flag the
// first mutating call. Mutating calls: `.post(`/`.put(`/`.patch(`/`.delete(`,
// `.mutation(`, `runMutation(`. Observable read-backs: `.query(`/`runQuery(`,
// `.select(`, `.get(`, `.collect(`, `.first(`, `.unique(`.
//
// SCOPE — only smoke tests (basename contains `smoke`, or header `Phase: SMOKE` /
// `Smoke: true`). CONTRACT: convex.workspace.runtime v1.1 (ATDD_SCAN_ROOTS /
// ATDD_VIOLATIONS_REPORT, RAW report, exit 0). Zero deps, no AST.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, sep, basename } from "node:path";

const RULE_ID = "tester.convex.smoke-observable-assertion";
const DEFAULT_EXCLUDES = ["_generated", "node_modules", "dist", "build", ".next"];
const TS_EXT = new Set([".ts", ".tsx"]);
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

const MUTATING_RE = /\.(post|put|patch|delete)\s*\(|\.mutation\s*\(|\brunMutation\s*\(/;
const OBSERVABLE_RE = /\.query\s*\(|\brunQuery\s*\(|\.select\s*\(|\.get\s*\(|\.collect\s*\(|\.first\s*\(|\.unique\s*\(/;

function parseJsonEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : fallback; } catch { return fallback; }
}
function isExcluded(path, excludes) {
  const segs = path.split(sep);
  return excludes.some((ex) => segs.includes(ex) || path.includes(ex));
}
function* walk(root, excludes) {
  let st;
  try { st = statSync(root); } catch { return; }
  if (st.isFile()) { if (TS_EXT.has(extname(root))) yield root; return; }
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    if (isExcluded(full, excludes)) continue;
    let cst;
    try { cst = statSync(full); } catch { continue; }
    if (cst.isDirectory()) yield* walk(full, excludes);
    else if (TS_EXT.has(extname(full))) yield full;
  }
}
function isSmokeTest(file, text) {
  const b = basename(file).toLowerCase();
  if (!TEST_RE.test(b)) return false;
  if (b.includes("smoke")) return true;
  const head = text.slice(0, 2000);
  return /(^|\n)\s*(?:\/\/|#)\s*Phase:\s*SMOKE\b/.test(head) || /(^|\n)\s*(?:\/\/|#)\s*Smoke:\s*true\b/i.test(head);
}
function main() {
  const reportPath = process.env.ATDD_VIOLATIONS_REPORT;
  if (!reportPath) { process.stderr.write("convex-detector: ATDD_VIOLATIONS_REPORT not set\n"); process.exit(2); }
  const roots = parseJsonEnv("ATDD_SCAN_ROOTS", []);
  const excludes = [...DEFAULT_EXCLUDES, ...parseJsonEnv("ATDD_SCAN_EXCLUDES", [])];
  const violations = [];
  for (const root of roots) {
    for (const file of walk(root, excludes)) {
      let text;
      try { text = readFileSync(file, "utf8"); } catch { continue; }
      if (!isSmokeTest(file, text)) continue;
      const hasObservable = OBSERVABLE_RE.test(text);
      if (hasObservable) continue; // an observable/DB read-back assertion is present somewhere
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const m = MUTATING_RE.exec(lines[i]);
        if (m) {
          violations.push({
            rule_id: RULE_ID, file, line: i + 1, col: m.index + 1,
            evidence: "state-mutating smoke call with no observable/DB read-back assertion in the file (response-only)",
            source_line: lines[i].trim(),
          });
          break; // one violation per file — the file lacks any observable assertion
        }
      }
    }
  }
  writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
  process.stderr.write("convex-detector: " + violations.length + " smoke-observable violation(s)\n");
  process.exit(0);
}
main();
