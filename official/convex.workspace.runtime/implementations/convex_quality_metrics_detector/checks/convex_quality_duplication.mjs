#!/usr/bin/env node
// Detector: coder.convex.quality-duplication  (disposition: strict)
//
// Convex realization of Core's coder.refactor.quality-duplication. Core hashes a
// sliding window of >= 5 consecutive AST statements (names -> VAR, literals ->
// 0/"") and flags windows whose normalized hash collides across two DIFFERENT
// files. With no AST/TS runtime available (zero-dep, regex-over-source), the
// Convex detector approximates this with a TOKEN-WINDOW over normalized
// SIGNIFICANT lines: a window of >= 5 consecutive significant lines, each
// normalized (line comments stripped; string/number literals replaced with
// placeholders; whitespace collapsed), hashed, and reported when the same window
// hash appears at a second location — within a file OR across files in the scanned
// set (brief: "within a file or layer").
//
// CONTRACT (convex.workspace.runtime v1.1). Env in / JSON report out, RAW channel,
// exit 0 even when violations are found.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, sep } from "node:path";

const RULE_ID = "coder.convex.quality-duplication";

const DEFAULT_EXCLUDES = ["_generated", "node_modules", "dist", "build", ".next"];
const TS_EXT = new Set([".ts", ".tsx", ".js", ".mjs"]);
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

// --- threshold (normative; mirrored in the convention YAML) ----------------
const MIN_DUPLICATE_LINES = 5; // window size: >= 5 consecutive significant lines

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

// A "significant" line carries logic. Blank lines, pure comments, lone braces /
// brackets, and module-header import/export-from lines are excluded so shared
// boilerplate never registers as duplication (parity with Core's header strip).
function normalizeLine(raw) {
  let s = raw.replace(/\/\/.*$/, ""); // strip trailing line comment
  s = s.trim();
  if (s === "") return null;
  if (s.startsWith("/*") || s.startsWith("*") || s.startsWith("*/")) return null; // block comment body
  if (/^[{}()\[\];,]+$/.test(s)) return null; // structural-only line
  if (/^import\b/.test(s) || /^export\s+\{/.test(s) || /^export\s+\*/.test(s)) return null;
  // Normalize literals so renamed copies still collide on structure.
  s = s.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, "S"); // string literals -> S
  s = s.replace(/\b\d+(\.\d+)?\b/g, "N"); // numeric literals -> N
  s = s.replace(/\s+/g, " "); // collapse whitespace
  return s;
}

// Cheap, stable string hash (FNV-1a 32-bit) so windows compare by content.
function hashWindow(normLines) {
  const joined = normLines.join("\n");
  let h = 0x811c9dc5;
  for (let i = 0; i < joined.length; i++) {
    h ^= joined.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16);
}

function main() {
  const reportPath = process.env.ATDD_VIOLATIONS_REPORT;
  if (!reportPath) {
    process.stderr.write("convex-detector: ATDD_VIOLATIONS_REPORT not set\n");
    process.exit(2);
  }
  const roots = parseJsonEnv("ATDD_SCAN_ROOTS", []);
  const excludes = [...DEFAULT_EXCLUDES, ...parseJsonEnv("ATDD_SCAN_EXCLUDES", [])];

  // Gather every significant line (with its real source location) per file, then
  // build windows of MIN_DUPLICATE_LINES significant lines.
  const seen = new Map(); // window hash -> first {file,line,source_line}
  const violations = [];

  for (const root of roots) {
    for (const file of walk(root, excludes)) {
      let text;
      try {
        text = readFileSync(file, "utf8");
      } catch {
        continue;
      }
      const rawLines = text.split(/\r?\n/);
      const sig = []; // {norm, line(1-based), source}
      for (let i = 0; i < rawLines.length; i++) {
        const norm = normalizeLine(rawLines[i]);
        if (norm !== null) sig.push({ norm, line: i + 1, source: rawLines[i].trim() });
      }
      for (let w = 0; w + MIN_DUPLICATE_LINES <= sig.length; w++) {
        const window = sig.slice(w, w + MIN_DUPLICATE_LINES);
        const h = hashWindow(window.map((x) => x.norm));
        const here = { file, line: window[0].line, source: window[0].source };
        const prior = seen.get(h);
        if (prior === undefined) {
          seen.set(h, here);
        } else {
          const sameFileNote =
            prior.file === file
              ? `earlier in this file (line ${prior.line})`
              : `${prior.file} (line ${prior.line})`;
          violations.push({
            rule_id: RULE_ID,
            file,
            line: window[0].line,
            col: 1,
            evidence: `duplicated ${MIN_DUPLICATE_LINES}-line block; first seen at ${sameFileNote}`,
            source_line: here.source,
          });
        }
      }
    }
  }

  writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
  process.stderr.write(
    `convex-detector: scanned ${roots.length} root(s), ${violations.length} violation(s)\n`,
  );
  process.exit(0);
}

main();
