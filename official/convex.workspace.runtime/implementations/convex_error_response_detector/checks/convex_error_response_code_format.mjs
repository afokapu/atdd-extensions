#!/usr/bin/env node
// Detector: coder.convex.error-response-code-format  (disposition: strict)
//
// The `code` field of a ConvexError is the stable, machine-readable classification
// clients branch on. It MUST be a canonical enum-style identifier — SCREAMING_SNAKE
// (`^[A-Z][A-Z0-9_]*$`) or a dotted namespace of such segments
// (`AUTH.TOKEN_MISSING`) — not a lowercase, kebab, or camelCase string. This
// detector flags each `ConvexError({ code: "<value>" })` whose `code` literal fails
// the canonical pattern.
//
// This is the Convex-stack realization of the agnostic "error codes are stable enum
// identifiers" obligation (the python-pytest sibling is
// `coder.error-response.code-format`, which checks `"error_code": "<value>"`). It is
// the sibling of `coder.convex.error-response-bare-string`. The obligation is
// stack-bound; the detector — a regex over source, no TS runtime — is JS-specific.
//
// CONTRACT (convex.workspace.runtime v1.1):
//   INPUT   env ATDD_SCAN_ROOTS / ATDD_SCAN_EXCLUDES / ATDD_VIOLATIONS_REPORT
//   OUTPUT  {"violations": [{rule_id,file,line,col,evidence,source_line}, ...]}
// RAW factual channel only — exits 0 even when it finds violations.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, sep } from "node:path";

const RULE_ID = "coder.convex.error-response-code-format";

const DEFAULT_EXCLUDES = ["_generated", "node_modules", "dist", "build", ".next"];
const TS_EXT = new Set([".ts", ".tsx", ".js", ".mjs"]);
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

// Canonical error code: SCREAMING_SNAKE, optionally dotted-namespaced into
// SCREAMING_SNAKE segments. e.g. INVALID_INPUT, RESOURCE_NOT_FOUND, AUTH.TOKEN_MISSING.
const CANONICAL_CODE = /^[A-Z][A-Z0-9_]*(\.[A-Z][A-Z0-9_]*)*$/;

const RE_CONVEX_ERROR = /\bConvexError\s*\(/g;
const RE_CODE_LITERAL = /\bcode\s*:\s*(['"])([^'"\n]*)\1/g;

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

// Two length-preserving masks: mc (comments blanked, string contents kept — for
// reading the code literal value) and ms (comments AND string contents blanked —
// for structural ConvexError(…) paren matching). Newlines preserved in both.
function maskSource(src) {
  const mc = src.split("");
  const ms = src.split("");
  let i = 0;
  const n = src.length;
  let state = "code";
  const blank = (c) => (c === "\n" ? "\n" : " ");
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (state === "code") {
      if (c === "/" && d === "/") { mc[i] = mc[i + 1] = " "; ms[i] = ms[i + 1] = " "; i += 2; state = "line"; continue; }
      if (c === "/" && d === "*") { mc[i] = mc[i + 1] = " "; ms[i] = ms[i + 1] = " "; i += 2; state = "block"; continue; }
      if (c === "'") { state = "sq"; i++; continue; }
      if (c === '"') { state = "dq"; i++; continue; }
      if (c === "`") { state = "tpl"; i++; continue; }
      i++; continue;
    }
    if (state === "line") {
      if (c === "\n") { state = "code"; i++; continue; }
      mc[i] = blank(c); ms[i] = blank(c); i++; continue;
    }
    if (state === "block") {
      if (c === "*" && d === "/") { mc[i] = mc[i + 1] = " "; ms[i] = ms[i + 1] = " "; i += 2; state = "code"; continue; }
      mc[i] = blank(c); ms[i] = blank(c); i++; continue;
    }
    if (state === "sq") {
      if (c === "\\") { ms[i] = blank(c); ms[i + 1] = blank(src[i + 1]); i += 2; continue; }
      if (c === "'") { state = "code"; i++; continue; }
      ms[i] = blank(c); i++; continue;
    }
    if (state === "dq") {
      if (c === "\\") { ms[i] = blank(c); ms[i + 1] = blank(src[i + 1]); i += 2; continue; }
      if (c === '"') { state = "code"; i++; continue; }
      ms[i] = blank(c); i++; continue;
    }
    // tpl
    if (c === "\\") { ms[i] = blank(c); ms[i + 1] = blank(src[i + 1]); i += 2; continue; }
    if (c === "`") { state = "code"; i++; continue; }
    ms[i] = blank(c); i++;
  }
  return { mc: mc.join(""), ms: ms.join("") };
}

function matchParenEnd(ms, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < ms.length; i++) {
    const c = ms[i];
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return ms.length;
}

function lineColAt(src, index) {
  let line = 1;
  let last = -1;
  for (let i = 0; i < index; i++) {
    if (src[i] === "\n") { line++; last = i; }
  }
  return { line, col: index - last };
}

function scanFile(file, violations) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return;
  }
  const { mc, ms } = maskSource(text);
  const lines = text.split(/\r?\n/);

  RE_CONVEX_ERROR.lastIndex = 0;
  let m;
  while ((m = RE_CONVEX_ERROR.exec(ms)) !== null) {
    const openParen = m.index + m[0].length - 1;
    const end = matchParenEnd(ms, openParen);
    const spanMc = mc.slice(openParen, end);

    RE_CODE_LITERAL.lastIndex = 0;
    let cm;
    while ((cm = RE_CODE_LITERAL.exec(spanMc)) !== null) {
      const value = cm[2];
      if (CANONICAL_CODE.test(value)) continue;
      // index of the value within the original text
      const valIdx = openParen + cm.index + cm[0].indexOf(cm[1]) + 1;
      const { line, col } = lineColAt(text, valIdx);
      violations.push({
        rule_id: RULE_ID,
        file,
        line,
        col,
        evidence: `ConvexError code '${value}' is not canonical SCREAMING_SNAKE/dotted (^[A-Z][A-Z0-9_]*(\\.[A-Z][A-Z0-9_]*)*$)`,
        source_line: (lines[line - 1] || "").trim(),
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
