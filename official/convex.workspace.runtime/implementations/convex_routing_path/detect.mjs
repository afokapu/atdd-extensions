#!/usr/bin/env node
// Detector: tester.convex.routing-path  (disposition: documentation-only)
//
// The Convex/TypeScript sibling of the CORE rule `tester.routing.path`
// (TESTER-ROUTING-PATH-001): "Test path determines the runtime that executes it
// (python/ vs supabase/ vs web/)." The path a test lives in must be consistent with
// the runtime that runs it. A `*.test.ts`/`*.spec.ts` file is collected and run by
// node/Vitest — a TypeScript runtime. If such a file DECLARES a non-TypeScript
// runtime in its `# Runtime:` / `// Runtime:` header (python / dart / go / kotlin /
// java / ruby / rust), the FILE PATH (`.test.ts`, a TS runtime) contradicts the
// declared runtime: a python-runtime test must be rendered as `test_*.py`, a dart
// one as `*_test.dart`, etc. — never `.test.ts`. That mis-routing is flagged.
//
// TS-family runtimes are accepted: typescript / ts / convex / supabase / preact /
// vite / astro / node / js / javascript / deno.
//
// SCOPE — `*.test.ts`/`*.spec.ts`(x) files declaring a `Runtime:` header. CONTRACT:
// convex.workspace.runtime v1.1 (ATDD_SCAN_ROOTS / ATDD_VIOLATIONS_REPORT, RAW
// report, exit 0). Zero deps, no AST.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, sep, basename } from "node:path";

const RULE_ID = "tester.convex.routing-path";
const DEFAULT_EXCLUDES = ["_generated", "node_modules", "dist", "build", ".next"];
const TS_EXT = new Set([".ts", ".tsx"]);
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;
const RUNTIME_RE = /(?:^|\n)\s*(?:\/\/|#)\s*Runtime:\s*([A-Za-z0-9_-]+)/;
const TS_FAMILY = new Set([
  "typescript", "ts", "convex", "supabase", "preact", "vite", "astro",
  "node", "js", "javascript", "deno",
]);

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
function main() {
  const reportPath = process.env.ATDD_VIOLATIONS_REPORT;
  if (!reportPath) { process.stderr.write("convex-detector: ATDD_VIOLATIONS_REPORT not set\n"); process.exit(2); }
  const roots = parseJsonEnv("ATDD_SCAN_ROOTS", []);
  const excludes = [...DEFAULT_EXCLUDES, ...parseJsonEnv("ATDD_SCAN_EXCLUDES", [])];
  const violations = [];
  for (const root of roots) {
    for (const file of walk(root, excludes)) {
      const b = basename(file);
      if (!TEST_RE.test(b)) continue;
      let text;
      try { text = readFileSync(file, "utf8"); } catch { continue; }
      const m = RUNTIME_RE.exec(text);
      if (!m) continue; // no declared runtime — nothing to contradict
      const declared = m[1].toLowerCase();
      if (TS_FAMILY.has(declared)) continue;
      const before = text.slice(0, m.index + m[0].length);
      const lineNo = before.split(/\r?\n/).length;
      const lines = text.split(/\r?\n/);
      violations.push({
        rule_id: RULE_ID, file, line: lineNo, col: 1,
        evidence: "a *.test.ts file (TypeScript/Vitest runtime) declares non-TypeScript runtime '" + declared + "' — path contradicts runtime",
        source_line: (lines[lineNo - 1] || "").trim(),
      });
    }
  }
  writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
  process.stderr.write("convex-detector: " + violations.length + " routing-path violation(s)\n");
  process.exit(0);
}
main();
