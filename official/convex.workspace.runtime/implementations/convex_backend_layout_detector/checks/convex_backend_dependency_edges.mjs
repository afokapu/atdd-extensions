#!/usr/bin/env node
// Detector: coder.convex.backend-dependency-edges  (disposition: advisory)
//
// Convex realization of core backend.convention.yaml BOUNDARIES-LAYER-003
// ("Imports respect dependency.allowed_edges"). The allowed layer graph is:
//   presentation -> {application, domain}
//   application  -> {domain}
//   integration  -> {application, domain}
//   domain       -> {}                     (domain imports no other layer)
// (same-layer imports are always allowed). A module in layer S that imports a
// module resolving into a sibling layer T where the edge S->T is NOT in the
// allowed set — e.g. a `domain/` module importing from `../application/…`, or a
// `presentation/` module reaching into `../integration/…` (bypassing application)
// — inverts the dependency direction and couples the layers. This detector reads
// the importing file's layer from its path and each import specifier's target
// layer from its path segments, flagging every disallowed edge at the import line.
//
// CONTRACT (convex.workspace.runtime v1.1): reads ATDD_SCAN_ROOTS /
// ATDD_SCAN_EXCLUDES, writes RAW {rule_id,file,line,col,evidence,source_line}
// violations to ATDD_VIOLATIONS_REPORT, exits 0 regardless of violation count.
// Skips _generated/, node_modules, build dirs, and *.test/*.spec files. Zero deps.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, sep } from "node:path";

const RULE_ID = "coder.convex.backend-dependency-edges";
const DEFAULT_EXCLUDES = ["_generated", "node_modules", "dist", "build", ".next"];
const TS_EXT = new Set([".ts", ".tsx", ".js", ".mjs"]);
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

const CANONICAL_LAYERS = ["presentation", "application", "domain", "integration"];
const ALLOWED = {
  presentation: new Set(["application", "domain"]),
  application: new Set(["domain"]),
  integration: new Set(["application", "domain"]),
  domain: new Set([]),
};

// import ... from '<spec>'  |  export ... from '<spec>'  |  import '<spec>'
// |  require('<spec>')  |  import('<spec>')  — capture the quoted specifier.
const IMPORT_RE =
  /(?:\bimport\b[^'"]*?\bfrom\s*|\bexport\b[^'"]*?\bfrom\s*|\bimport\s*|\brequire\s*\(\s*|\bimport\s*\(\s*)['"]([^'"]+)['"]/g;

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
function fileLayerOf(file) {
  const dirSegs = file.split(sep).slice(0, -1);
  for (let i = dirSegs.length - 1; i >= 0; i--) {
    if (CANONICAL_LAYERS.includes(dirSegs[i])) return dirSegs[i];
  }
  return null;
}
// target layer named by an import specifier: the LAST canonical-layer path segment.
function specLayerOf(spec) {
  const segs = spec.split(/[\\/]/);
  for (let i = segs.length - 1; i >= 0; i--) {
    if (CANONICAL_LAYERS.includes(segs[i])) return segs[i];
  }
  return null;
}

function main() {
  const reportPath = process.env.ATDD_VIOLATIONS_REPORT;
  if (!reportPath) { process.stderr.write("convex-detector: ATDD_VIOLATIONS_REPORT not set\n"); process.exit(2); }
  const roots = parseJsonEnv("ATDD_SCAN_ROOTS", []);
  const excludes = [...DEFAULT_EXCLUDES, ...parseJsonEnv("ATDD_SCAN_EXCLUDES", [])];

  const violations = [];
  for (const root of roots) {
    for (const file of walk(root, excludes)) {
      const src = fileLayerOf(file);
      if (!src) continue; // importing file not inside a canonical layer — skip
      let text;
      try { text = readFileSync(file, "utf8"); } catch { continue; }
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        IMPORT_RE.lastIndex = 0;
        let m;
        while ((m = IMPORT_RE.exec(line)) !== null) {
          const target = specLayerOf(m[1]);
          if (!target || target === src) continue; // unknown or same-layer — allowed
          if (!ALLOWED[src].has(target)) {
            violations.push({
              rule_id: RULE_ID,
              file,
              line: i + 1,
              col: m.index + 1,
              evidence: `disallowed layer dependency ${src} -> ${target} (allowed from ${src}: ${[...ALLOWED[src]].join(", ") || "<none>"})`,
              source_line: line.trim(),
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
