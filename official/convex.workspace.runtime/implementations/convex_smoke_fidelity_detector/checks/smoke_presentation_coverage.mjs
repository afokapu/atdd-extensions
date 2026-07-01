#!/usr/bin/env node
// Detector: tester.convex.smoke-presentation-coverage  (disposition: documentation-only)
//
// The Convex/TypeScript sibling of the CORE rule `tester.smoke.pres`
// (TESTER-SMOKE-PRES-001): "Every web/src/*/presentation/*.tsx must have a sibling
// smoke test under e2e/*smoke*.spec.ts". Steady-state coverage (issue #293): a
// presentation component with no smoke spec is a silent gap — 63/63 structural
// tests once passed while the match page rendered blank (#318).
//
// DECIDABLE realization over supplied scan roots: (1) collect every presentation
// component — a `.tsx` under a `presentation/` path segment; (2) collect every
// smoke spec — a file whose basename contains `smoke` and ends `.spec.ts`/`.test.ts`
// /`.spec.tsx`/`.test.tsx`; (3) a presentation component is COVERED iff some smoke
// spec's PATH contains the component's wagon token (the path segment immediately
// before `presentation`) as a word-boundary token. Uncovered components are flagged
// at line 1.
//
// SCOPE — presentation `.tsx` files only. CONTRACT: convex.workspace.runtime v1.1
// (ATDD_SCAN_ROOTS / ATDD_VIOLATIONS_REPORT, RAW report, exit 0). Zero deps.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, sep, basename } from "node:path";

const RULE_ID = "tester.convex.smoke-presentation-coverage";
const DEFAULT_EXCLUDES = ["_generated", "node_modules", "dist", "build", ".next"];
const SMOKE_SPEC_RE = /\.(test|spec)\.[jt]sx?$/;

function parseJsonEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : fallback; } catch { return fallback; }
}
function isExcluded(path, excludes) {
  const segs = path.split(sep);
  return excludes.some((ex) => segs.includes(ex) || path.includes(ex));
}
function* walkAll(root, excludes) {
  let st;
  try { st = statSync(root); } catch { return; }
  if (st.isFile()) { yield root; return; }
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    if (isExcluded(full, excludes)) continue;
    let cst;
    try { cst = statSync(full); } catch { continue; }
    if (cst.isDirectory()) yield* walkAll(full, excludes);
    else yield full;
  }
}
// wagon token = path segment immediately before a `presentation` segment.
function wagonOf(file) {
  const segs = file.split(sep);
  const idx = segs.lastIndexOf("presentation");
  return idx > 0 ? segs[idx - 1] : "";
}
function hasToken(path, token) {
  if (!token) return false;
  return new RegExp("(^|[^a-z0-9])" + token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^a-z0-9]|$)", "i").test(path);
}
function main() {
  const reportPath = process.env.ATDD_VIOLATIONS_REPORT;
  if (!reportPath) { process.stderr.write("convex-detector: ATDD_VIOLATIONS_REPORT not set\n"); process.exit(2); }
  const roots = parseJsonEnv("ATDD_SCAN_ROOTS", []);
  const excludes = [...DEFAULT_EXCLUDES, ...parseJsonEnv("ATDD_SCAN_EXCLUDES", [])];

  const presentation = [];
  const smokeSpecs = [];
  for (const root of roots) {
    for (const file of walkAll(root, excludes)) {
      const b = basename(file);
      if (b.toLowerCase().includes("smoke") && SMOKE_SPEC_RE.test(b)) { smokeSpecs.push(file); continue; }
      if (extname(file) === ".tsx" && !SMOKE_SPEC_RE.test(b) && file.split(sep).includes("presentation")) {
        presentation.push(file);
      }
    }
  }
  const violations = [];
  for (const comp of presentation) {
    const wagon = wagonOf(comp);
    const covered = smokeSpecs.some((s) => hasToken(s, wagon));
    if (!covered) {
      violations.push({
        rule_id: RULE_ID, file: comp, line: 1, col: 1,
        evidence: "presentation component has no sibling *smoke*.spec.ts covering wagon '" + (wagon || "?") + "'",
        source_line: basename(comp),
      });
    }
  }
  writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
  process.stderr.write("convex-detector: " + violations.length + " smoke-presentation-coverage violation(s)\n");
  process.exit(0);
}
main();
