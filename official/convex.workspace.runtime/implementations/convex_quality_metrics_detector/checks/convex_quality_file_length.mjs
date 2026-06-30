#!/usr/bin/env node
// Detector: coder.convex.quality-file-length  (disposition: strict)
//
// Convex realization of Core's coder.refactor.quality-file-length. There is NO hard
// maximum — comments, imports, type annotations, and `v.*` validators inflate line
// count without adding complexity, so a hard cap creates false positives. Instead the
// detector emits a RAW factual record for every Convex server module whose TOTAL line
// count exceeds the report threshold of 500 (same threshold as Core). The growth-only
// decision (baseline a 600-line file, fail it only if it grows) is a downstream ratchet
// disposition applied by the consumer, NOT by this detector.
//
// CONTRACT (convex.workspace.runtime v1.1). Env in / JSON report out, RAW channel,
// exit 0 even when violations are found.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, sep } from "node:path";

const RULE_ID = "coder.convex.quality-file-length";

const DEFAULT_EXCLUDES = ["_generated", "node_modules", "dist", "build", ".next"];
const TS_EXT = new Set([".ts", ".tsx", ".js", ".mjs"]);
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

// --- threshold (normative; mirrored in the convention YAML) ----------------
const REPORT_THRESHOLD = 500; // files with strictly more than 500 lines are surfaced

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

function scanFile(file, violations) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return;
  }
  const lines = text.split(/\r?\n/);
  // A trailing newline yields a final empty element; drop it so the count is the
  // number of real lines, not lines + 1.
  const count =
    lines.length > 0 && lines[lines.length - 1] === "" ? lines.length - 1 : lines.length;
  if (count > REPORT_THRESHOLD) {
    violations.push({
      rule_id: RULE_ID,
      file,
      line: REPORT_THRESHOLD + 1, // first line past the threshold
      col: 1,
      evidence: `file has ${count} lines (> ${REPORT_THRESHOLD} report threshold)`,
      source_line: (lines[REPORT_THRESHOLD] ?? "").trim(),
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
