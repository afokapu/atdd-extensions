#!/usr/bin/env node
// Detector: coder.convex.logging-silent-swallow  (disposition: suppress-and-clean)
//
// The Convex-stack realization of the agnostic "an exception handler must observably
// react, never silently swallow" obligation (the python-pytest sibling is
// `coder.logging.coach-silent-swallow`). A `catch` block in Convex server code that
// neither logs nor rethrows — an empty `catch (e) {}`, or a handler that just
// `return`s a fallback — converts a loud failure into invisible data corruption.
// This detector flags those handlers.
//
// CONTRACT (convex.workspace.runtime v1.1 — JS sibling of the python-pytest contract):
//   INPUT   env ATDD_SCAN_ROOTS / ATDD_SCAN_EXCLUDES / ATDD_VIOLATIONS_REPORT
//   OUTPUT  {"violations":[{rule_id,file,line,col,evidence,source_line}, ...]}
// RAW factual channel only — ZERO disposition; exits 0 regardless of count.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, sep } from "node:path";

const RULE_ID = "coder.convex.logging-silent-swallow";

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

// Blank string/template/comment characters (newlines preserved). NOTE: this also
// blanks comments inside a catch body, so a comment-only handler reads as empty —
// the moral equivalent of `except: pass` (intentional: a comment is not an
// observable reaction).
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

// ── detection ────────────────────────────────────────────────────────────────
// `catch` with an optional binding, then a `{` block. (Optional-catch-binding —
// `catch {` with no parens — is supported.)
const CATCH_RE = /\bcatch\s*(?:\([^)]*\))?\s*\{/g;

// An observable reaction inside the handler body: a log call on a known receiver,
// or a `throw`. (Scanned over the blanked body so strings/comments don't count.)
const LOG_IN_BODY_RE = /\b(?:console|logger|log|logging|this\.logger)\s*\.\s*\w+\s*\(/;
const THROW_IN_BODY_RE = /\bthrow\b/;
const RETURN_IN_BODY_RE = /\breturn\b/;

function scanFile(file, violations) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return;
  }
  const blanked = blankNonCode(text);
  const starts = lineStarts(text);

  CATCH_RE.lastIndex = 0;
  let m;
  while ((m = CATCH_RE.exec(blanked)) !== null) {
    const catchIdx = m.index;
    const braceOpen = blanked.indexOf("{", catchIdx);
    if (braceOpen === -1) continue;
    const braceClose = matchPair(blanked, braceOpen, "{", "}");
    if (braceClose === -1) continue;
    const body = blanked.slice(braceOpen + 1, braceClose); // blanked: comments gone

    const logs = LOG_IN_BODY_RE.test(body);
    const rethrows = THROW_IN_BODY_RE.test(body);
    if (logs || rethrows) continue; // observable reaction → not a swallow

    const isEmpty = body.trim().length === 0;        // empty / comment-only
    const returns = RETURN_IN_BODY_RE.test(body);    // swallow-and-return-fallback
    // A handler that does other work (assignment/call) but neither returns nor is
    // empty is NOT flagged — core parity: the canonical incident is empty or
    // returning. Only empty OR returning handlers are silent swallows.
    if (!isEmpty && !returns) continue;

    const { line, col } = posToLineCol(starts, catchIdx);
    violations.push({
      rule_id: RULE_ID,
      file,
      line,
      col,
      evidence: isEmpty
        ? "empty catch block — neither logs nor rethrows (silent swallow)"
        : "catch block returns a fallback with no log and no rethrow (silent swallow)",
      source_line: lineTextAt(text, starts, catchIdx),
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
