#!/usr/bin/env node
// Detector: tester.vite.presentation-smoke-coverage  (SINGLETON, disposition: documentation-only)
//
// Vite/Playwright realization of CORE tester.smoke.pres (TESTER-SMOKE-PRES-001,
// test_presentation_smoke_coverage.py): every presentation component (a `.tsx` under a
// `presentation/` path segment) must be covered by at least one smoke spec — a file whose
// basename contains `smoke` ending `.spec.ts`/`.test.ts`(x) — whose PATH references the
// component's wagon (the segment immediately before `presentation`) at a word boundary.
// Sibling of tester.convex.smoke-presentation-coverage.
//
// CONTRACT (frontend.workspace.runtime v1.1): env ATDD_SCAN_ROOTS / ATDD_SCAN_EXCLUDES /
// ATDD_VIOLATIONS_REPORT in; RAW {rule_id,file,line,col,evidence,source_line} out. Exits 0.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, sep, basename } from "node:path";

const RULE_ID = "tester.vite.presentation-smoke-coverage";

const DEFAULT_EXCLUDES = ["node_modules", "dist", "build", ".next", "_generated"];
const SMOKE_SPEC_RE = /\.(spec|test)\.[cm]?[jt]sx?$/;

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
  if (st.isFile()) { yield root; return; }
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    if (isExcluded(full, excludes)) continue;
    let cst;
    try { cst = statSync(full); } catch { continue; }
    if (cst.isDirectory()) yield* walk(full, excludes);
    else yield full;
  }
}

// A presentation component: a `.tsx` with a `presentation` path segment; its wagon is the
// segment immediately before `presentation`.
function presentationInfo(path) {
  if (!path.endsWith(".tsx")) return null;
  if (SMOKE_SPEC_RE.test(path)) return null;
  const segs = path.split(sep);
  const pi = segs.indexOf("presentation");
  if (pi <= 0) return null;
  return { wagon: segs[pi - 1] };
}
// A smoke spec: basename contains `smoke`, ends `.spec.ts`/`.test.ts`(x).
function isSmokeSpec(path) {
  return SMOKE_SPEC_RE.test(path) && basename(path).toLowerCase().includes("smoke");
}
// Word/kebab/snake boundary token match (same as CORE _token_present).
function tokenPresent(needle, haystack) {
  const n = needle.toLowerCase().replace(/[^a-z0-9]/g, "-");
  const h = haystack.toLowerCase();
  const re = new RegExp(`(?:^|[^a-z0-9])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[^a-z0-9]|$)`);
  return re.test(h);
}
function smokeCovers(specPath, wagon) {
  const normalized = specPath.toLowerCase().replace(/[/_\\]/g, "-");
  return tokenPresent(wagon, normalized);
}

function main() {
  const reportPath = process.env.ATDD_VIOLATIONS_REPORT;
  if (!reportPath) { process.stderr.write("pres-smoke-detector: ATDD_VIOLATIONS_REPORT not set\n"); process.exit(2); }
  const roots = parseJsonEnv("ATDD_SCAN_ROOTS", []);
  const excludes = [...DEFAULT_EXCLUDES, ...parseJsonEnv("ATDD_SCAN_EXCLUDES", [])];

  const components = [];  // {file, wagon}
  const smokeSpecs = [];  // paths
  for (const root of roots) {
    for (const file of walk(root, excludes)) {
      if (isSmokeSpec(file)) { smokeSpecs.push(file); continue; }
      const info = presentationInfo(file);
      if (info) components.push({ file, wagon: info.wagon });
    }
  }

  const violations = [];
  for (const c of components) {
    const covered = smokeSpecs.some((s) => smokeCovers(s, c.wagon));
    if (!covered) {
      violations.push({ rule_id: RULE_ID, file: c.file, line: 1, col: 1,
        evidence: `presentation component has no matching *smoke*.spec.ts (wagon=${JSON.stringify(c.wagon)}); add a Playwright smoke spec whose path carries the wagon token`,
        source_line: basename(c.file) });
    }
  }

  writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
  process.stderr.write(`pres-smoke-detector: ${components.length} component(s), ${smokeSpecs.length} smoke spec(s), ${violations.length} violation(s)\n`);
  process.exit(0);
}

main();
