#!/usr/bin/env node
// Detector: coder.convex.dto-mapper  (disposition: advisory)
//
// Convex realization of core dto.convention.yaml DTO-MAPPER-001 ("Mappers between
// domain entities and DTOs live in the integration layer"). The TS mapper_pattern
// fixes the location as `{wagon}/src/integration/dtoMapping.ts` and
// mapper_requirements state: "Mappers MUST live in integration layer, never in
// domain". A DTO<->domain mapper module — identified by a `*-mapper.ts` /
// `*mapping.ts` basename OR by declaring a `dtoToDomain` / `domainToDto`
// conversion function — that does NOT sit under an `integration/` layer directory
// leaks translation logic into the wrong layer (typically domain or presentation).
// This detector flags each mis-placed mapper module.
//
// CONTRACT (convex.workspace.runtime v1.1): reads ATDD_SCAN_ROOTS /
// ATDD_SCAN_EXCLUDES, writes RAW {rule_id,file,line,col,evidence,source_line}
// violations to ATDD_VIOLATIONS_REPORT, exits 0 regardless of violation count.
// Skips _generated/, node_modules, build dirs, and *.test/*.spec files. Zero deps.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, sep, basename } from "node:path";

const RULE_ID = "coder.convex.dto-mapper";
const DEFAULT_EXCLUDES = ["_generated", "node_modules", "dist", "build", ".next"];
const TS_EXT = new Set([".ts", ".tsx", ".js", ".mjs"]);
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

const MAPPER_NAME_RE = /(?:-mapper|mapping)$/;                 // basename (sans ext)
const MAPPER_FN_RE = /\b(?:dtoToDomain|domainToDto)\b/;        // conversion functions

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

function main() {
  const reportPath = process.env.ATDD_VIOLATIONS_REPORT;
  if (!reportPath) { process.stderr.write("convex-detector: ATDD_VIOLATIONS_REPORT not set\n"); process.exit(2); }
  const roots = parseJsonEnv("ATDD_SCAN_ROOTS", []);
  const excludes = [...DEFAULT_EXCLUDES, ...parseJsonEnv("ATDD_SCAN_EXCLUDES", [])];

  const violations = [];
  for (const root of roots) {
    for (const file of walk(root, excludes)) {
      const base = basename(file).replace(/\.(tsx?|m?js)$/, "");
      const nameSaysMapper = MAPPER_NAME_RE.test(base);
      let text = "";
      try { text = readFileSync(file, "utf8"); } catch { /* keep name signal */ }
      const bodySaysMapper = MAPPER_FN_RE.test(text);
      if (!nameSaysMapper && !bodySaysMapper) continue;       // not a mapper module
      if (file.split(sep).includes("integration")) continue;  // correctly placed
      // locate a meaningful anchor line (a conversion fn, else line 1)
      let line = 1, srcLine = base;
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (MAPPER_FN_RE.test(lines[i])) { line = i + 1; srcLine = lines[i].trim(); break; }
      }
      violations.push({
        rule_id: RULE_ID,
        file,
        line,
        col: 1,
        evidence: `DTO<->domain mapper module '${basename(file)}' lives outside the integration/ layer (mappers must live in the integration layer)`,
        source_line: srcLine,
      });
    }
  }

  writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
  process.stderr.write("convex-detector: scanned " + roots.length + " root(s), " + violations.length + " violation(s)\n");
  process.exit(0);
}

main();
