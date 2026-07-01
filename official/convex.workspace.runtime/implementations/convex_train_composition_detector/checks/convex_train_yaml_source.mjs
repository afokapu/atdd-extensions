#!/usr/bin/env node
// Detector: coder.convex.train-yaml-source-of-truth  (disposition: strict)
//
// The train definition, not the Station Master, owns the wagon order. This flags a
// Station Master module (basename app.* / station-master.* / station_master.*) that
// wires TWO OR MORE wagon surfaces inline (>=2 `@<wagon>/wagon` imports and/or direct
// wagon-run calls) WITHOUT delegating to a declarative train: no `TrainRunner`, no
// journey-id (train id) map. The sanctioned shape is action -> train id -> TrainRunner.
//
// CONTRACT (convex.workspace.runtime v1.1): reads ATDD_SCAN_ROOTS / ATDD_SCAN_EXCLUDES,
// writes RAW {rule_id,file,line,col,evidence,source_line} to ATDD_VIOLATIONS_REPORT,
// exits 0 regardless of violation count. Zero dependencies, no AST.
import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, sep, basename } from "node:path";

const RULE_ID = "coder.convex.train-yaml-source-of-truth";
const DEFAULT_EXCLUDES = ["_generated", "node_modules", "dist", "build", ".next"];
const TS_EXT = new Set([".ts", ".tsx", ".js", ".mjs"]);
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;
const STATION_MASTER_RE = /^(?:app|station[_-]?master)\.[cm]?[jt]sx?$/i;

// Signals the Station Master delegates to a declarative train definition.
const DELEGATES_RE = /\bTrainRunner\b|\bJOURNEY_MAP\b|\bjourney_?[Mm]ap\b|\btrain_?[Ii]d\b|\bloadTrain\b|\b_trains\//;
// Inline wagon wiring signals (each occurrence = one wagon touched inline).
const WAGON_IMPORT_RE = /@[\w-]+\/wagon(?:\/|['"])/g;
const WAGON_CALL_RE = /\b(?:run_train|runTrain|runWagon)\s*\(/g;

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
  if (st.isFile()) { if (TS_EXT.has(extname(root)) && !TEST_RE.test(root)) yield root; return; }
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    if (isExcluded(full, excludes)) continue;
    let cst;
    try { cst = statSync(full); } catch { continue; }
    if (cst.isDirectory()) yield* walk(full, excludes);
    else if (TS_EXT.has(extname(full)) && !TEST_RE.test(full)) yield full;
  }
}
const countMatches = (text, re) => { re.lastIndex = 0; let n = 0; while (re.exec(text) !== null) n++; return n; };

function main() {
  const reportPath = process.env.ATDD_VIOLATIONS_REPORT;
  if (!reportPath) { process.stderr.write("convex-detector: ATDD_VIOLATIONS_REPORT not set\n"); process.exit(2); }
  const roots = parseJsonEnv("ATDD_SCAN_ROOTS", []);
  const excludes = [...DEFAULT_EXCLUDES, ...parseJsonEnv("ATDD_SCAN_EXCLUDES", [])];

  const violations = [];
  for (const root of roots) {
    for (const file of walk(root, excludes)) {
      if (!STATION_MASTER_RE.test(basename(file))) continue;
      let text;
      try { text = readFileSync(file, "utf8"); } catch { continue; }
      if (DELEGATES_RE.test(text)) continue; // delegates to a train definition — compliant
      const inlineWagons = countMatches(text, WAGON_IMPORT_RE) + countMatches(text, WAGON_CALL_RE);
      if (inlineWagons < 2) continue; // not orchestrating multiple wagons inline
      // report at the first inline-wagon signal line
      const lines = text.split(/\r?\n/);
      let ln = 1, srcLine = lines[0] || "";
      for (let i = 0; i < lines.length; i++) {
        WAGON_IMPORT_RE.lastIndex = 0; WAGON_CALL_RE.lastIndex = 0;
        if (WAGON_IMPORT_RE.test(lines[i]) || WAGON_CALL_RE.test(lines[i])) { ln = i + 1; srcLine = lines[i]; break; }
      }
      violations.push({
        rule_id: RULE_ID,
        file,
        line: ln,
        col: 1,
        evidence: `Station Master hardcodes ${inlineWagons} wagons inline with no TrainRunner/train-id delegation — the train definition must own the wagon order`,
        source_line: srcLine.trim(),
      });
    }
  }
  writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
  process.stderr.write(`convex-detector: scanned ${roots.length} root(s), ${violations.length} violation(s)\n`);
  process.exit(0);
}
main();
