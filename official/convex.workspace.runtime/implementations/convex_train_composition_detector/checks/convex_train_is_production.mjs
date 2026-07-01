#!/usr/bin/env node
// Detector: coder.convex.train-is-a-production  (disposition: strict)
//
// A train composition root is PRODUCTION code. This flags a file that DEFINES a
// train runner (class TrainRunner / export function runTrain / const ...TrainRunner=)
// yet lives in test infrastructure: a *.test.ts/*.spec.ts file, or a module under an
// e2e/ , tests/ , or __tests__/ directory. A test that merely IMPORTS a production
// runner carries no definition and is never flagged.
//
// CONTRACT (convex.workspace.runtime v1.1): reads ATDD_SCAN_ROOTS / ATDD_SCAN_EXCLUDES,
// writes RAW {rule_id,file,line,col,evidence,source_line} to ATDD_VIOLATIONS_REPORT,
// exits 0 regardless of violation count. Zero dependencies, no AST.
import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, sep } from "node:path";

const RULE_ID = "coder.convex.train-is-a-production";
const DEFAULT_EXCLUDES = ["_generated", "node_modules", "dist", "build", ".next"];
const TS_EXT = new Set([".ts", ".tsx", ".js", ".mjs"]);
const TEST_FILE_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;
const TEST_DIR_SEGS = new Set(["e2e", "tests", "test", "__tests__"]);

// A module that DEFINES (not merely imports) a train runner / journey entrypoint.
const RUNNER_DEF_RE =
  /\b(?:class\s+TrainRunner\b|(?:export\s+)?(?:async\s+)?function\s+runTrain\b|(?:export\s+)?(?:async\s+)?function\s+run_train\b|(?:export\s+)?const\s+[A-Za-z_$][\w$]*[Tt]rainRunner\s*=)/;

function parseJsonEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : fallback; } catch { return fallback; }
}
function isExcluded(path, excludes) {
  const segs = path.split(sep);
  return excludes.some((ex) => segs.includes(ex) || path.includes(ex));
}
// Walk INCLUDING test files — we specifically need to catch runner defs placed in them.
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
function inTestInfra(file) {
  const base = file.split(sep).pop() || "";
  if (TEST_FILE_RE.test(base)) return "test file";
  const segs = file.split(sep);
  for (const s of segs.slice(0, -1)) if (TEST_DIR_SEGS.has(s)) return `${s}/ test dir`;
  return null;
}

function main() {
  const reportPath = process.env.ATDD_VIOLATIONS_REPORT;
  if (!reportPath) { process.stderr.write("convex-detector: ATDD_VIOLATIONS_REPORT not set\n"); process.exit(2); }
  const roots = parseJsonEnv("ATDD_SCAN_ROOTS", []);
  const excludes = [...DEFAULT_EXCLUDES, ...parseJsonEnv("ATDD_SCAN_EXCLUDES", [])];

  const violations = [];
  for (const root of roots) {
    for (const file of walk(root, excludes)) {
      const where = inTestInfra(file);
      if (!where) continue;
      let text;
      try { text = readFileSync(file, "utf8"); } catch { continue; }
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (RUNNER_DEF_RE.test(lines[i])) {
          violations.push({
            rule_id: RULE_ID,
            file,
            line: i + 1,
            col: 1,
            evidence: `train-runner definition in ${where} — composition roots must be production code`,
            source_line: lines[i].trim(),
          });
          break; // one violation per file: the first definition line
        }
      }
    }
  }
  writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
  process.stderr.write(`convex-detector: scanned ${roots.length} root(s), ${violations.length} violation(s)\n`);
  process.exit(0);
}
main();
