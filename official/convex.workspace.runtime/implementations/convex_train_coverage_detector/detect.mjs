#!/usr/bin/env node
// Detector: tester.convex.train-coverage  (disposition: documentation-only)
//
// Every wagon declared in a train spec MUST have a smoke test exercising its
// composition root. This reads each train spec (a `*.train.ts`/`*.train.json` module,
// or a module under a `trains/` directory, declaring `wagons: [...]` / `wagons = [...]`)
// and flags any declared wagon with no smoke test — a `*.test.ts` whose basename or body
// contains `smoke` and references the wagon token — in the scanned roots.
//
// CONTRACT (convex.workspace.runtime v1.1): reads ATDD_SCAN_ROOTS / ATDD_SCAN_EXCLUDES,
// writes RAW {rule_id,file,line,col,evidence,source_line} to ATDD_VIOLATIONS_REPORT,
// exits 0 regardless of violation count. Zero dependencies, no AST.
import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, sep, basename } from "node:path";

const RULE_ID = "tester.convex.train-coverage";
const DEFAULT_EXCLUDES = ["_generated", "node_modules", "dist", "build", ".next"];
const TS_EXT = new Set([".ts", ".tsx", ".js", ".mjs", ".json"]);
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;
const TRAIN_SPEC_BASENAME_RE = /\.train\.(?:[cm]?[jt]sx?|json)$/i;

function parseJsonEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : fallback; } catch { return fallback; }
}
function isExcluded(path, excludes) {
  const segs = path.split(sep);
  return excludes.some((ex) => segs.includes(ex) || path.includes(ex));
}
// Walk INCLUDING test files — the coverage check needs both specs and tests.
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
const isTrainSpec = (file) =>
  TRAIN_SPEC_BASENAME_RE.test(basename(file)) || file.split(sep).slice(0, -1).includes("trains");
const kebab = (s) => s.replace(/_/g, "-").toLowerCase();

// Extract wagon-id string literals from a `wagons` array declaration.
function extractWagons(text) {
  const out = [];
  const m = /\bwagons\s*[:=]\s*\[([\s\S]*?)\]/.exec(text);
  if (!m) return out;
  const body = m[1];
  const startLine = text.slice(0, m.index).split(/\r?\n/).length;
  const litRe = /['"]([^'"]+)['"]/g;
  let lm;
  while ((lm = litRe.exec(body)) !== null) {
    const before = body.slice(0, lm.index).split(/\r?\n/).length - 1;
    out.push({ id: lm[1], line: startLine + before });
  }
  return out;
}

function main() {
  const reportPath = process.env.ATDD_VIOLATIONS_REPORT;
  if (!reportPath) { process.stderr.write("convex-detector: ATDD_VIOLATIONS_REPORT not set\n"); process.exit(2); }
  const roots = parseJsonEnv("ATDD_SCAN_ROOTS", []);
  const excludes = [...DEFAULT_EXCLUDES, ...parseJsonEnv("ATDD_SCAN_EXCLUDES", [])];

  const files = [];
  for (const root of roots) for (const f of walk(root, excludes)) files.push(f);

  // Index smoke tests: a *.test.ts whose basename OR body marks it a smoke test.
  const smokeTests = [];
  for (const f of files) {
    if (!TEST_RE.test(basename(f))) continue;
    const base = basename(f).toLowerCase();
    let text = "";
    try { text = readFileSync(f, "utf8"); } catch {}
    const isSmoke = base.includes("smoke") || /\bsmoke\b/i.test(text);
    if (isSmoke) smokeTests.push({ base, text: text.toLowerCase() });
  }
  const covers = (wagon) => {
    const w = kebab(wagon);
    return smokeTests.some((t) => t.base.includes(w) || t.text.includes(w));
  };

  const violations = [];
  for (const f of files) {
    if (TEST_RE.test(basename(f)) || !isTrainSpec(f)) continue;
    let text = "";
    try { text = readFileSync(f, "utf8"); } catch { continue; }
    const lines = text.split(/\r?\n/);
    for (const w of extractWagons(text)) {
      if (covers(w.id)) continue;
      violations.push({
        rule_id: RULE_ID,
        file: f,
        line: w.line,
        col: 1,
        evidence: `train wagon "${w.id}" has no smoke test exercising its composition root`,
        source_line: (lines[w.line - 1] || "").trim(),
      });
    }
  }

  writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
  process.stderr.write(`convex-detector: scanned ${roots.length} root(s), ${violations.length} violation(s)\n`);
  process.exit(0);
}
main();
