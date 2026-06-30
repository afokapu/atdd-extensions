#!/usr/bin/env node
// Detector: coder.convex.quality-mi  (disposition: strict)
//
// Convex realization of Core's coder.refactor.quality-mi-typescript. Every Convex
// server module of non-trivial size (>= 10 lines) MUST have an approximate
// maintainability index (MI) at or above the SEI "maintainable" threshold of 20.
// There is no AST/radon/tree-sitter dependency (zero-dep, regex-over-source), so MI
// is APPROXIMATED with the SEI formula over a regex-estimated Halstead volume, then
// NORMALIZED to radon's 0-100 reporting scale (the scale Core's radon-backed Python MI
// reports on, where the "maintainable" rank-A threshold is 20):
//
//   MI_raw  = 171 - 5.2*ln(V) - 0.23*CC - 16.2*ln(LOC) + 50*sin(sqrt(2.4*CM))
//   MI      = clamp(MI_raw * 100 / 171, 0, 100)   // radon's normalized 0-100 scale
//
//   V   Halstead volume proxy = (N1+N2) * log2(n1+n2)
//         n1 = distinct operators, n2 = distinct operands,
//         N1 = total operators,    N2 = total operands  (regex token counts)
//   CC  cyclomatic proxy = (1 + decision-keyword count) / estimated-function-count
//   LOC lines of code = non-blank, comment-stripped line count
//   CM  comment ratio = comment lines / non-blank lines
//
// The result is directionally correct and comparable across files in one codebase —
// sufficient for the threshold check. A module of >= 10 lines whose normalized MI is
// below 20 is flagged with one RAW violation. (Mirrors Core's threshold + formula.)
//
// CONTRACT (convex.workspace.runtime v1.1). Env in / JSON report out, RAW channel,
// exit 0 even when violations are found.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, sep } from "node:path";

const RULE_ID = "coder.convex.quality-mi";

const DEFAULT_EXCLUDES = ["_generated", "node_modules", "dist", "build", ".next"];
const TS_EXT = new Set([".ts", ".tsx", ".js", ".mjs"]);
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

// --- thresholds (normative; mirrored in the convention YAML) ---------------
const MI_THRESHOLD = 20; // SEI "maintainable"
const MIN_LINES_FOR_MI = 10; // files smaller than this are not measured

// Multi-char operators first so they are matched whole.
const OPERATOR_RE =
  /(===|!==|>>>=|>>>|<<=|>>=|\*\*=|&&=|\|\|=|\?\?=|=>|\+\+|--|&&|\|\||\?\?|<=|>=|==|!=|\+=|-=|\*=|\/=|%=|&=|\|=|\^=|<<|>>|\.\.\.|[-+*/%=<>!&|^~?:.,;(){}\[\]])/g;
const OPERAND_RE = /[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|(["'`])(?:\\.|(?!\2).)*\2/g;
const DECISION_RE = /\b(if|for|while|case|catch)\b|&&|\|\||\?\?|\?(?!\.)/g;
const FUNC_RE = /\bfunction\b|=>|\b(query|mutation|action|httpAction|internalQuery|internalMutation|internalAction)\s*\(/g;

function parseJsonEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function isExcluded(path, excludes) {
  const segs = path.split(sep);
  return excludes.some((ex) => segs.includes(ex) || path.includes(ex));
}

function* walk(root, excludes) {
  let st;
  try {
    st = statSync(root);
  } catch {
    return;
  }
  if (st.isFile()) {
    if (TS_EXT.has(extname(root)) && !TEST_RE.test(root)) yield root;
    return;
  }
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    if (isExcluded(full, excludes)) continue;
    let cst;
    try {
      cst = statSync(full);
    } catch {
      continue;
    }
    if (cst.isDirectory()) {
      yield* walk(full, excludes);
    } else if (TS_EXT.has(extname(full)) && !TEST_RE.test(full)) {
      yield full;
    }
  }
}

function countMatches(re, text) {
  re.lastIndex = 0;
  let n = 0;
  while (re.exec(text) !== null) n++;
  return n;
}

// Distinct + total token counts for a regex token class.
function tokenStats(re, text) {
  re.lastIndex = 0;
  let total = 0;
  const distinct = new Set();
  let m;
  while ((m = re.exec(text)) !== null) {
    total++;
    distinct.add(m[0]);
  }
  return { total, distinct: distinct.size };
}

// Strip comments and classify each line so LOC and comment ratio are measurable.
function classify(text) {
  const lines = text.split(/\r?\n/);
  let inBlock = false;
  let codeLines = 0;
  let commentLines = 0;
  let nonBlank = 0;
  const codeOnly = [];
  for (let raw of lines) {
    const line = raw;
    const trimmed = line.trim();
    if (trimmed === "") continue;
    nonBlank++;
    if (inBlock) {
      commentLines++;
      if (trimmed.includes("*/")) inBlock = false;
      continue;
    }
    if (trimmed.startsWith("//")) {
      commentLines++;
      continue;
    }
    if (trimmed.startsWith("/*")) {
      commentLines++;
      if (!trimmed.includes("*/")) inBlock = true;
      continue;
    }
    // A code line; strip any trailing line comment for token counting.
    codeLines++;
    codeOnly.push(line.replace(/\/\/.*$/, ""));
  }
  return { codeLines, commentLines, nonBlank, codeText: codeOnly.join("\n") };
}

function computeMI(text) {
  const { codeLines, commentLines, nonBlank, codeText } = classify(text);
  const LOC = Math.max(codeLines, 1);
  const CM = nonBlank > 0 ? commentLines / nonBlank : 0;

  const ops = tokenStats(OPERATOR_RE, codeText);
  const opr = tokenStats(OPERAND_RE, codeText);
  const N = ops.total + opr.total;
  const n = ops.distinct + opr.distinct;
  const V = N > 0 && n > 0 ? N * Math.log2(n) : 1;

  const funcCount = Math.max(countMatches(FUNC_RE, codeText), 1);
  const decisions = countMatches(DECISION_RE, codeText);
  const CC = (1 + decisions) / funcCount;

  const miRaw =
    171 -
    5.2 * Math.log(Math.max(V, 1)) -
    0.23 * CC -
    16.2 * Math.log(Math.max(LOC, 1)) +
    50 * Math.sin(Math.sqrt(2.4 * CM));
  // Normalize to radon's 0-100 reporting scale (clamped), where 20 is rank-A.
  const MI = Math.max(0, Math.min(100, (miRaw * 100) / 171));
  return { MI, LOC, CC, V, CM };
}

function scanFile(file, violations) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return;
  }
  const totalLines = text.split(/\r?\n/).filter((l) => l.trim() !== "").length;
  if (totalLines < MIN_LINES_FOR_MI) return; // too small to measure

  const { MI } = computeMI(text);
  if (MI < MI_THRESHOLD) {
    violations.push({
      rule_id: RULE_ID,
      file,
      line: 1,
      col: 1,
      evidence: `approx maintainability index ${MI.toFixed(1)} < ${MI_THRESHOLD} threshold`,
      source_line: (text.split(/\r?\n/).find((l) => l.trim() !== "") ?? "").trim(),
    });
  }
}

function main() {
  const reportPath = process.env.ATDD_VIOLATIONS_REPORT;
  if (!reportPath) {
    process.stderr.write("convex-detector: ATDD_VIOLATIONS_REPORT not set\n");
    process.exit(2);
  }
  const roots = parseJsonEnv("ATDD_SCAN_ROOTS", []);
  const excludes = [...DEFAULT_EXCLUDES, ...parseJsonEnv("ATDD_SCAN_EXCLUDES", [])];

  const violations = [];
  for (const root of roots) {
    for (const file of walk(root, excludes)) scanFile(file, violations);
  }

  writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
  process.stderr.write(
    `convex-detector: scanned ${roots.length} root(s), ${violations.length} violation(s)\n`,
  );
  process.exit(0);
}

main();
