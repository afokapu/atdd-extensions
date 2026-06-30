#!/usr/bin/env node
// Detector: coder.convex.design-hierarchy-import  (disposition: strict)
//
// A Convex feature is a layered hierarchy whose dependencies flow INWARD only:
// presentation (`api.ts`) -> application -> domain, and integration -> application
// /domain, with the composition root free to reach anything. The domain
// foundation is pure: it imports NOTHING upward or outward. This detector flags
// any relative import whose direction violates that order — e.g. `domain.ts`
// importing `./application`, `application.ts` importing `./api` or `./integration`,
// or `api.ts` importing `./integration` (presentation must go through application).
// This is the Convex-stack realization of the agnostic "layers import only inward"
// obligation (the python-pytest sibling is `coder.design.hierarchy-import`).
//
// CONTRACT (convex.workspace.runtime v1.1 — the JS sibling of the python-pytest
// provider contract). The provider (adapter/run.py) shells out to `node` over
// THIS file and communicates ONLY through env + a JSON report file:
//
//   INPUT   env ATDD_SCAN_ROOTS     JSON array of dir/file roots to inspect.
//           env ATDD_SCAN_EXCLUDES  JSON array of substring/segment excludes (optional).
//           env ATDD_VIOLATIONS_REPORT  path to write the JSON report to.
//   OUTPUT  {"violations": [{rule_id,file,line,col,evidence,source_line}, ...]}
//
// RAW factual channel only — the detector applies ZERO disposition. It exits 0
// even when it finds violations (finding violations is not a run error); it exits
// non-zero only on a genuine runtime fault.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, sep, dirname, resolve, basename } from "node:path";

const RULE_ID = "coder.convex.design-hierarchy-import";

const DEFAULT_EXCLUDES = ["_generated", "node_modules", "dist", "build", ".next", ".nuxt", "coverage"];
const TS_EXT = new Set([".ts", ".tsx"]);
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

// Inward dependency direction (allowed target layers per source layer). Same-layer
// is always allowed. Anything else is an upward/outward edge.
const ALLOWED = {
  presentation: new Set(["presentation", "application", "domain"]),
  application: new Set(["application", "domain"]),
  integration: new Set(["integration", "application", "domain"]),
  composition: new Set(["composition", "presentation", "application", "domain", "integration"]),
  domain: new Set(["domain"]),
};

// Map a canonical layer name from a basename-without-extension or a dir segment.
function layerOfToken(tok) {
  switch (tok) {
    case "api":
      return "presentation";
    case "application":
      return "application";
    case "domain":
      return "domain";
    case "integration":
      return "integration";
    case "composition":
    case "wagon":
      return "composition";
    default:
      return null;
  }
}

// Classify a file path to a layer: prefer its basename, then any path segment.
function classifyPath(p) {
  const baseNoExt = basename(p).replace(/\.[cm]?[jt]sx?$/, "");
  const byBase = layerOfToken(baseNoExt);
  if (byBase) return byBase;
  for (const seg of p.split(sep)) {
    const l = layerOfToken(seg);
    if (l) return l;
  }
  return null;
}

// Classify an import specifier (the quoted module path) to a layer.
function classifySpec(spec) {
  const parts = spec.split("/");
  const last = parts[parts.length - 1].replace(/\.[cm]?[jt]sx?$/, "");
  const byLast = layerOfToken(last);
  if (byLast) return byLast;
  for (const seg of parts) {
    const l = layerOfToken(seg);
    if (l) return l;
  }
  return null;
}

const SPEC_RE = /\bfrom\s*['"]([^'"]+)['"]/g;
const SIDE_IMPORT_RE = /\bimport\s*['"]([^'"]+)['"]/g;

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
    if (cst.isDirectory()) yield* walk(full, excludes);
    else if (TS_EXT.has(extname(full)) && !TEST_RE.test(full)) yield full;
  }
}

// Resolve a relative spec against fromDir to classify the concrete target file when
// possible; falls back to classifying the spec string directly.
function targetLayer(fromDir, spec) {
  if (spec.startsWith(".")) {
    const resolved = resolve(fromDir, spec);
    const byResolved = classifyPath(resolved);
    if (byResolved) return byResolved;
  }
  return classifySpec(spec);
}

function scanFile(file, violations) {
  const sourceLayer = classifyPath(file);
  if (!sourceLayer || !ALLOWED[sourceLayer]) return; // unclassifiable source — skip
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return;
  }
  const lines = text.split(/\r?\n/);
  const fromDir = dirname(file);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const re of [SPEC_RE, SIDE_IMPORT_RE]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line)) !== null) {
        const spec = m[1];
        if (!spec.startsWith(".")) continue; // external/npm import — outside the hierarchy
        const tl = targetLayer(fromDir, spec);
        if (!tl) continue; // import to an unclassifiable module — not a layer edge
        if (ALLOWED[sourceLayer].has(tl)) continue; // inward (or same-layer) — allowed
        violations.push({
          rule_id: RULE_ID,
          file,
          line: i + 1,
          col: m.index + 1,
          evidence: `${sourceLayer} layer imports ${tl} layer (violates inward dependency direction)`,
          source_line: line.trim(),
        });
      }
    }
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
  let count = 0;
  for (const root of roots) {
    for (const file of walk(root, excludes)) {
      count++;
      scanFile(file, violations);
    }
  }

  writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
  process.stderr.write(
    `convex-detector: scanned ${count} file(s), ${violations.length} violation(s)\n`,
  );
  process.exit(0); // run-health OK regardless of violation count (RAW channel)
}

main();
