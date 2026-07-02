#!/usr/bin/env node
// Detector: coder.vite.design-dependency-flow  (disposition: strict)
//
// The design-system hierarchy has a single dependency direction — tokens <-
// primitives <- components <- templates — so lower layers never learn about
// higher ones. A file in one layer may import only from its own layer or a
// LOWER one; an import that reaches UP/OUT (tokens -> primitives, primitives ->
// components, components -> templates) inverts the hierarchy. This detector
// classifies each design-system file to a layer rank, resolves each relative
// import to a target layer, and flags every edge to a higher rank. It is the
// Vite/TSX realization of the agnostic
// `coder.design.dependency-flow-tokens-primitives` obligation
// (DESIGN-HIERARCHY-002; `dependency_rules.forbidden_edges`; VC-DS-03/04). It is
// the frontend sibling of the already-built convex `design-hierarchy-import`
// (a DISTINCT core rule_id).
//
// CONTRACT (frontend.workspace.runtime v1.1): reads ATDD_SCAN_ROOTS /
// ATDD_SCAN_EXCLUDES, writes RAW {rule_id,file,line,col,evidence,source_line}
// violations to ATDD_VIOLATIONS_REPORT, exits 0 regardless of count. Zero deps.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, dirname, extname, sep } from "node:path";

const RULE_ID = "coder.vite.design-dependency-flow";

const DEFAULT_EXCLUDES = ["node_modules", "dist", "build", ".next"];
const SCAN_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

const DESIGN_SEG = new Set(["design_system", "design-system", "design"]);
// Layer ranks: lower rank = deeper/purer. An import may target its own rank or a
// LOWER rank; a target of HIGHER rank is an upward/outward edge (forbidden).
const RANK = { tokens: 0, primitives: 1, components: 2, templates: 3 };

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

function isComment(line) {
  const t = line.trim();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
}

// Layer of a path = the first recognized layer segment that sits under a design
// segment (or anywhere, if no design segment is present in the path).
function layerOf(path) {
  const segs = path.split(sep);
  for (const s of segs) {
    if (RANK[s] !== undefined) return s;
  }
  return null;
}

// Normalize a POSIX-ish path with `.`/`..` segments resolved.
function normalize(path) {
  const out = [];
  for (const s of path.split("/")) {
    if (s === "" || s === ".") continue;
    if (s === "..") { if (out.length && out[out.length - 1] !== "..") out.pop(); else out.push(".."); }
    else out.push(s);
  }
  return out.join("/");
}

function* walk(root, excludes) {
  let st;
  try {
    st = statSync(root);
  } catch {
    return;
  }
  if (st.isFile()) {
    if (SCAN_EXT.has(extname(root)) && !TEST_RE.test(root)) yield root;
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
    } else if (extname(full) === ".astro") {
      continue; // SELF-SCOPING: never lint an Astro-stack `.astro` file (see header)
    } else if (SCAN_EXT.has(extname(full)) && !TEST_RE.test(full)) {
      yield full;
    }
  }
}

// import/export ... from '...'  and  import('...')
const FROM_RE = /\bfrom\s+['"]([^'"]+)['"]/;
const DYN_RE = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/;

function specifierOf(line) {
  let m = FROM_RE.exec(line);
  if (m) return { spec: m[1], col: line.indexOf(m[1]) + 1 };
  m = DYN_RE.exec(line);
  if (m) return { spec: m[1], col: line.indexOf(m[1]) + 1 };
  return null;
}

function scanFile(file, violations) {
  const srcLayer = layerOf(file);
  if (srcLayer === null) return; // not a design-system layer file
  const srcRank = RANK[srcLayer];
  const dir = dirname(file).split(sep).join("/");

  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return;
  }
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isComment(line)) continue;
    const hit = specifierOf(line);
    if (!hit) continue;
    const { spec, col } = hit;
    if (!spec.startsWith(".")) continue; // only intra-tree relative edges here
    const resolved = normalize(dir + "/" + spec);
    const tgtLayer = layerOf(resolved.split("/").join(sep));
    if (tgtLayer === null) continue; // target not a design layer (handled elsewhere)
    const tgtRank = RANK[tgtLayer];
    if (tgtRank > srcRank) {
      violations.push({
        rule_id: RULE_ID,
        file,
        line: i + 1,
        col,
        evidence: `${srcLayer} imports ${tgtLayer} (\`${spec}\`); dependency flow is inward only (tokens <- primitives <- components <- templates)`,
        source_line: line.trim(),
      });
    }
  }
}

function main() {
  const reportPath = process.env.ATDD_VIOLATIONS_REPORT;
  if (!reportPath) {
    process.stderr.write("vite-detector: ATDD_VIOLATIONS_REPORT not set\n");
    process.exit(2);
  }
  const roots = parseJsonEnv("ATDD_SCAN_ROOTS", []);
  const excludes = [...DEFAULT_EXCLUDES, ...parseJsonEnv("ATDD_SCAN_EXCLUDES", [])];

  // ── Design-layer scope gate (mirrors the interlocking/train-e2e no-op) ───────
  // This rule PRESUPPOSES a design system. On a codebase with NO design layer at
  // all (e.g. the FRG consumer, which has real component/feature code but no design
  // system), the rule is OUT OF SCOPE — not a clean pass hiding violations. Exactly
  // like train_e2e_coverage / interlocking_e2e_coverage no-op when their plan
  // registry is absent, this writes an empty report and exits 0 when no design layer
  // is present. "Design layer present" is determined STRUCTURALLY from the scanned
  // roots: a design / design_system / design-system (or tokens / foundations /
  // primitives) directory, OR a design-token/foundations source file
  // (tokens|foundations|theme(.ts) / *.tokens.* / _design.yaml / design.manifest.*).
  const DESIGN_DIRS = new Set([
    "design", "design_system", "design-system", "tokens", "foundations", "primitives",
  ]);
  const DESIGN_FILE_RE =
    /^(tokens|foundations|theme)\.[cm]?[jt]sx?$|\.tokens\.[cm]?[jt]sx?$|^_design\.ya?ml$|^design\.manifest\./i;
  function hasDesignLayer(scanRoots) {
    const stack = [...scanRoots];
    const seenPaths = new Set();
    while (stack.length) {
      const cur = stack.pop();
      if (seenPaths.has(cur)) continue;
      seenPaths.add(cur);
      let cst;
      try { cst = statSync(cur); } catch { continue; }
      const name = cur.split(sep).pop();
      if (cst.isDirectory()) {
        if (DESIGN_DIRS.has(name)) return true;
        let entries;
        try { entries = readdirSync(cur); } catch { continue; }
        for (const e of entries) {
          const full = join(cur, e);
          if (isExcluded(full, excludes)) continue;
          stack.push(full);
        }
      } else if (DESIGN_FILE_RE.test(name)) {
        return true;
      }
    }
    return false;
  }
  if (!hasDesignLayer(roots)) {
    writeFileSync(reportPath, JSON.stringify({ violations: [] }, null, 2), "utf8");
    process.stderr.write(`${RULE_ID}: no design layer in scan roots — out of scope\n`);
    process.exit(0);
  }

  const violations = [];
  for (const root of roots) {
    for (const file of walk(root, excludes)) scanFile(file, violations);
  }

  writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
  process.stderr.write(
    `vite-detector(design-dependency-flow): scanned ${roots.length} root(s), ${violations.length} violation(s)\n`,
  );
  process.exit(0);
}

main();
