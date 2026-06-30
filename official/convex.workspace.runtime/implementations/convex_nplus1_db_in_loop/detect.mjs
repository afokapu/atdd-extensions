#!/usr/bin/env node
// Detector: coder.convex.nplus1-db-in-loop  (disposition: strict)
//
// The Convex-stack realization of the agnostic "do not query inside a loop"
// obligation (the python-pytest sibling is `coder.refactor.nplus1`). Convex
// document reads/queries — `ctx.db.get(...)` / `ctx.db.query(...)` — executed
// once per iteration of a `for`/`while` loop or a `.map(`/`.forEach(` callback
// are the N+1 anti-pattern: O(N) document round trips where one batched read
// (`getAll` / an indexed `.collect()` + in-memory join) would be O(1).
//
// CONTRACT (convex.workspace.runtime v1.1 — the JS sibling of the python-pytest
// provider contract). The provider (adapter/run.py) shells out to `node` over
// THIS file and communicates ONLY through env + a JSON report file:
//
//   INPUT   env ATDD_SCAN_ROOTS     JSON array of dir/file roots to inspect.
//           env ATDD_SCAN_EXCLUDES  JSON array of substring/segment excludes (optional).
//           env ATDD_VIOLATIONS_REPORT  path to write the JSON report to.
//   OUTPUT  {"violations": [{rule_id,file,line,col,evidence,source_line}, ...]}
//
// RAW factual channel only — the detector applies ZERO disposition. It exits 0
// even when it finds violations; it exits non-zero only on a genuine fault.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, sep } from "node:path";

const RULE_ID = "coder.convex.nplus1-db-in-loop";

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
    return; // missing root — skip silently; a missing scan root is not a fault
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

// Return a copy of `text` where every character inside a string literal, template
// literal, or comment is replaced with a space (newlines preserved). Brace/paren
// matching and keyword regexes run over this so they never trip on punctuation or
// keywords that live inside strings or comments.
function blankNonCode(text) {
  const out = text.split("");
  const n = text.length;
  let i = 0;
  let state = "code"; // code | line | block | sq | dq | tpl
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

// Index of the char matching the opener at `openIdx` in `blanked`, or -1.
function matchPair(blanked, openIdx, open, close) {
  let depth = 0;
  for (let i = openIdx; i < blanked.length; i++) {
    const ch = blanked[i];
    if (ch === open) depth++;
    else if (ch === close) { depth--; if (depth === 0) return i; }
  }
  return -1;
}

// Collect [start,end) spans of every loop body in the file: `for (...){...}`,
// `while (...){...}`, and the callback argument list of `.map(...)`/`.forEach(...)`.
// Brace-less single-statement `for`/`while` bodies span to end of their line.
function loopBodySpans(blanked) {
  const spans = [];
  // for / while — header parens then a `{...}` block (or single-line body).
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
      // brace-less body: to end of statement (next `;` or newline).
      let k = j;
      while (k < blanked.length && blanked[k] !== ";" && blanked[k] !== "\n") k++;
      spans.push([j, k]);
    }
  }
  // .map( / .forEach( — body is the callback argument list.
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
// A Convex document read/query call. `ctx.db.get(` and `ctx.db.query(` are the
// canonical per-document round trips; allow an optional `await` prefix to surface
// it in the evidence string.
const DB_CALL_RE = /ctx\s*\.\s*db\s*\.\s*(get|query)\s*\(/g;

function scanFile(file, violations) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return;
  }
  const blanked = blankNonCode(text);
  const starts = lineStarts(text);
  const spans = loopBodySpans(blanked);
  if (spans.length === 0) return;

  const inLoop = (idx) => spans.some(([s, e]) => idx >= s && idx < e);

  const seen = new Set();
  DB_CALL_RE.lastIndex = 0;
  let m;
  while ((m = DB_CALL_RE.exec(blanked)) !== null) {
    const idx = m.index;
    if (!inLoop(idx)) continue;
    if (seen.has(idx)) continue;
    seen.add(idx);
    const { line, col } = posToLineCol(starts, idx);
    violations.push({
      rule_id: RULE_ID,
      file,
      line,
      col,
      evidence: `ctx.db.${m[1]}(...) inside a loop body — N+1 over Convex documents`,
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
  process.exit(0); // run-health OK regardless of violation count (RAW channel)
}

main();
