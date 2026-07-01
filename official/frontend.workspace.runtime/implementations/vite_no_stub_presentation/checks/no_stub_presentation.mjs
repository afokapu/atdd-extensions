#!/usr/bin/env node
// Detector: stub-body presentation components  (family member emitting 5 rule_ids)
//
//   coder.vite.presentation-nostub-arrow-literal    (NOSTUB-001) `() => null`
//   coder.vite.presentation-nostub-fn-return        (NOSTUB-002) block sole `return null`
//   coder.vite.presentation-nostub-empty-fragment   (NOSTUB-003) `<></>`
//   coder.vite.presentation-nostub-empty-element    (NOSTUB-004) `<div />`
//   coder.vite.presentation-nostub-unconditional    (NOSTUB-005) `flag ? null : null`
//
// Vite/React realization of the agnostic no-stub-presentation obligation
// (frontend.convention.yaml::no_stub_presentation, incident #318 — jel-app shipped
// `export const AuthGateShell = () => null;` to production green). Conservative
// zero-dep port of src/atdd/coder/validators/test_no_stub_presentation_returns.py:
// only PascalCase functional components under a `presentation/` path segment are in
// scope; a component whose render body is statically provable to produce no visible
// DOM is a stub. NEGATIVE guarantee (NOSTUB-020): a guarded null paired with a
// sibling meaningful-JSX return is NOT flagged (it has a real return).
//
// CONTRACT (frontend.workspace.runtime v1.1): env ATDD_SCAN_ROOTS / ATDD_SCAN_EXCLUDES
// in, {"violations":[...]} to ATDD_VIOLATIONS_REPORT. RAW channel — always exit 0.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, sep } from "node:path";

const RULE_ARROW_LITERAL = "coder.vite.presentation-nostub-arrow-literal";
const RULE_FN_RETURN = "coder.vite.presentation-nostub-fn-return";
const RULE_EMPTY_FRAGMENT = "coder.vite.presentation-nostub-empty-fragment";
const RULE_EMPTY_ELEMENT = "coder.vite.presentation-nostub-empty-element";
const RULE_UNCONDITIONAL = "coder.vite.presentation-nostub-unconditional";

const DEFAULT_EXCLUDES = ["node_modules", "dist", "build", ".next"];
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

// Classification tags.
const T_LITERAL = "literal", T_UNCONDITIONAL = "unconditional",
      T_EMPTY_FRAGMENT = "empty_fragment", T_EMPTY_ELEMENT = "empty_element";
const ARROW_TAG_TO_RULE = {
  [T_LITERAL]: RULE_ARROW_LITERAL, [T_UNCONDITIONAL]: RULE_UNCONDITIONAL,
  [T_EMPTY_FRAGMENT]: RULE_EMPTY_FRAGMENT, [T_EMPTY_ELEMENT]: RULE_EMPTY_ELEMENT,
};
const BLOCK_TAG_TO_RULE = {
  [T_LITERAL]: RULE_FN_RETURN, [T_UNCONDITIONAL]: RULE_UNCONDITIONAL,
  [T_EMPTY_FRAGMENT]: RULE_EMPTY_FRAGMENT, [T_EMPTY_ELEMENT]: RULE_EMPTY_ELEMENT,
};

function parseJsonEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : fallback; } catch { return fallback; }
}
function isExcluded(path, excludes) {
  const segs = path.split(sep);
  return excludes.some((ex) => segs.includes(ex) || path.includes(ex));
}
function isPresentation(path) {
  return path.replace(/\\/g, "/").includes("/presentation/");
}
function* walk(root, excludes) {
  let st; try { st = statSync(root); } catch { return; }
  if (st.isFile()) { if (extname(root) === ".tsx" && !TEST_RE.test(root) && isPresentation(root)) yield root; return; }
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    if (isExcluded(full, excludes)) continue;
    let cst; try { cst = statSync(full); } catch { continue; }
    if (cst.isDirectory()) yield* walk(full, excludes);
    else if (extname(full) === ".tsx" && !TEST_RE.test(full) && isPresentation(full)) yield full;
  }
}

function stripComments(content) {
  content = content.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  content = content.replace(/\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, " "));
  return content;
}
function lineOf(content, offset) {
  let n = 1;
  for (let i = 0; i < offset && i < content.length; i++) if (content[i] === "\n") n++;
  return n;
}

// Peel `( ... )` wrappers.
function stripParens(s) {
  s = s.trim();
  while (s.startsWith("(") && s.endsWith(")")) {
    // ensure the outer parens are balanced as a pair
    let depth = 0, ok = true;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === "(") depth++;
      else if (s[i] === ")") { depth--; if (depth === 0 && i !== s.length - 1) { ok = false; break; } }
    }
    if (!ok) break;
    s = s.slice(1, -1).trim();
  }
  return s;
}

// Classify a return/arrow operand string. null => not a stub.
function classifyExpr(raw) {
  const s = stripParens(raw);
  if (s === "") return T_LITERAL;                       // bare `return;`
  if (/^(null|undefined)$/.test(s)) return T_LITERAL;
  if (/^<>\s*<\/>$/.test(s)) return T_EMPTY_FRAGMENT;
  if (/^<Fragment>\s*<\/Fragment>$/.test(s)) return T_EMPTY_FRAGMENT;
  if (/^<[a-z][\w-]*\s*\/>$/.test(s)) return T_EMPTY_ELEMENT;     // <div /> — lowercase host, no attrs
  const pair = s.match(/^<([a-z][\w-]*)>\s*<\/\1>$/);
  if (pair) return T_EMPTY_ELEMENT;                                // <div></div>
  // ternary whose both branches are stub literals: `cond ? null : null`
  const tern = s.match(/\?\s*(null|undefined)\s*:\s*(null|undefined)\s*$/);
  if (tern && !/[<]/.test(s)) return T_UNCONDITIONAL;
  return null;
}

// Extract the balanced `{...}` block starting at `open` (index of `{`).
function extractBlock(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return { body: text.slice(open + 1, i), end: i }; }
  }
  return { body: text.slice(open + 1), end: text.length };
}

// Collect return operands inside a block body (does not descend into nested fns
// carefully, but stub bodies are shallow; depth tracking stops at block close).
function collectReturns(body) {
  const out = [];
  const RE = /\breturn\b/g;
  let m;
  while ((m = RE.exec(body)) !== null) {
    let j = m.index + 6;
    while (j < body.length && /\s/.test(body[j])) j++;
    if (body[j] === ";" || j >= body.length) { out.push(""); continue; }
    let depth = 0, start = j;
    for (; j < body.length; j++) {
      const c = body[j];
      if (c === "(" || c === "[" || c === "{") depth++;
      else if (c === ")" || c === "]" || c === "}") { if (depth === 0) break; depth--; }
      else if (c === ";" && depth === 0) break;
    }
    out.push(body.slice(start, j).trim());
  }
  return out;
}

function classifyBlock(body) {
  const returns = collectReturns(body);
  if (returns.length === 0) return null;   // no return → not classified as stub
  const tags = [];
  for (const r of returns) {
    const t = classifyExpr(r);
    if (t === null) return null;            // a real (meaningful-JSX) return → not a stub
    tags.push(t);
  }
  for (const pref of [T_UNCONDITIONAL, T_EMPTY_FRAGMENT, T_EMPTY_ELEMENT, T_LITERAL])
    if (tags.includes(pref)) return pref;
  return null;
}

// Read an arrow expression-body operand starting at `from`, stopping at a top-level
// `;` or a newline that begins a new top-level declaration.
function readArrowExpr(text, from) {
  let depth = 0, i = from;
  for (; i < text.length; i++) {
    const c = text[i];
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") { if (depth === 0) break; depth--; }
    else if (c === ";" && depth === 0) break;
    else if (c === "\n" && depth === 0) {
      let k = i + 1; while (k < text.length && /[ \t]/.test(text[k])) k++;
      if (/^(export|const|let|var|function|}|\/\/)/.test(text.slice(k, k + 9))) break;
    }
  }
  return text.slice(from, i).trim();
}

function scanFile(file, violations) {
  let text; try { text = readFileSync(file, "utf8"); } catch { return; }
  const src = stripComments(text);

  // Arrow components: const Name = (...) => BODY
  const ARROW_RE = /(?:export\s+)?(?:default\s+)?const\s+([A-Z]\w*)\s*(?::\s*[^=]+?)?=\s*(?:async\s+)?(?:\([^)]*\)|[A-Za-z_]\w*)\s*(?::\s*[^=>]+?)?=>\s*/g;
  let m;
  while ((m = ARROW_RE.exec(src)) !== null) {
    const after = m.index + m[0].length;
    const line = lineOf(src, m.index);
    let tag = null, mapping = ARROW_TAG_TO_RULE;
    if (src[after] === "{") {
      const { body } = extractBlock(src, after);
      tag = classifyBlock(body); mapping = BLOCK_TAG_TO_RULE;
    } else {
      const operand = readArrowExpr(src, after);
      tag = classifyExpr(operand); mapping = ARROW_TAG_TO_RULE;
    }
    if (tag) violations.push({
      rule_id: mapping[tag], file, line, col: 1,
      evidence: `presentation component '${m[1]}' has a stub render body (${tag}); render visible content or allowlist with a migration ref`,
      source_line: (text.split(/\r?\n/)[line - 1] || "").trim(),
    });
  }

  // Function-declaration components: function Name(...) { BODY }
  const FN_RE = /(?:export\s+)?(?:default\s+)?function\s+([A-Z]\w*)\s*\([^)]*\)\s*(?::\s*[^{]+?)?{/g;
  while ((m = FN_RE.exec(src)) !== null) {
    const open = src.indexOf("{", m.index + m[0].length - 1);
    if (open < 0) continue;
    const { body } = extractBlock(src, open);
    const line = lineOf(src, m.index);
    const tag = classifyBlock(body);
    if (tag) violations.push({
      rule_id: BLOCK_TAG_TO_RULE[tag], file, line, col: 1,
      evidence: `presentation component '${m[1]}' has a stub render body (${tag}); render visible content or allowlist with a migration ref`,
      source_line: (text.split(/\r?\n/)[line - 1] || "").trim(),
    });
  }
}

function main() {
  const reportPath = process.env.ATDD_VIOLATIONS_REPORT;
  if (!reportPath) { process.stderr.write("nostub-detector: ATDD_VIOLATIONS_REPORT not set\n"); process.exit(2); }
  const roots = parseJsonEnv("ATDD_SCAN_ROOTS", []);
  const excludes = [...DEFAULT_EXCLUDES, ...parseJsonEnv("ATDD_SCAN_EXCLUDES", [])];
  const violations = [];
  for (const root of roots) for (const file of walk(root, excludes)) scanFile(file, violations);
  writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
  process.stderr.write(`nostub-detector: ${violations.length} violation(s)\n`);
  process.exit(0);
}
main();
