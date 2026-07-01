#!/usr/bin/env node
// Detector: coder.convex.quality-comments  (disposition: strict)
//
// Comment-DEBT lens on Convex server source. Where Core's TS sibling
// (coder.refactor.quality-comments-typescript) flags a SHORTAGE of explanatory
// comments (ratio < 10%), the Convex realization flags the opposite failure mode
// that actually accrues in a backend function tree: comment DEBT — large blocks of
// commented-out code left behind, and an over-dense sprinkling of debt markers
// (TODO/FIXME/HACK/XXX). Both make the module harder to read during REFACTOR.
//
// Two RAW signals, each emitted as its own call-site violation:
//   (A) COMMENTED-OUT CODE BLOCK — a run of >= 3 consecutive single-line (`//`)
//       comment lines whose stripped content looks like code (assignment, call,
//       control-flow, brace, etc.). One violation at the run's first line.
//   (B) DEBT-COMMENT DENSITY — a file of >= 20 non-blank lines whose debt-marker
//       density (markers / non-blank lines) exceeds 2%. One violation at the first
//       debt marker.
//
// CONTRACT (convex.workspace.runtime v1.1). Env in / JSON report out, RAW channel,
// exit 0 even when violations are found.
//   INPUT   env ATDD_SCAN_ROOTS     JSON array of dir/file roots to inspect.
//           env ATDD_SCAN_EXCLUDES  JSON array of extra excludes (optional).
//           env ATDD_VIOLATIONS_REPORT  path to write the JSON report to.
//   OUTPUT  {"violations": [{rule_id,file,line,col,evidence,source_line}, ...]}

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, sep } from "node:path";

const RULE_ID = "coder.convex.quality-comments";

const DEFAULT_EXCLUDES = ["_generated", "node_modules", "dist", "build", ".next"];
const TS_EXT = new Set([".ts", ".tsx", ".js", ".mjs"]);
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

// --- thresholds (normative; mirrored in the convention YAML) ---------------
const MIN_COMMENTED_CODE_RUN = 3;   // >= 3 consecutive code-like comment lines = a block
const MIN_LINES_FOR_DENSITY = 20;   // files smaller than this are not density-measured
const DEBT_DENSITY_THRESHOLD = 0.02; // > 2% of non-blank lines carrying a debt marker

const DEBT_RE = /\b(TODO|FIXME|HACK|XXX)\b/;
// A `//` comment whose body, once the marker is stripped, reads like source code.
const CODE_LIKE_RE =
  /[;{}]\s*$|\b(const|let|var|return|if|else|for|while|switch|case|function|await|async|import|export|throw)\b|=>|\bctx\.(db|auth|scheduler|storage)\b|^\s*[A-Za-z_$][\w$.]*\s*\(/;

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

// Body of a single-line comment, or null if the line is not a `//` comment.
function lineCommentBody(line) {
  const m = /^\s*\/\/(.*)$/.exec(line);
  return m ? m[1] : null;
}

function scanFile(file, violations) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return;
  }
  const lines = text.split(/\r?\n/);

  // (A) Commented-out code blocks: runs of >= MIN_COMMENTED_CODE_RUN consecutive
  // `//` lines whose body looks like code.
  let runStart = -1;
  let runCount = 0;
  const flushRun = (endExclusive) => {
    if (runCount >= MIN_COMMENTED_CODE_RUN) {
      violations.push({
        rule_id: RULE_ID,
        file,
        line: runStart + 1,
        col: 1,
        evidence: `commented-out code block (${runCount} consecutive code-like // lines)`,
        source_line: lines[runStart].trim(),
      });
    }
    runStart = -1;
    runCount = 0;
  };
  for (let i = 0; i < lines.length; i++) {
    const body = lineCommentBody(lines[i]);
    const codeLike = body !== null && CODE_LIKE_RE.test(body);
    if (codeLike) {
      if (runStart === -1) runStart = i;
      runCount++;
    } else {
      flushRun(i);
    }
  }
  flushRun(lines.length);

  // (B) Debt-comment density over threshold.
  let nonBlank = 0;
  let debtCount = 0;
  let firstDebtLine = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() !== "") nonBlank++;
    if (DEBT_RE.test(line)) {
      debtCount++;
      if (firstDebtLine === -1) firstDebtLine = i;
    }
  }
  if (nonBlank >= MIN_LINES_FOR_DENSITY && debtCount > 0) {
    const density = debtCount / nonBlank;
    if (density > DEBT_DENSITY_THRESHOLD) {
      const pct = (density * 100).toFixed(1);
      violations.push({
        rule_id: RULE_ID,
        file,
        line: firstDebtLine + 1,
        col: 1,
        evidence: `debt-comment density ${pct}% > 2% (${debtCount} marker(s) / ${nonBlank} non-blank lines)`,
        source_line: lines[firstDebtLine].trim(),
      });
    }
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
