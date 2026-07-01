#!/usr/bin/env node
// Detector: coder.convex.backend-suffix-matches  (disposition: advisory)
//
// Convex realization of core backend.convention.yaml BOUNDARIES-LAYER-002
// ("Component file suffix matches its layer's component_type catalog, e.g.
// *-controller.ts for presentation.controllers"). Each component_type in the
// catalog carries a `typescript` suffix and belongs to exactly one layer. A file
// that sits in one canonical layer directory but whose recognized component
// suffix belongs to a DIFFERENT layer (e.g. `order-repository.ts` — an
// integration suffix — placed under `presentation/`) is mis-placed: its filename
// advertises a layer other than the directory it lives in. This detector flags
// each such suffix/layer mismatch.
//
// CONTRACT (convex.workspace.runtime v1.1): reads ATDD_SCAN_ROOTS /
// ATDD_SCAN_EXCLUDES, writes RAW {rule_id,file,line,col,evidence,source_line}
// violations to ATDD_VIOLATIONS_REPORT, exits 0 regardless of violation count.
// Skips _generated/, node_modules, build dirs, and *.test/*.spec files. Zero deps.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, sep, basename } from "node:path";

const RULE_ID = "coder.convex.backend-suffix-matches";
const DEFAULT_EXCLUDES = ["_generated", "node_modules", "dist", "build", ".next"];
const TS_EXT = new Set([".ts", ".tsx", ".js", ".mjs"]);
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

const CANONICAL_LAYERS = ["presentation", "application", "domain", "integration"];

// Recognized TypeScript component suffix -> the single layer that owns it
// (backend.layers.*.component_types[].suffix.typescript). Longest suffixes first
// so `-use-case` wins over any shorter tail.
const SUFFIX_LAYER = [
  // presentation
  ["-controller", "presentation"],
  ["-routes", "presentation"],
  ["-serializer", "presentation"],
  ["-middleware", "presentation"],
  ["-guard", "presentation"],
  ["-view", "presentation"],
  // application
  ["-use-case", "application"],
  ["-handler", "application"],
  ["-port", "application"],
  ["-interface", "application"],
  ["-policy", "application"],
  ["-workflow", "application"],
  ["-saga", "application"],
  // domain
  ["-service", "domain"],
  ["-spec", "domain"],
  ["-event", "domain"],
  ["-exception", "domain"],
  // integration
  ["-repository", "integration"],
  ["-client", "integration"],
  ["-cache", "integration"],
  ["-engine", "integration"],
  ["-analyzer", "integration"],
  ["-formatter", "integration"],
  ["-renderer", "integration"],
  ["-generator", "integration"],
  ["-notifier", "integration"],
  ["-sender", "integration"],
  ["-queue", "integration"],
  ["-publisher", "integration"],
  ["-subscriber", "integration"],
  ["-store", "integration"],
  ["-storage", "integration"],
  ["-mapper", "integration"],
  ["-scheduler", "integration"],
  ["-job", "integration"],
  ["-task", "integration"],
  ["-monitor", "integration"],
  ["-tracker", "integration"],
];

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

// The nearest ancestor directory segment that is a canonical layer, or null.
function layerOf(file) {
  const dirSegs = file.split(sep).slice(0, -1);
  for (let i = dirSegs.length - 1; i >= 0; i--) {
    if (CANONICAL_LAYERS.includes(dirSegs[i])) return dirSegs[i];
  }
  return null;
}
// The component suffix a basename advertises, and its owning layer, or null.
function suffixLayerOf(file) {
  const base = basename(file).replace(/\.(tsx?|m?js)$/, "");
  for (const [suf, layer] of SUFFIX_LAYER) {
    if (base.endsWith(suf)) return { suffix: suf, layer };
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
      const fileLayer = layerOf(file);
      if (!fileLayer) continue; // not inside a canonical layer dir — not this rule's concern
      const sig = suffixLayerOf(file);
      if (!sig) continue; // no recognized component suffix
      if (sig.layer !== fileLayer) {
        violations.push({
          rule_id: RULE_ID,
          file,
          line: 1,
          col: 1,
          evidence: `file suffix '${sig.suffix}' belongs to the ${sig.layer} layer but the file lives under the ${fileLayer}/ layer`,
          source_line: file.split(sep).slice(-2).join("/"),
        });
      }
    }
  }

  writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
  process.stderr.write("convex-detector: scanned " + roots.length + " root(s), " + violations.length + " violation(s)\n");
  process.exit(0);
}

main();
