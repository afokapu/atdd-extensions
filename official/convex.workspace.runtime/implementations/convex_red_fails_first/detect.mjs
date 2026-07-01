#!/usr/bin/env node
// Detector: tester.convex.red-fails-first  (disposition: documentation-only)
//
// The Convex/TypeScript sibling of the CORE rule `tester.red.fails-first`
// (TESTER-RED-FAILS-FIRST-001): "RED tests must fail on first run before
// implementation begins." Whether a test ACTUALLY fails is a runtime property, but
// CORE gives the decidable structural proxy in red.convention.yaml → red_patterns
// (typescript) + validation_levels.2_structure ("RED marker present"): a RED-phase
// test file MUST contain at least one guaranteed-fail RED marker so it cannot
// spuriously pass before the implementation exists. This detector flags any
// `# Phase: RED` / `// Phase: RED` Vitest test file that contains NONE of the CORE
// TypeScript RED markers.
//
// RED markers (from red.convention.yaml::red_patterns.typescript, plus equivalents):
//   throw new Error('Not implemented ...')     expect(false).toBe(true)
//   return Promise.reject(new Error(...))       expect(true).toBe(false)
//   expect.fail(...)                            throw new UnimplementedError(...)
//   it.fails( / test.fails(
//
// SCOPE — `*.test.ts`/`*.spec.ts`(x) whose header declares `Phase: RED`. CONTRACT:
// convex.workspace.runtime v1.1 (ATDD_SCAN_ROOTS / ATDD_VIOLATIONS_REPORT, RAW
// report, exit 0). Zero deps, no AST.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, sep, basename } from "node:path";

const RULE_ID = "tester.convex.red-fails-first";
const DEFAULT_EXCLUDES = ["_generated", "node_modules", "dist", "build", ".next"];
const TS_EXT = new Set([".ts", ".tsx"]);
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;
const PHASE_RED_RE = /(^|\n)\s*(?:\/\/|#)\s*Phase:\s*RED\b/;

const RED_MARKERS = [
  /throw\s+new\s+Error\s*\(\s*['"`][^'"`]*[Nn]ot\s+[Ii]mplemented/,
  /throw\s+new\s+UnimplementedError\b/,
  /expect\s*\(\s*false\s*\)\s*\.toBe\s*\(\s*true\s*\)/,
  /expect\s*\(\s*true\s*\)\s*\.toBe\s*\(\s*false\s*\)/,
  /expect\s*\.fail\s*\(/,
  /return\s+Promise\.reject\s*\(/,
  /\b(?:it|test)\.fails\s*\(/,
];

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
      const m = PHASE_RED_RE.exec(text);
      if (!m) continue; // not a RED-phase test
      if (RED_MARKERS.some((re) => re.test(text))) continue; // has a guaranteed-fail marker
      // Report at the `Phase: RED` header line.
      const before = text.slice(0, m.index + m[1].length);
      const lineNo = before.split(/\r?\n/).length;
      const lines = text.split(/\r?\n/);
      violations.push({
        rule_id: RULE_ID, file, line: lineNo, col: 1,
        evidence: "RED-phase test contains no guaranteed-fail RED marker (may spuriously pass before implementation exists)",
        source_line: (lines[lineNo - 1] || "").trim(),
      });
    }
  }
  writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
  process.stderr.write("convex-detector: " + violations.length + " red-fails-first violation(s)\n");
  process.exit(0);
}
main();
