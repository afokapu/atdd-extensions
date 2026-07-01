#!/usr/bin/env node
// Detector: Vite journey/E2E header conventions  (family member emitting 4 rule_ids)
//
//   tester.vite.journey-train-header          (sev 2)  missing/invalid `// Train:` header
//   tester.vite.journey-urn-format            (sev 2)  missing/malformed `test:train:` journey URN
//   tester.vite.journey-layer-assembly        (sev 2)  missing/non-assembly `// Layer:`
//   tester.vite.journey-no-acceptance-marker  (sev 2)  forbidden `// Acceptance:`/`// WMBT:` marker
//
// Vite/Playwright realization of the agnostic journey-test header contract in
// tester/conventions/train.convention.yaml (and the identical `header_template.journey`
// of e2e/a11y/visual.tmpl.json). Sibling of convex_journey_test_detector.
//
// A file is a JOURNEY spec (in scope) iff it is a `*.spec.ts`/`*.test.ts` AND any of:
//   - a `{train_id}.` filename prefix  (train:\d{4}-[a-z0-9-]+),
//   - a `test:train:` URN anywhere in the file,
//   - a `// Train:` marker in its header.
// (frg-app ground truth: apps/game/tests/e2e/{train_id}.smoke.spec.ts + `// Train:` header.)
//
// CONTRACT (frontend.workspace.runtime v1.1): env ATDD_SCAN_ROOTS / ATDD_SCAN_EXCLUDES /
// ATDD_VIOLATIONS_REPORT in; {"violations":[{rule_id,file,line,col,evidence,source_line}]} out.
// RAW factual channel only — exits 0 regardless of count.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, sep, basename } from "node:path";

const RULE_TRAIN_HEADER = "tester.vite.journey-train-header";
const RULE_URN_FORMAT = "tester.vite.journey-urn-format";
const RULE_LAYER_ASSEMBLY = "tester.vite.journey-layer-assembly";
const RULE_NO_ACCEPTANCE = "tester.vite.journey-no-acceptance-marker";

const DEFAULT_EXCLUDES = ["node_modules", "dist", "build", ".next", "_generated"];
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;
const FILENAME_PREFIX_RE = /^\d{4}-[a-z0-9-]+\./;
const TRAIN_URN_RE = /^train:\d{4}-[a-z0-9][a-z0-9-]*$/;
const JOURNEY_URN_STRICT_RE = /^test:train:\d{4}-[a-z0-9-]+:(E2E|A11Y|VIS|SMOKE)-\d{3}-[a-z0-9][a-z0-9-]*$/;
const JOURNEY_URN_CANDIDATE_RE = /test:train:[A-Za-z0-9:_-]+/g;

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
function lineOfIndex(text, idx) {
  let n = 1;
  for (let i = 0; i < idx && i < text.length; i++) if (text[i] === "\n") n++;
  return n;
}
function firstMatchLine(text, re) {
  const m = text.match(re);
  if (!m) return { line: 0, value: null, src: null };
  const idx = m.index;
  return { line: lineOfIndex(text, idx), value: m[1] !== undefined ? m[1] : m[0], src: (text.slice(idx).split(/\r?\n/)[0] || "").trim() };
}

function isJourneySpec(file, text) {
  if (FILENAME_PREFIX_RE.test(basename(file))) return true;
  if (text.includes("test:train:")) return true;
  if (/^\s*\/\/\s*Train:/m.test(text)) return true;
  return false;
}

function scanFile(file, violations) {
  let text;
  try { text = readFileSync(file, "utf8"); } catch { return; }
  if (!isJourneySpec(file, text)) return;

  // --- journey-train-header ---
  const trainHdr = firstMatchLine(text, /^\s*\/\/\s*Train:\s*(\S+)\s*$/m);
  if (trainHdr.value === null) {
    violations.push({ rule_id: RULE_TRAIN_HEADER, file, line: 1, col: 1,
      evidence: "journey spec has no `// Train:` header (MUST reference a valid train URN train:NNNN-slug)",
      source_line: (text.split(/\r?\n/)[0] || "").trim() });
  } else if (!TRAIN_URN_RE.test(trainHdr.value)) {
    violations.push({ rule_id: RULE_TRAIN_HEADER, file, line: trainHdr.line, col: 1,
      evidence: `\`// Train: ${trainHdr.value}\` is not a valid train URN (must match train:\\d{4}-[a-z0-9][a-z0-9-]*)`,
      source_line: trainHdr.src });
  }

  // --- journey-urn-format ---
  const candidates = text.match(JOURNEY_URN_CANDIDATE_RE) || [];
  if (candidates.length === 0) {
    violations.push({ rule_id: RULE_URN_FORMAT, file, line: 1, col: 1,
      evidence: "journey spec carries no `test:train:{train_id}:{HARNESS}-{NNN}-{slug}` URN",
      source_line: (text.split(/\r?\n/)[0] || "").trim() });
  } else if (!candidates.some((c) => JOURNEY_URN_STRICT_RE.test(c))) {
    const bad = candidates[0];
    const idx = text.indexOf(bad);
    violations.push({ rule_id: RULE_URN_FORMAT, file, line: lineOfIndex(text, idx), col: 1,
      evidence: `journey URN \`${bad}\` is malformed (want test:train:NNNN-slug:{E2E|A11Y|VIS|SMOKE}-NNN-slug)`,
      source_line: (text.slice(idx).split(/\r?\n/)[0] || "").trim() });
  }

  // --- journey-layer-assembly ---
  const layerHdr = firstMatchLine(text, /^\s*\/\/\s*Layer:\s*(\S+)\s*$/m);
  if (layerHdr.value === null) {
    violations.push({ rule_id: RULE_LAYER_ASSEMBLY, file, line: 1, col: 1,
      evidence: "journey spec has no `// Layer:` header (MUST be `Layer: assembly`)",
      source_line: (text.split(/\r?\n/)[0] || "").trim() });
  } else if (layerHdr.value !== "assembly") {
    violations.push({ rule_id: RULE_LAYER_ASSEMBLY, file, line: layerHdr.line, col: 1,
      evidence: `\`// Layer: ${layerHdr.value}\` — journey specs MUST declare Layer: assembly`,
      source_line: layerHdr.src });
  }

  // --- journey-no-acceptance-marker ---
  const acc = firstMatchLine(text, /^\s*\/\/\s*(Acceptance|WMBT):\s*\S/m);
  if (acc.value !== null) {
    violations.push({ rule_id: RULE_NO_ACCEPTANCE, file, line: acc.line, col: 1,
      evidence: `journey spec carries a forbidden \`// ${acc.value}:\` marker (Acceptance:/WMBT: are mutually exclusive with Train:)`,
      source_line: acc.src });
  }
}

function main() {
  const reportPath = process.env.ATDD_VIOLATIONS_REPORT;
  if (!reportPath) { process.stderr.write("journey-detector: ATDD_VIOLATIONS_REPORT not set\n"); process.exit(2); }
  const roots = parseJsonEnv("ATDD_SCAN_ROOTS", []);
  const excludes = [...DEFAULT_EXCLUDES, ...parseJsonEnv("ATDD_SCAN_EXCLUDES", [])];

  const violations = [];
  for (const root of roots) for (const file of walk(root, excludes)) scanFile(file, violations);

  writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
  process.stderr.write(`journey-detector: ${violations.length} violation(s)\n`);
  process.exit(0);
}

main();
