#!/usr/bin/env node
// Detector: coder.convex.dto-placement  (disposition: advisory)
//
// Convex realization of core dto.convention.yaml DTO-PLACEMENT-001 ("DTOs live in
// contract_dto modules and are derived from contracts"). The TypeScript variant
// fixes the location as `ts/contracts/{theme}/{domain}/{resource}.ts` with naming
// `{Resource}DTO`, and enforcement demands DTOs live in the "neutral contracts/
// namespace". A `*DTO` type declared OUTSIDE a `contracts/` module is mis-placed:
// it is a cross-boundary data type living inside a wagon's internal layer rather
// than in the shared contract surface. This detector flags every exported/plain
// `interface|type <Name>DTO` declaration whose file path has no `contracts`
// segment, at the declaration line.
//
// CONTRACT (convex.workspace.runtime v1.1): reads ATDD_SCAN_ROOTS /
// ATDD_SCAN_EXCLUDES, writes RAW {rule_id,file,line,col,evidence,source_line}
// violations to ATDD_VIOLATIONS_REPORT, exits 0 regardless of violation count.
// Skips _generated/, node_modules, build dirs, and *.test/*.spec files. Zero deps.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, sep } from "node:path";

const RULE_ID = "coder.convex.dto-placement";
const DEFAULT_EXCLUDES = ["_generated", "node_modules", "dist", "build", ".next"];
const TS_EXT = new Set([".ts", ".tsx", ".js", ".mjs"]);
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

// `interface XxxDTO` / `type XxxDTO =` — the DTO naming convention ({Resource}DTO).
const DTO_DECL_RE = /\b(?:export\s+)?(?:interface|type)\s+([A-Za-z_$][\w$]*DTO)\b/;

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
function inContractsModule(file) {
  return file.split(sep).includes("contracts");
}

function main() {
  const reportPath = process.env.ATDD_VIOLATIONS_REPORT;
  if (!reportPath) { process.stderr.write("convex-detector: ATDD_VIOLATIONS_REPORT not set\n"); process.exit(2); }
  const roots = parseJsonEnv("ATDD_SCAN_ROOTS", []);
  const excludes = [...DEFAULT_EXCLUDES, ...parseJsonEnv("ATDD_SCAN_EXCLUDES", [])];

  const violations = [];
  for (const root of roots) {
    for (const file of walk(root, excludes)) {
      if (inContractsModule(file)) continue; // DTOs belong here — nothing to flag
      let text;
      try { text = readFileSync(file, "utf8"); } catch { continue; }
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const m = DTO_DECL_RE.exec(lines[i]);
        if (!m) continue;
        violations.push({
          rule_id: RULE_ID,
          file,
          line: i + 1,
          col: m.index + 1,
          evidence: `DTO type '${m[1]}' declared outside a contracts/ module (DTOs must live in the neutral contracts namespace)`,
          source_line: lines[i].trim(),
        });
      }
    }
  }

  writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
  process.stderr.write("convex-detector: scanned " + roots.length + " root(s), " + violations.length + " violation(s)\n");
  process.exit(0);
}

main();
