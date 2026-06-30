#!/usr/bin/env node
// Detector: coder.convex.complexity-params  (disposition: strict)
//
// Flags every Convex server function that declares 6 or more PARAMETERS (Core's
// obligation is "fewer than 6"). Top-level comma-separated parameters are counted
// from the signature; destructuring / default-value groups count as one each.
// Convex sibling of coder.refactor.complexity-params (limit 5, must be < 6).
//
// CONTRACT (convex.workspace.runtime v1.1): reads ATDD_SCAN_ROOTS / ATDD_SCAN_EXCLUDES,
// writes RAW {rule_id,file,line,col,evidence,source_line} violations (one per
// offending function at its header line) to ATDD_VIOLATIONS_REPORT, exits 0
// regardless of violation count (run-health, not a verdict). Skips _generated/,
// node_modules, build dirs, and *.test/*.spec files. Zero dependencies, no AST.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, sep } from "node:path";

const DEFAULT_EXCLUDES = ["_generated", "node_modules", "dist", "build", ".next"];
const TS_EXT = new Set([".ts", ".tsx", ".js", ".mjs"]);
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

const KW_BEFORE_PAREN = new Set(["if", "for", "while", "switch", "catch"]);
const KW_NO_PAREN = new Set(["else", "do", "try", "finally"]);
const NESTING_BEARING = new Set(["if", "for", "while", "switch", "catch", "do"]);

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

// Mask string literals, template literals, and comments to spaces (preserving
// newlines and length) so brace/keyword scanning never trips on them.
function maskSource(text) {
  const out = Array.from(text, (ch) => ch);
  const n = text.length;
  let i = 0;
  let state = "code";
  let codeBraceDepth = 0;
  const interpReturn = [];
  while (i < n) {
    const c = text[i];
    const d = i + 1 < n ? text[i + 1] : "";
    if (state === "code") {
      if (c === "/" && d === "/") { out[i] = " "; out[i + 1] = " "; i += 2; state = "line"; continue; }
      if (c === "/" && d === "*") { out[i] = " "; out[i + 1] = " "; i += 2; state = "block"; continue; }
      if (c === "'") { out[i] = " "; i++; state = "sq"; continue; }
      if (c === '"') { out[i] = " "; i++; state = "dq"; continue; }
      if (c === "`") { out[i] = " "; i++; state = "tpl"; continue; }
      if (c === "{") { codeBraceDepth++; i++; continue; }
      if (c === "}") {
        if (interpReturn.length && codeBraceDepth === interpReturn[interpReturn.length - 1]) {
          interpReturn.pop(); out[i] = " "; i++; state = "tpl"; continue;
        }
        codeBraceDepth--; i++; continue;
      }
      i++; continue;
    }
    if (state === "line") {
      if (c === "\n") { state = "code"; i++; continue; }
      out[i] = " "; i++; continue;
    }
    if (state === "block") {
      if (c === "*" && d === "/") { out[i] = " "; out[i + 1] = " "; i += 2; state = "code"; continue; }
      if (c !== "\n") out[i] = " ";
      i++; continue;
    }
    if (state === "sq" || state === "dq") {
      const q = state === "sq" ? "'" : '"';
      if (c === "\\") { out[i] = " "; if (i + 1 < n && text[i + 1] !== "\n") out[i + 1] = " "; i += 2; continue; }
      if (c === q) { out[i] = " "; i++; state = "code"; continue; }
      if (c !== "\n") out[i] = " ";
      i++; continue;
    }
    if (state === "tpl") {
      if (c === "\\") { out[i] = " "; if (i + 1 < n && text[i + 1] !== "\n") out[i + 1] = " "; i += 2; continue; }
      if (c === "`") { out[i] = " "; i++; state = "code"; continue; }
      if (c === "$" && d === "{") { out[i] = " "; out[i + 1] = " "; interpReturn.push(codeBraceDepth); i += 2; state = "code"; continue; }
      if (c !== "\n") out[i] = " ";
      i++; continue;
    }
  }
  return out.join("");
}

function buildLineIndex(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") starts.push(i + 1);
  return starts;
}
function lineOf(starts, idx) {
  let lo = 0, hi = starts.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= idx) lo = mid; else hi = mid - 1; }
  return lo;
}
function matchBrace(masked, openIdx) {
  let depth = 0;
  for (let j = openIdx; j < masked.length; j++) {
    const ch = masked[j];
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) return j; }
  }
  return -1;
}
function matchParenBack(masked, closeIdx) {
  let depth = 0;
  for (let j = closeIdx; j >= 0; j--) {
    const ch = masked[j];
    if (ch === ")") depth++;
    else if (ch === "(") { depth--; if (depth === 0) return j; }
  }
  return -1;
}
function matchParenFwd(masked, openIdx) {
  let depth = 0;
  for (let j = openIdx; j < masked.length; j++) {
    const ch = masked[j];
    if (ch === "(") depth++;
    else if (ch === ")") { depth--; if (depth === 0) return j; }
  }
  return -1;
}
function prevWord(masked, idx) {
  let j = idx;
  while (j >= 0 && /\s/.test(masked[j])) j--;
  const end = j + 1;
  while (j >= 0 && /[\w$]/.test(masked[j])) j--;
  return { word: masked.slice(j + 1, end), start: j + 1 };
}
function countParams(paramText) {
  let depth = 0, count = 0, seen = false;
  for (const ch of paramText) {
    if ("([{".includes(ch)) depth++;
    else if (")]}".includes(ch)) depth--;
    else if (ch === "," && depth === 0) count++;
    else if (!/\s/.test(ch)) seen = true;
  }
  return seen ? count + 1 : 0;
}
function nameBefore(masked, sigStart) {
  let j = sigStart - 1;
  while (j >= 0 && /\s/.test(masked[j])) j--;
  const mod = prevWord(masked, j);
  if (mod.word === "async") { j = mod.start - 1; while (j >= 0 && /\s/.test(masked[j])) j--; }
  if (masked[j] === "=" || masked[j] === ":") {
    j--;
    while (j >= 0 && /\s/.test(masked[j])) j--;
    const end = j + 1;
    while (j >= 0 && /[\w$]/.test(masked[j])) j--;
    return masked.slice(j + 1, end);
  }
  return "";
}

// Extract function-declaration and block-bodied arrow-function units.
function extractFunctions(text) {
  const masked = maskSource(text);
  const starts = buildLineIndex(text);
  const origLines = text.split(/\r?\n/);
  const maskedLines = masked.split(/\r?\n/);
  const funcs = [];
  const seenBodies = new Set();

  const record = (sigIdx, name, paramText, bodyOpenIdx) => {
    const bodyCloseIdx = matchBrace(masked, bodyOpenIdx);
    if (bodyCloseIdx < 0) return;
    if (seenBodies.has(bodyOpenIdx)) return;
    seenBodies.add(bodyOpenIdx);
    const headerLine0 = lineOf(starts, sigIdx);
    funcs.push({
      name: name || "<anonymous>",
      paramCount: countParams(paramText),
      headerLineNo: headerLine0 + 1,
      headerCol: sigIdx - starts[headerLine0] + 1,
      headerLineText: (origLines[headerLine0] || "").trim(),
      bodyOpenLine0: lineOf(starts, bodyOpenIdx),
      bodyCloseLine0: lineOf(starts, bodyCloseIdx),
      maskedBody: masked.slice(bodyOpenIdx + 1, bodyCloseIdx),
      maskedLines,
    });
  };

  const funcDecl = /\bfunction\b\s*\*?\s*([A-Za-z_$][\w$]*)?\s*(?:<[^>]*>)?\s*\(/g;
  let m;
  while ((m = funcDecl.exec(masked)) !== null) {
    const parenOpen = m.index + m[0].length - 1;
    const parenClose = matchParenFwd(masked, parenOpen);
    if (parenClose < 0) continue;
    let k = parenClose + 1;
    while (k < masked.length && /\s/.test(masked[k])) k++;
    if (masked[k] === ":") { while (k < masked.length && masked[k] !== "{" && masked[k] !== ";") k++; }
    if (masked[k] !== "{") continue;
    record(m.index, m[1], masked.slice(parenOpen + 1, parenClose), k);
  }

  const arrow = /=>/g;
  while ((m = arrow.exec(masked)) !== null) {
    let k = m.index + 2;
    while (k < masked.length && /\s/.test(masked[k])) k++;
    if (masked[k] !== "{") continue;
    let p = m.index - 1;
    while (p >= 0 && /\s/.test(masked[p])) p--;
    let paramText = "", sigIdx = m.index, name = "";
    if (masked[p] === ")") {
      const parenOpen = matchParenBack(masked, p);
      if (parenOpen < 0) continue;
      paramText = masked.slice(parenOpen + 1, p);
      sigIdx = parenOpen;
      name = nameBefore(masked, parenOpen);
    } else if (/[\w$]/.test(masked[p])) {
      const pw = prevWord(masked, p);
      paramText = pw.word;
      sigIdx = pw.start;
      name = nameBefore(masked, pw.start);
    } else {
      continue;
    }
    record(sigIdx, name, paramText, k);
  }

  funcs.sort((a, b) => a.headerLineNo - b.headerLineNo);
  return funcs;
}

function bodyLoc(fn) {
  let loc = 0;
  for (let ln = fn.bodyOpenLine0 + 1; ln <= fn.bodyCloseLine0 - 1; ln++) {
    if (fn.maskedLines[ln] && fn.maskedLines[ln].trim().length > 0) loc++;
  }
  return loc;
}

function cyclomatic(fn) {
  const b = fn.maskedBody;
  const count = (re) => (b.match(re) || []).length;
  let score = 1;
  score += count(/\bif\b/g);
  score += count(/\bfor\b/g);
  score += count(/\bwhile\b/g);
  score += count(/\bdo\b/g);
  score += count(/\bcatch\b/g);
  score += count(/\bcase\b/g);
  score += count(/&&/g);
  score += count(/\|\|/g);
  score += count(/\?\?/g);
  const noNullish = b.replace(/\?\?/g, "  ");
  score += (noNullish.match(/\?(?![.:?])/g) || []).length;
  return score;
}

function classifyBrace(masked, braceIdx) {
  let j = braceIdx - 1;
  while (j >= 0 && /\s/.test(masked[j])) j--;
  if (masked[j] === ")") {
    const parenOpen = matchParenBack(masked, j);
    if (parenOpen < 0) return { control: false, kw: "", elseIf: false };
    const pw = prevWord(masked, parenOpen - 1);
    const kw = pw.word;
    if (KW_BEFORE_PAREN.has(kw)) {
      let elseIf = false;
      if (kw === "if") {
        const before = prevWord(masked, pw.start - 1);
        if (before.word === "else") elseIf = true;
      }
      return { control: true, kw, elseIf };
    }
    return { control: false, kw: "", elseIf: false };
  }
  const pw = prevWord(masked, j);
  if (KW_NO_PAREN.has(pw.word)) return { control: true, kw: pw.word, elseIf: false };
  return { control: false, kw: "", elseIf: false };
}

function analyzeBlocks(fn) {
  const b = fn.maskedBody;
  const stack = [];
  let controlDepth = 0, maxDepth = 0, cognitive = 0;
  for (let i = 0; i < b.length; i++) {
    const ch = b[i];
    if (ch === "{") {
      const info = classifyBrace(b, i);
      if (info.control) {
        if (NESTING_BEARING.has(info.kw)) {
          if (info.elseIf) cognitive += 1;
          else cognitive += 1 + controlDepth;
        } else if (info.kw === "else") {
          cognitive += 1;
        }
        controlDepth++;
        if (controlDepth > maxDepth) maxDepth = controlDepth;
      }
      stack.push(info.control);
    } else if (ch === "}") {
      const ctrl = stack.pop();
      if (ctrl) controlDepth--;
    }
  }
  cognitive += (b.match(/&&/g) || []).length;
  cognitive += (b.match(/\|\|/g) || []).length;
  cognitive += (b.match(/\?\?/g) || []).length;
  return { maxNesting: maxDepth, cognitive };
}

const LIMIT = 5; // a function must declare at most 5 params (must be < 6)
function evaluate(fn) {
  if (fn.paramCount <= LIMIT) return null;
  return 'function "' + fn.name + '" declares ' + fn.paramCount + ' parameters (limit ' + LIMIT + ', must be < 6)';
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
    for (const file of walk(root, excludes)) {
      let text;
      try { text = readFileSync(file, "utf8"); } catch { continue; }
      for (const fn of extractFunctions(text)) {
        const hit = evaluate(fn);
        if (!hit) continue;
        violations.push({
          rule_id: RULE_ID,
          file,
          line: fn.headerLineNo,
          col: fn.headerCol,
          evidence: hit,
          source_line: fn.headerLineText,
        });
      }
    }
  }

  writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
  process.stderr.write(
    "convex-detector: scanned " + roots.length + " root(s), " + violations.length + " violation(s)\n",
  );
  process.exit(0);
}

const RULE_ID = "coder.convex.complexity-params";
main();
