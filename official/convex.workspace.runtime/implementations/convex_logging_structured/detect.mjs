#!/usr/bin/env node
// Detector: coder.convex.logging-structured  (disposition: suppress-and-clean)
//
// The Convex-stack realization of the agnostic "log with structured context, not a
// bare string" obligation (the python-pytest sibling is `coder.logging.structured`,
// which forbids `logger.info("msg")` without `extra={...}`). On Convex's backend
// the log channel is `console.*` (and project logger wrappers); a structured log
// passes a machine-readable payload object alongside a STATIC event name. A log
// whose message is a bare interpolated string —
//   console.log(`charging ${userId} ${amount}`)
// — and that carries no structured payload object degrades to an unstructured,
// unqueryable line. This detector flags those call sites.
//
// CONTRACT (convex.workspace.runtime v1.1 — JS sibling of the python-pytest contract):
//   INPUT   env ATDD_SCAN_ROOTS / ATDD_SCAN_EXCLUDES / ATDD_VIOLATIONS_REPORT
//   OUTPUT  {"violations":[{rule_id,file,line,col,evidence,source_line}, ...]}
// RAW factual channel only — ZERO disposition; exits 0 regardless of count.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, sep } from "node:path";

const RULE_ID = "coder.convex.logging-structured";

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

// Blank string/template/comment characters (newlines preserved) so the call-site
// regex and paren matching never trip on punctuation inside strings or comments.
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
// A server log call on a known receiver. Convex backend logs through console.*;
// project wrappers (logger/log/this.logger) are treated the same.
const LOG_CALL_RE = /\b(console|logger|log|this\.logger)\s*\.\s*(log|info|warn|error|debug|trace)\s*\(/g;

// An interpolated message: a template literal containing `${...}`, OR a string
// concatenation (a quote/backtick adjacent to a `+`). Read over the ORIGINAL arg
// text (blanked text would have hidden the string contents).
function hasInterpolation(argText) {
  if (/`[^`]*\$\{/.test(argText)) return true;          // `... ${x} ...`
  if (/["'`]\s*\+/.test(argText)) return true;           // "..." +  /  `...` +
  if (/\+\s*["'`]/.test(argText)) return true;           // + "..."  /  + `...`
  return false;
}

// A structured payload: an object literal argument `{ ... }` that is NOT a template
// interpolation `${...}`. The clean form is `console.log("event", { userId })`.
function hasStructuredPayload(argText) {
  return /(^|[^$])\{/.test(argText);
}

function scanFile(file, violations) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return;
  }
  const blanked = blankNonCode(text);
  const starts = lineStarts(text);

  LOG_CALL_RE.lastIndex = 0;
  let m;
  while ((m = LOG_CALL_RE.exec(blanked)) !== null) {
    const callIdx = m.index;
    const parenOpen = blanked.indexOf("(", callIdx);
    if (parenOpen === -1) continue;
    const parenClose = matchPair(blanked, parenOpen, "(", ")");
    if (parenClose === -1) continue;
    // Read the argument list from the ORIGINAL text so string contents survive.
    const argText = text.slice(parenOpen + 1, parenClose);
    if (!hasInterpolation(argText)) continue;        // not a bare interpolated message
    if (hasStructuredPayload(argText)) continue;     // already carries a payload object
    const { line, col } = posToLineCol(starts, callIdx);
    violations.push({
      rule_id: RULE_ID,
      file,
      line,
      col,
      evidence: `${m[1]}.${m[2]}(...) logs a bare interpolated string with no structured payload`,
      source_line: lineTextAt(text, starts, callIdx),
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
