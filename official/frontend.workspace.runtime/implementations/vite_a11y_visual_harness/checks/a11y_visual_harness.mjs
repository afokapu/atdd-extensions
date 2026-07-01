#!/usr/bin/env node
// Detector: a11y + visual harness discipline  (family member emitting 2 rule_ids)
//
//   tester.vite.a11y-harness    (sev 3)  an a11y spec that never runs axe .analyze() + asserts
//   tester.vite.visual-harness  (sev 3)  a visual spec that never asserts a screenshot
//
// Vite/Playwright realization of the CORE a11y.tmpl.json / visual.tmpl.json harness
// templates (AxeBuilder(...).analyze() + expect; expect(page).toHaveScreenshot(...)).
//
// A11Y spec  = `*.spec.ts`/`*.test.ts` whose basename contains `a11y`, or that carries an
//              `A11Y` journey-URN harness code (`test:train:...:A11Y-NNN-...`).
// VISUAL spec = basename contains `visual` or `.vis.`, or a `VIS` journey-URN harness code.
//
// CONTRACT (frontend.workspace.runtime v1.1): env ATDD_SCAN_ROOTS / ATDD_SCAN_EXCLUDES /
// ATDD_VIOLATIONS_REPORT in; RAW {rule_id,file,line,col,evidence,source_line} out. Exits 0.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, sep, basename } from "node:path";

const RULE_A11Y = "tester.vite.a11y-harness";
const RULE_VISUAL = "tester.vite.visual-harness";

const DEFAULT_EXCLUDES = ["node_modules", "dist", "build", ".next", "_generated"];
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

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
  if (st.isFile()) { if (TEST_RE.test(root)) yield root; return; }
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    if (isExcluded(full, excludes)) continue;
    let cst;
    try { cst = statSync(full); } catch { continue; }
    if (cst.isDirectory()) yield* walk(full, excludes);
    else if (TEST_RE.test(full)) yield full;
  }
}

function isA11ySpec(file, text) {
  return basename(file).toLowerCase().includes("a11y") || /test:train:[^\s"'`)]*:A11Y-\d{3}-/.test(text);
}
function isVisualSpec(file, text) {
  const b = basename(file).toLowerCase();
  return b.includes("visual") || b.includes(".vis.") || /test:train:[^\s"'`)]*:VIS-\d{3}-/.test(text);
}

function scanFile(file, violations) {
  let text;
  try { text = readFileSync(file, "utf8"); } catch { return; }

  if (isA11ySpec(file, text)) {
    const hasAxe = /AxeBuilder/.test(text) || /@axe-core\/playwright/.test(text);
    const hasAnalyze = /\.analyze\s*\(/.test(text);
    const hasExpect = /\bexpect\s*\(/.test(text);
    if (!(hasAxe && hasAnalyze && hasExpect)) {
      const missing = [];
      if (!hasAxe) missing.push("an axe builder (@axe-core/playwright)");
      if (!hasAnalyze) missing.push(".analyze()");
      if (!hasExpect) missing.push("an expect(...) assertion");
      violations.push({ rule_id: RULE_A11Y, file, line: 1, col: 1,
        evidence: `a11y spec is missing ${missing.join(" + ")} — it never measures/asserts accessibility`,
        source_line: basename(file) });
    }
  }

  if (isVisualSpec(file, text)) {
    const hasShot = /toHaveScreenshot\s*\(/.test(text) || /toMatchSnapshot\s*\(/.test(text);
    if (!hasShot) {
      violations.push({ rule_id: RULE_VISUAL, file, line: 1, col: 1,
        evidence: "visual spec has no toHaveScreenshot(/toMatchSnapshot( assertion — no visual regression is performed",
        source_line: basename(file) });
    }
  }
}

function main() {
  const reportPath = process.env.ATDD_VIOLATIONS_REPORT;
  if (!reportPath) { process.stderr.write("a11y-visual-detector: ATDD_VIOLATIONS_REPORT not set\n"); process.exit(2); }
  const roots = parseJsonEnv("ATDD_SCAN_ROOTS", []);
  const excludes = [...DEFAULT_EXCLUDES, ...parseJsonEnv("ATDD_SCAN_EXCLUDES", [])];

  const violations = [];
  for (const root of roots) for (const file of walk(root, excludes)) scanFile(file, violations);

  writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
  process.stderr.write(`a11y-visual-detector: ${violations.length} violation(s)\n`);
  process.exit(0);
}

main();
