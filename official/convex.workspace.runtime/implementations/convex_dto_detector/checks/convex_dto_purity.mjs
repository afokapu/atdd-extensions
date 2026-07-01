#!/usr/bin/env node
// Detector: coder.convex.dto-purity  (disposition: advisory)
//
// Convex realization of core dto.convention.yaml DTO-PURITY-001. The convention's
// validation.dto_requirements are explicit: "DTOs MUST be pure data structures
// with NO methods (except serialization)" and "DTOs MUST be immutable (frozen=True
// in Python, final in Dart, readonly in TS)". A `*DTO` type carrying a METHOD
// member (business logic) or a NON-`readonly` (mutable) data field is impure — it
// couples behaviour or mutability into what must be a flat, serializable contract
// boundary. This detector extracts each `interface|type <Name>DTO { … }` body and
// flags every top-level method member and every non-readonly data property.
//
// CONTRACT (convex.workspace.runtime v1.1): reads ATDD_SCAN_ROOTS /
// ATDD_SCAN_EXCLUDES, writes RAW {rule_id,file,line,col,evidence,source_line}
// violations to ATDD_VIOLATIONS_REPORT, exits 0 regardless of violation count.
// Skips _generated/, node_modules, build dirs, and *.test/*.spec files. Zero deps.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, sep } from "node:path";

const RULE_ID = "coder.convex.dto-purity";
const DEFAULT_EXCLUDES = ["_generated", "node_modules", "dist", "build", ".next"];
const TS_EXT = new Set([".ts", ".tsx", ".js", ".mjs"]);
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

// `interface XxxDTO {` or `type XxxDTO = {` — capture name; body starts at the `{`.
const DTO_DECL_RE = /\b(?:export\s+)?(?:interface|type)\s+([A-Za-z_$][\w$]*DTO)\b[^{;]*/g;
const METHOD_RE = /^[A-Za-z_$][\w$]*\s*\??\s*(?:<[^>]*>)?\s*\(/;      // member(...) — method sig
const PROP_RE = /^([A-Za-z_$][\w$]*)\s*\??\s*:/;                     // member: Type — data field

function parseJsonEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : fallback; } catch { return fallback; }
}
function isExcluded(path, excludes) {
  const segs = path.split(sep);
  return excludes.some((ex) => segs.includes(ex) || path.includes(ex));
}
function* walk(root, excludes) {
  let st;
  try { st = statSync(root); } catch { return; }
  if (st.isFile()) { if (TS_EXT.has(extname(root)) && !TEST_RE.test(root)) yield root; return; }
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    if (isExcluded(full, excludes)) continue;
    let cst;
    try { cst = statSync(full); } catch { continue; }
    if (cst.isDirectory()) yield* walk(full, excludes);
    else if (TS_EXT.has(extname(full)) && !TEST_RE.test(full)) yield full;
  }
}
function matchBrace(text, openIdx) {
  let depth = 0;
  for (let j = openIdx; j < text.length; j++) {
    if (text[j] === "{") depth++;
    else if (text[j] === "}") { depth--; if (depth === 0) return j; }
  }
  return -1;
}
function lineNoAt(text, idx) {
  let n = 1;
  for (let i = 0; i < idx && i < text.length; i++) if (text[i] === "\n") n++;
  return n;
}

function main() {
  const reportPath = process.env.ATDD_VIOLATIONS_REPORT;
  if (!reportPath) { process.stderr.write("convex-detector: ATDD_VIOLATIONS_REPORT not set\n"); process.exit(2); }
  const roots = parseJsonEnv("ATDD_SCAN_ROOTS", []);
  const excludes = [...DEFAULT_EXCLUDES, ...parseJsonEnv("ATDD_SCAN_EXCLUDES", [])];

  const violations = [];
  for (const root of roots) {
    for (const file of walk(root, excludes)) {
      let text;
      try { text = readFileSync(file, "utf8"); } catch { continue; }
      DTO_DECL_RE.lastIndex = 0;
      let d;
      while ((d = DTO_DECL_RE.exec(text)) !== null) {
        const openIdx = text.indexOf("{", d.index + d[0].length - 1);
        if (openIdx < 0) continue;
        const closeIdx = matchBrace(text, openIdx);
        if (closeIdx < 0) continue;
        const bodyStartLine = lineNoAt(text, openIdx);
        const body = text.slice(openIdx + 1, closeIdx);
        // Walk body lines; classify only members at the top level of the interface
        // (relative brace depth 0 at the start of the line).
        const bodyLines = body.split("\n");
        let depth = 0;
        for (let li = 0; li < bodyLines.length; li++) {
          const raw = bodyLines[li];
          const trimmed = raw.trim();
          const startDepth = depth;
          for (const ch of raw) { if (ch === "{") depth++; else if (ch === "}") depth--; }
          if (startDepth !== 0) continue;                 // nested — skip
          if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;
          const absLine = bodyStartLine + li;             // openIdx line + offset
          if (METHOD_RE.test(trimmed)) {
            violations.push({
              rule_id: RULE_ID, file, line: absLine, col: raw.length - raw.trimStart().length + 1,
              evidence: `DTO '${d[1]}' declares a method member — DTOs must be pure data structures with no methods`,
              source_line: trimmed,
            });
          } else if (PROP_RE.test(trimmed) && !/^readonly\b/.test(trimmed)) {
            violations.push({
              rule_id: RULE_ID, file, line: absLine, col: raw.length - raw.trimStart().length + 1,
              evidence: `DTO '${d[1]}' field '${PROP_RE.exec(trimmed)[1]}' is not readonly — DTO fields must be immutable`,
              source_line: trimmed,
            });
          }
        }
      }
    }
  }

  writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
  process.stderr.write("convex-detector: scanned " + roots.length + " root(s), " + violations.length + " violation(s)\n");
  process.exit(0);
}

main();
