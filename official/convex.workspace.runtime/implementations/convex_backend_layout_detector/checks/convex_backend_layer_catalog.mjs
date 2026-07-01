#!/usr/bin/env node
// Detector: coder.convex.backend-layer-catalog  (disposition: advisory)
//
// Convex realization of core backend.convention.yaml BOUNDARIES-LAYER-001
// ("Backend code is organized into 4 layers: presentation, application,
// integration, domain"). In this architecture the FOUR layers are the only
// canonical *directory* names inside a feature; the many `component_types`
// (controllers, repositories, services, …) are expressed as file SUFFIXES within
// a layer, never as their own directories. So a source module that sits in a
// directory named after a component_type (`.../services/`, `.../controllers/`,
// `.../repositories/`, …) is organized BY COMPONENT TYPE, not by the 4-layer
// catalog — the reader can no longer read the layer off the path. This detector
// flags any source module whose path contains a component-type directory segment.
//
// CONTRACT (convex.workspace.runtime v1.1): reads ATDD_SCAN_ROOTS /
// ATDD_SCAN_EXCLUDES, writes RAW {rule_id,file,line,col,evidence,source_line}
// violations to ATDD_VIOLATIONS_REPORT, exits 0 regardless of violation count
// (run-health, not a verdict). Skips _generated/, node_modules, build dirs, and
// *.test/*.spec files. Zero dependencies, no AST.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, sep } from "node:path";

const RULE_ID = "coder.convex.backend-layer-catalog";
const DEFAULT_EXCLUDES = ["_generated", "node_modules", "dist", "build", ".next"];
const TS_EXT = new Set([".ts", ".tsx", ".js", ".mjs"]);
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

// The four canonical layer directories (backend.layers) — allowed structural dirs.
const CANONICAL_LAYERS = new Set(["presentation", "application", "domain", "integration"]);

// component_type names (from backend.layers.*.component_types) that, when used as
// a DIRECTORY, mean the feature is organized by component-type instead of by layer.
const COMPONENT_TYPE_DIRS = new Set([
  // presentation component types
  "controllers", "routes", "serializers", "validators", "middleware", "guards", "views",
  // application component types
  "use_cases", "usecases", "use-cases", "handlers", "ports", "dtos", "policies", "workflows",
  // domain component types
  "entities", "value_objects", "value-objects", "aggregates", "services", "specifications",
  "events", "exceptions",
  // integration component types
  "repositories", "clients", "caches", "engines", "formatters", "notifiers", "queues",
  "stores", "mappers", "schedulers", "monitors",
]);

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
      const segs = file.split(sep);
      // inspect directory segments only (drop the basename)
      const dirSegs = segs.slice(0, -1);
      for (const seg of dirSegs) {
        if (COMPONENT_TYPE_DIRS.has(seg) && !CANONICAL_LAYERS.has(seg)) {
          violations.push({
            rule_id: RULE_ID,
            file,
            line: 1,
            col: 1,
            evidence: `module organized under component-type directory '${seg}/' instead of one of the 4 canonical layers (presentation/application/domain/integration)`,
            source_line: segs.slice(-2).join("/"),
          });
          break; // one finding per file
        }
      }
    }
  }

  writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
  process.stderr.write("convex-detector: scanned " + roots.length + " root(s), " + violations.length + " violation(s)\n");
  process.exit(0);
}

main();
