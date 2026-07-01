#!/usr/bin/env node
// Detector: tester.convex.security-input  (disposition: documentation-only)
//
// Convex/Vitest realization of the agnostic tester rule `tester.security.input`
// ("Input-validation tests assert rejection of malformed and adversarial
// payloads"). A Vitest test file that IS an input-validation test — its
// `// URN: test:…-INPUT|VALIDATION|VALIDATE-NNN` header, or a URN-derived basename
// `…-input|validation|validate-NNN[-slug].test.ts` — MUST contain at least one
// REJECTION assertion (`.rejects`, `.toThrow`, `ConvexError`, `ArgumentValidationError`,
// `.throws`). An input test that only exercises the happy path proves nothing about
// how the endpoint handles bad input: it is a silent green gap.
//
// The IDENTITY-of-a-test-comes-from-its-URN-header invariant stays in CORE; only the
// per-stack rendering lives here. This detector flags each input-validation test
// file that makes no rejection assertion.
//
// CONTRACT (convex.workspace.runtime v1.1): reads ATDD_SCAN_ROOTS / ATDD_SCAN_EXCLUDES,
// writes RAW {rule_id,file,line,col,evidence,source_line} to ATDD_VIOLATIONS_REPORT,
// exits 0 regardless of violation count. Zero deps, no AST.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, basename, sep } from "node:path";

const RULE_ID = "tester.convex.security-input";
const DEFAULT_EXCLUDES = ["_generated", "node_modules", "dist", "build", ".next"];
const TEST_FILE_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

// A test file is an INPUT-VALIDATION test if its URN header carries an
// INPUT/VALIDATION/VALIDATE harness, or its basename renders one.
const URN_INPUT_RE = /\/\/\s*URN:\s*test:[^\n]*-(INPUT|VALIDATION|VALIDATE)-\d/i;
const NAME_INPUT_RE = /-(input|validation|validate)-\d/i;

// A rejection assertion — the proof that the test asserts bad input is refused.
const REJECT_RE = /\.rejects\b|toThrow(?:Error)?\b|ConvexError|ArgumentValidationError|\.throws\b/;

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
  if (st.isFile()) { if (TEST_FILE_RE.test(root)) yield root; return; }
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    if (isExcluded(full, excludes)) continue;
    let cst;
    try { cst = statSync(full); } catch { continue; }
    if (cst.isDirectory()) yield* walk(full, excludes);
    else if (TEST_FILE_RE.test(full)) yield full;
  }
}

function isInputTest(base, text) {
  return NAME_INPUT_RE.test(base) || URN_INPUT_RE.test(text);
}
function urnLine(text) {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) if (/\/\/\s*URN:\s*test:/i.test(lines[i])) return i + 1;
  return 1;
}

function checkFile(file, violations) {
  let text;
  try { text = readFileSync(file, "utf8"); } catch { return; }
  const base = basename(file);
  if (!isInputTest(base, text)) return;
  if (REJECT_RE.test(text)) return; // asserts rejection of bad input
  const line = urnLine(text);
  const source = (text.split(/\r?\n/)[line - 1] || base).trim();
  violations.push({
    rule_id: RULE_ID,
    file,
    line,
    col: 1,
    evidence:
      `input-validation test "${base}" makes no rejection assertion ` +
      `(expected .rejects / toThrow / ConvexError / ArgumentValidationError)`,
    source_line: source,
  });
}

function main() {
  const reportPath = process.env.ATDD_VIOLATIONS_REPORT;
  if (!reportPath) { process.stderr.write("convex-detector: ATDD_VIOLATIONS_REPORT not set\n"); process.exit(2); }
  const roots = parseJsonEnv("ATDD_SCAN_ROOTS", []);
  const excludes = [...DEFAULT_EXCLUDES, ...parseJsonEnv("ATDD_SCAN_EXCLUDES", [])];
  const violations = [];
  for (const root of roots) for (const file of walk(root, excludes)) checkFile(file, violations);
  writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
  process.stderr.write(`convex-detector: scanned ${roots.length} root(s), ${violations.length} violation(s)\n`);
  process.exit(0);
}

main();
