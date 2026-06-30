#!/usr/bin/env node
// Detector: coder.convex.error-response-bare-string  (disposition: strict)
//
// A Convex server function should signal failure with a structured, coded error —
// `throw new ConvexError({ code, message })` — so clients can classify and handle it
// programmatically. Throwing a bare string (`throw "boom"`) or a generic
// `new Error("plain message")` degrades error handling to substring matching and
// loses the machine-readable code. This detector flags each `throw "<string>"` /
// `throw \`<template>\`` and each `throw new Error(...)` in Convex server source.
//
// This is the Convex-stack realization of the agnostic "errors are structured"
// obligation (the python-pytest sibling is `coder.error-response.bare-string`,
// which forbids `HTTPException(detail="...")`). The obligation is stack-bound; the
// detector — a regex over source, no TS runtime — is JS-specific.
//
// CONTRACT (convex.workspace.runtime v1.1):
//   INPUT   env ATDD_SCAN_ROOTS / ATDD_SCAN_EXCLUDES / ATDD_VIOLATIONS_REPORT
//   OUTPUT  {"violations": [{rule_id,file,line,col,evidence,source_line}, ...]}
// RAW factual channel only — exits 0 even when it finds violations.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, sep } from "node:path";

const RULE_ID = "coder.convex.error-response-bare-string";

const DEFAULT_EXCLUDES = ["_generated", "node_modules", "dist", "build", ".next"];
const TS_EXT = new Set([".ts", ".tsx", ".js", ".mjs"]);
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

// `throw "..."` / `throw '...'` / `throw `...`` — a bare string literal throw.
const RE_THROW_STRING = /\bthrow\s+[`'"]/g;
// `throw new Error(...)` — a generic built-in Error, not a coded ConvexError. The
// `\bError\b` after `new` does not match `new ConvexError(` (one token, not "Error").
const RE_THROW_ERROR = /\bthrow\s+new\s+Error\b\s*\(/g;

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

// Comments + string contents masked (length-preserving): structural keywords stay,
// so `throw new Error(` anchors are matched, but a `throw new Error(` written inside
// a comment or a string is not. Opening/closing quote chars are preserved so the
// bare-string-throw pattern (`throw "`) still matches.
function maskCodeStructure(src) {
  const ms = src.split("");
  let i = 0;
  const n = src.length;
  let state = "code"; // code | line | block | sq | dq | tpl
  const blank = (c) => (c === "\n" ? "\n" : " ");
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (state === "code") {
      if (c === "/" && d === "/") { ms[i] = ms[i + 1] = " "; i += 2; state = "line"; continue; }
      if (c === "/" && d === "*") { ms[i] = ms[i + 1] = " "; i += 2; state = "block"; continue; }
      if (c === "'") { state = "sq"; i++; continue; }
      if (c === '"') { state = "dq"; i++; continue; }
      if (c === "`") { state = "tpl"; i++; continue; }
      i++; continue;
    }
    if (state === "line") {
      if (c === "\n") { state = "code"; i++; continue; }
      ms[i] = blank(c); i++; continue;
    }
    if (state === "block") {
      if (c === "*" && d === "/") { ms[i] = ms[i + 1] = " "; i += 2; state = "code"; continue; }
      ms[i] = blank(c); i++; continue;
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
  return ms.join("");
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
  const ms = maskCodeStructure(text);
  const lines = text.split(/\r?\n/);

  const emit = (index, evidence) => {
    const { line, col } = lineColAt(text, index);
    violations.push({
      rule_id: RULE_ID,
      file,
      line,
      col,
      evidence,
      source_line: (lines[line - 1] || "").trim(),
    });
  };

  RE_THROW_STRING.lastIndex = 0;
  let m;
  while ((m = RE_THROW_STRING.exec(ms)) !== null) {
    emit(m.index, "throw of a bare string literal — throw new ConvexError({ code, message }) instead");
  }
  RE_THROW_ERROR.lastIndex = 0;
  while ((m = RE_THROW_ERROR.exec(ms)) !== null) {
    emit(m.index, "throw new Error(...) — throw new ConvexError({ code, message }) for a coded, structured error");
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
