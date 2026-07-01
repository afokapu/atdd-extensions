#!/usr/bin/env node
// Detector: frontend 4-layer boundaries  (family member emitting 2 rule_ids)
//
//   coder.vite.boundaries-fe-layers   (BOUNDARIES-FE-LAYERS-001, sev 3)
//   coder.vite.boundaries-fe-imports  (BOUNDARIES-FE-IMPORTS-001, sev 3)
//
// Vite/React realization of the agnostic frontend-boundaries obligations owned by the
// coder extension (frontend.convention.yaml::rules, issue #394; the python-pytest
// siblings are coder.frontend.boundaries-fe-layers / -imports). Ports
// src/atdd/coder/validators/test_preact_layer_boundaries.py:
//   LAYERS  — every frontend source module lives under one of the four architecture
//             layers (presentation / application / domain / integration).
//   IMPORTS — imports respect inward dependency direction: domain is
//             framework-agnostic and imports no other layer; presentation does not
//             reach past the application layer into integration.
// (application -> integration IS allowed per frontend.convention.yaml::dependency.)
//
// CONTRACT (frontend.workspace.runtime v1.1): env ATDD_SCAN_ROOTS / ATDD_SCAN_EXCLUDES
// in, {"violations":[...]} to ATDD_VIOLATIONS_REPORT. RAW channel — always exit 0.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, sep, basename } from "node:path";

const RULE_LAYERS = "coder.vite.boundaries-fe-layers";
const RULE_IMPORTS = "coder.vite.boundaries-fe-imports";

const DEFAULT_EXCLUDES = ["node_modules", "dist", "build", ".next"];
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;
const SRC_EXT = new Set([".ts", ".tsx"]);
const LAYERS = ["presentation", "application", "domain", "integration"];

// Root/composition files that legitimately live outside a layer segment.
const ROOT_EXEMPT = new Set([
  "main.tsx", "main.ts", "App.tsx", "app.tsx", "index.ts", "index.tsx",
  "trains.ts", "composition.ts", "vite-env.d.ts",
]);

const FRAMEWORK_IMPORTS = ["preact", "preact/hooks", "preact/compat", "react", "react-dom", "@maintain-ux"];

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
  let st; try { st = statSync(root); } catch { return; }
  if (st.isFile()) { if (SRC_EXT.has(extname(root)) && !TEST_RE.test(root)) yield root; return; }
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    if (isExcluded(full, excludes)) continue;
    let cst; try { cst = statSync(full); } catch { continue; }
    if (cst.isDirectory()) yield* walk(full, excludes);
    else if (SRC_EXT.has(extname(full)) && !TEST_RE.test(full)) yield full;
  }
}

// Portion of a path after the last `/src/` (or the whole path if no src segment).
function afterSrc(path) {
  const p = path.replace(/\\/g, "/");
  const i = p.lastIndexOf("/src/");
  return i >= 0 ? p.slice(i + 5) : p;
}
function layerOf(path) {
  const p = path.replace(/\\/g, "/");
  for (const l of LAYERS) if (p.includes(`/${l}/`)) return l;
  return null;
}
function extractImports(text) {
  const out = [];
  const re = /import\s+[^'"]*?\s+from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(text)) !== null) out.push(m[1] || m[2]);
  return out;
}
function importLine(text, spec) {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) if (lines[i].includes(spec) && /\bimport\b/.test(lines[i])) return i + 1;
  return 1;
}

function scanFile(file, violations) {
  const rel = afterSrc(file);
  const layer = layerOf(file);
  const base = basename(file);

  // ---- LAYERS: source module must live under one of the four layers ----------
  const inSrc = file.replace(/\\/g, "/").includes("/src/");
  const directlyInSrc = inSrc && !rel.includes("/"); // e.g. src/App.tsx
  if (inSrc && layer === null && !directlyInSrc && !ROOT_EXEMPT.has(base) &&
      !base.endsWith(".config.ts") && !base.endsWith(".d.ts")) {
    violations.push({
      rule_id: RULE_LAYERS, file, line: 1, col: 1,
      evidence: `frontend module '${rel}' is not under a recognized architecture layer (presentation/application/domain/integration)`,
      source_line: rel,
    });
  }

  // ---- IMPORTS: inward dependency direction ---------------------------------
  let text; try { text = readFileSync(file, "utf8"); } catch { return; }
  const imports = extractImports(text);

  if (layer === "domain") {
    for (const spec of imports) {
      const framework = FRAMEWORK_IMPORTS.some((f) => spec === f || spec.startsWith(f + "/"));
      const crossLayer = /(^|\/)(application|integration|presentation)(\/|$)/.test(spec) ||
                         /\.\.\/(application|integration|presentation)/.test(spec);
      if (framework || crossLayer) {
        violations.push({
          rule_id: RULE_IMPORTS, file, line: importLine(text, spec), col: 1,
          evidence: `domain module imports '${spec}' — domain must be framework-agnostic and import no other layer`,
          source_line: (text.split(/\r?\n/)[importLine(text, spec) - 1] || "").trim(),
        });
      }
    }
  } else if (layer === "presentation") {
    for (const spec of imports) {
      if (/(^|\/)integration(\/|$)/.test(spec) || /\.\.\/integration/.test(spec)) {
        violations.push({
          rule_id: RULE_IMPORTS, file, line: importLine(text, spec), col: 1,
          evidence: `presentation module imports integration layer ('${spec}') — go through the application layer, not APIs directly`,
          source_line: (text.split(/\r?\n/)[importLine(text, spec) - 1] || "").trim(),
        });
      }
    }
  }
}

function main() {
  const reportPath = process.env.ATDD_VIOLATIONS_REPORT;
  if (!reportPath) { process.stderr.write("boundaries-fe: ATDD_VIOLATIONS_REPORT not set\n"); process.exit(2); }
  const roots = parseJsonEnv("ATDD_SCAN_ROOTS", []);
  const excludes = [...DEFAULT_EXCLUDES, ...parseJsonEnv("ATDD_SCAN_EXCLUDES", [])];
  const violations = [];
  for (const root of roots) for (const file of walk(root, excludes)) scanFile(file, violations);
  writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
  process.stderr.write(`boundaries-fe: ${violations.length} violation(s)\n`);
  process.exit(0);
}
main();
