#!/usr/bin/env node
// Detector: coder.convex.performance-perf  (disposition: documentation-only)
//
// The Convex-stack realization of the agnostic "no per-item IO inside iteration"
// performance principle (the Core source is the `coder.performance.perf` principle;
// its strict specialization for DB-reads-in-loops is coder.convex.nplus1-db-in-loop).
// This node surfaces ADVISORY perf smells in Convex server code:
//   1. `await` inside a loop body / iteration callback — serialized per-item IO.
//   2. a full-table `.collect()` on a `ctx.db.query(...)` chain with NO `.withIndex(`
//      — an unbounded table scan whose cost grows with table size.
// Disposition is documentation-only: these are coaching signals, not gate failures.
//
// CONTRACT (convex.workspace.runtime v1.1 — JS sibling of the python-pytest contract):
//   INPUT   env ATDD_SCAN_ROOTS / ATDD_SCAN_EXCLUDES / ATDD_VIOLATIONS_REPORT
//   OUTPUT  {"violations":[{rule_id,file,line,col,evidence,source_line}, ...]}
// RAW factual channel only — ZERO disposition; exits 0 regardless of count.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, sep } from "node:path";

const RULE_ID = "coder.convex.performance-perf";

const DEFAULT_EXCLUDES = ["_generated", "node_modules", "dist", "build", ".next"];
const TS_EXT = new Set([".ts", ".tsx", ".js", ".mjs"]);
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

// ── shared zero-dep scanning helpers (inlined; each detector is self-contained) ──
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

function blankNonCode(text) {
  const out = text.split("");
  const n = text.length;
  let i = 0;
  let state = "code";
  const blank = (j) => {
    if (text[j] !== "\n" && text[j] !== "\r") out[j] = " ";
  };
  while (i < n) {
    const c = text[i];
    const c2 = text[i + 1];
    if (state === "code") {
      if (c === "/" && c2 === "/") { state = "line"; blank(i); blank(i + 1); i += 2; continue; }
      if (c === "/" && c2 === "*") { state = "block"; blank(i); blank(i + 1); i += 2; continue; }
      if (c === "'") { state = "sq"; blank(i); i++; continue; }
      if (c === '"') { state = "dq"; blank(i); i++; continue; }
      if (c === "`") { state = "tpl"; blank(i); i++; continue; }
      i++; continue;
    }
    if (state === "line") { if (c === "\n") { state = "code"; i++; continue; } blank(i); i++; continue; }
    if (state === "block") { blank(i); if (c === "*" && c2 === "/") { blank(i + 1); i += 2; state = "code"; continue; } i++; continue; }
    if (state === "sq") { blank(i); if (c === "\\") { blank(i + 1); i += 2; continue; } if (c === "'") { state = "code"; i++; continue; } i++; continue; }
    if (state === "dq") { blank(i); if (c === "\\") { blank(i + 1); i += 2; continue; } if (c === '"') { state = "code"; i++; continue; } i++; continue; }
    if (state === "tpl") { blank(i); if (c === "\\") { blank(i + 1); i += 2; continue; } if (c === "`") { state = "code"; i++; continue; } i++; continue; }
    i++;
  }
  return out.join("");
}

function lineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") starts.push(i + 1);
  return starts;
}

function posToLineCol(starts, idx) {
  let lo = 0, hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= idx) lo = mid; else hi = mid - 1;
  }
  return { line: lo + 1, col: idx - starts[lo] + 1 };
}

function lineTextAt(text, starts, idx) {
  const { line } = posToLineCol(starts, idx);
  const start = starts[line - 1];
  let end = text.indexOf("\n", start);
  if (end === -1) end = text.length;
  return text.slice(start, end).trim();
}

function matchPair(blanked, openIdx, open, close) {
  let depth = 0;
  for (let i = openIdx; i < blanked.length; i++) {
    const ch = blanked[i];
    if (ch === open) depth++;
    else if (ch === close) { depth--; if (depth === 0) return i; }
  }
  return -1;
}

// [start,end) spans of every loop body: for/while blocks (or brace-less bodies)
// and the callback argument list of `.map(`/`.forEach(`. `for await (...)` headers
// are excluded since the body starts after the header parens.
function loopBodySpans(blanked) {
  const spans = [];
  const headerRe = /\b(for|while)\s*\(/g;
  let m;
  while ((m = headerRe.exec(blanked)) !== null) {
    const parenOpen = blanked.indexOf("(", m.index);
    const parenClose = matchPair(blanked, parenOpen, "(", ")");
    if (parenClose === -1) continue;
    let j = parenClose + 1;
    while (j < blanked.length && /\s/.test(blanked[j])) j++;
    if (blanked[j] === "{") {
      const braceClose = matchPair(blanked, j, "{", "}");
      if (braceClose !== -1) spans.push([j + 1, braceClose]);
    } else {
      let k = j;
      while (k < blanked.length && blanked[k] !== ";" && blanked[k] !== "\n") k++;
      spans.push([j, k]);
    }
  }
  const cbRe = /\.\s*(map|forEach)\s*\(/g;
  while ((m = cbRe.exec(blanked)) !== null) {
    const parenOpen = blanked.indexOf("(", m.index);
    const parenClose = matchPair(blanked, parenOpen, "(", ")");
    if (parenClose === -1) continue;
    spans.push([parenOpen + 1, parenClose]);
  }
  return spans;
}

// ── detection ────────────────────────────────────────────────────────────────
const AWAIT_RE = /\bawait\b/g;
const COLLECT_RE = /\.\s*collect\s*\(/g;
const STMT_BOUNDARY = new Set([";", "{", "}"]);

function scanFile(file, violations) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return;
  }
  const blanked = blankNonCode(text);
  const starts = lineStarts(text);

  // Smell 1: await inside a loop body / iteration callback.
  const spans = loopBodySpans(blanked);
  const inLoop = (idx) => spans.some(([s, e]) => idx >= s && idx < e);
  AWAIT_RE.lastIndex = 0;
  let m;
  while ((m = AWAIT_RE.exec(blanked)) !== null) {
    const idx = m.index;
    if (!inLoop(idx)) continue;
    const { line, col } = posToLineCol(starts, idx);
    violations.push({
      rule_id: RULE_ID,
      file,
      line,
      col,
      evidence: "await inside a loop body — serialized per-item IO; consider batching",
      source_line: lineTextAt(text, starts, idx),
    });
  }

  // Smell 2: full-table `.collect()` — a `ctx.db.query(...)` chain ending in
  // `.collect(` with NO `.withIndex(` between the chain start and the collect.
  COLLECT_RE.lastIndex = 0;
  while ((m = COLLECT_RE.exec(blanked)) !== null) {
    const idx = m.index;
    // Walk back to the nearest statement boundary to bound the chain window.
    let s = idx;
    while (s > 0 && !STMT_BOUNDARY.has(blanked[s - 1])) s--;
    const window = blanked.slice(s, idx);
    if (!/\.\s*query\s*\(/.test(window)) continue;     // not a ctx.db.query chain
    if (/\.\s*withIndex\s*\(/.test(window)) continue;  // indexed → bounded scan, OK
    const { line, col } = posToLineCol(starts, idx);
    violations.push({
      rule_id: RULE_ID,
      file,
      line,
      col,
      evidence: ".collect() on a query with no .withIndex() — full-table scan; add an index",
      source_line: lineTextAt(text, starts, idx),
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
