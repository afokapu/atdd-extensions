#!/usr/bin/env node
// Detector: Train <-> E2E coverage  (family member emitting 2 rule_ids)
//
//   tester.vite.train-e2e-coverage     (sev 2)  a registered train with no covering E2E spec
//   tester.vite.e2e-names-valid-train  (sev 2)  an e2e spec that names no registered train
//
// Vite/Playwright realization of the CORE frontend coverage validators
// test_train_e2e_existence.py (every train >=1 E2E) and test_train_frontend_e2e.py
// VAL-0026 (every frontend spec's train is registered). Sibling of tester.convex.train-coverage.
//
// Train registry = train_ids in plan/_trains.yaml + plan/_trains/*.yaml.
// A spec BINDS a train by any of: `// Train: train:{id}` header, `{train_id}.` filename
// prefix, or a `e2e/{train_id}/` parent directory (superset of the CORE dir-only convention,
// so frg-app's flat apps/game/tests/e2e/{train_id}.smoke.spec.ts actually binds).
//
// CONTRACT (frontend.workspace.runtime v1.1): env ATDD_SCAN_ROOTS / ATDD_SCAN_EXCLUDES /
// ATDD_VIOLATIONS_REPORT in; RAW {rule_id,file,line,col,evidence,source_line} out. Exits 0.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, sep, basename, dirname } from "node:path";

const RULE_TRAIN_COVERAGE = "tester.vite.train-e2e-coverage";
const RULE_NAMES_VALID = "tester.vite.e2e-names-valid-train";

const DEFAULT_EXCLUDES = ["node_modules", "dist", "build", ".next", "_generated"];
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;
const TRAIN_ID_RE = /^\d{4}-[a-z0-9-]+$/;
const FILENAME_PREFIX_RE = /^(\d{4}-[a-z0-9-]+?)\./;
const TRAIN_HDR_RE = /^\s*\/\/\s*Train:\s*train:(\d{4}-[a-z0-9-]+)\s*$/m;

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
function lineOfIndex(text, idx) {
  let n = 1;
  for (let i = 0; i < idx && i < text.length; i++) if (text[i] === "\n") n++;
  return n;
}

// A plan train-registry file: plan/_trains.yaml, or a *.yaml directly under a `_trains/` dir.
function isTrainRegistryFile(path) {
  const segs = path.split(sep);
  const b = basename(path);
  if (b === "_trains.yaml") return true;
  if (b.endsWith(".yaml") && segs.includes("_trains")) return true;
  return false;
}
// Collect train_ids (with a representative declaration site) from a registry file.
function collectTrains(file, registry) {
  let text;
  try { text = readFileSync(file, "utf8"); } catch { return; }
  const re = /train_id:\s*["']?(\d{4}-[a-z0-9-]+)["']?/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const tid = m[1];
    if (!registry.has(tid)) registry.set(tid, { file, line: lineOfIndex(text, m.index) });
  }
}

function isTestSpec(path) { return TEST_RE.test(path); }
function hasE2ESegment(path) { return path.split(sep).includes("e2e"); }

// Resolve the train_id a spec binds to (or null if none).
function boundTrainId(file, text) {
  const hdr = text.match(TRAIN_HDR_RE);
  if (hdr) return hdr[1];
  const pref = basename(file).match(FILENAME_PREFIX_RE);
  if (pref) return pref[1];
  const parent = basename(dirname(file));
  if (TRAIN_ID_RE.test(parent)) return parent;
  return null;
}

function main() {
  const reportPath = process.env.ATDD_VIOLATIONS_REPORT;
  if (!reportPath) { process.stderr.write("train-e2e-detector: ATDD_VIOLATIONS_REPORT not set\n"); process.exit(2); }
  const roots = parseJsonEnv("ATDD_SCAN_ROOTS", []);
  const excludes = [...DEFAULT_EXCLUDES, ...parseJsonEnv("ATDD_SCAN_EXCLUDES", [])];

  const registry = new Map();        // train_id -> {file, line}
  const specs = [];                  // {file, text, bound, isE2E}
  let registryFileSeen = false;

  for (const root of roots) {
    for (const file of walk(root, excludes)) {
      if (isTrainRegistryFile(file)) { registryFileSeen = true; collectTrains(file, registry); continue; }
      if (isTestSpec(file)) {
        let text = "";
        try { text = readFileSync(file, "utf8"); } catch { text = ""; }
        const bound = boundTrainId(file, text);
        const isE2E = hasE2ESegment(file) || bound !== null || text.includes("test:train:");
        specs.push({ file, text, bound, isE2E });
      }
    }
  }

  const violations = [];
  // Out of scope entirely if there is no train registry at all.
  if (!registryFileSeen && registry.size === 0) {
    writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
    process.stderr.write("train-e2e-detector: no train registry — out of scope\n");
    process.exit(0);
  }

  const covered = new Set(specs.map((s) => s.bound).filter((b) => b !== null));

  // --- train-e2e-coverage: every registered train has a covering spec ---
  for (const [tid, decl] of [...registry.entries()].sort()) {
    if (!covered.has(tid)) {
      let src = "";
      try { src = (readFileSync(decl.file, "utf8").split(/\r?\n/)[decl.line - 1] || "").trim(); } catch {}
      violations.push({ rule_id: RULE_TRAIN_COVERAGE, file: decl.file, line: decl.line, col: 1,
        evidence: `train "${tid}" has no covering E2E/journey spec (no // Train: header, {train_id}. filename, or e2e/${tid}/ dir)`,
        source_line: src });
    }
  }

  // --- e2e-names-valid-train: every e2e spec names a registered train ---
  for (const s of specs) {
    if (!s.isE2E) continue;
    if (s.bound === null) {
      violations.push({ rule_id: RULE_NAMES_VALID, file: s.file, line: 1, col: 1,
        evidence: "e2e spec names no train (no // Train: header and no {train_id}. filename prefix) — orphaned from the train plan",
        source_line: (s.text.split(/\r?\n/)[0] || "").trim() });
    } else if (!registry.has(s.bound)) {
      violations.push({ rule_id: RULE_NAMES_VALID, file: s.file, line: 1, col: 1,
        evidence: `e2e spec binds train "${s.bound}" which is not registered in plan/_trains*`,
        source_line: (s.text.split(/\r?\n/)[0] || "").trim() });
    }
  }

  writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
  process.stderr.write(`train-e2e-detector: ${registry.size} train(s), ${specs.length} spec(s), ${violations.length} violation(s)\n`);
  process.exit(0);
}

main();
