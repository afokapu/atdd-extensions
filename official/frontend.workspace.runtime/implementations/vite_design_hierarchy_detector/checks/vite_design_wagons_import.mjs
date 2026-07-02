#!/usr/bin/env node
// Detector: coder.vite.design-wagons-import  (disposition: strict)
//
// The design system is wagon-agnostic: feature wagons import FROM the design
// system, never the reverse. A design-system file that reaches into a feature
// wagon (`../../features/checkout/…`, `@/features/…`, `src/play-grid/…`) is a
// leaky abstraction — it couples the shared system to one consumer and makes it
// un-reusable. This detector flags, inside a design-system file, any import
// whose specifier escapes the design-system root into app (non-design) code.
// It is the Vite/TSX realization of the agnostic
// `coder.design.wagons-import-from-design` obligation (DESIGN-HIERARCHY-003;
// principle DS-06; VC-DS-05 `forbid_pattern package:app/((?!design_system)…)`;
// anti-pattern AP-DS-02 "Leaky abstraction").
//
// CONTRACT (frontend.workspace.runtime v1.1): reads ATDD_SCAN_ROOTS /
// ATDD_SCAN_EXCLUDES, writes RAW {rule_id,file,line,col,evidence,source_line}
// violations to ATDD_VIOLATIONS_REPORT, exits 0 regardless of count. Zero deps.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, dirname, extname, sep } from "node:path";

const RULE_ID = "coder.vite.design-wagons-import";

const DEFAULT_EXCLUDES = ["node_modules", "dist", "build", ".next"];
const SCAN_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

const DESIGN_SEG = new Set(["design_system", "design-system", "design"]);
// App-internal alias prefixes (NOT npm scopes). `@/x` / `~/x` / `src/x` address
// the app's own source; `@scope/pkg` is an npm package and is out of scope.
const ALIAS_PREFIXES = ["@/", "~/", "src/"];

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

function underDesign(path) {
  return path.split(/[\\/]/).some((s) => DESIGN_SEG.has(s));
}

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

const FROM_RE = /\bfrom\s+['"]([^'"]+)['"]/;
const DYN_RE = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/;

function specifierOf(line) {
  let m = FROM_RE.exec(line);
  if (m) return { spec: m[1], col: line.indexOf(m[1]) + 1 };
  m = DYN_RE.exec(line);
  if (m) return { spec: m[1], col: line.indexOf(m[1]) + 1 };
  return null;
}

// Returns true when `spec`, imported from a design-system file at `dir`, targets
// a NON-design (feature-wagon) location.
function escapesToWagon(spec, dir) {
  if (spec.startsWith(".")) {
    const resolved = normalize(dir + "/" + spec);
    return !underDesign(resolved); // climbed out of the design-system tree
  }
  const alias = ALIAS_PREFIXES.find((p) => spec.startsWith(p));
  if (alias) {
    const rest = spec.slice(alias.length);
    const first = rest.split("/")[0];
    return !DESIGN_SEG.has(first); // app-internal alias into a non-design area
  }
  return false; // bare/npm import — out of scope
}

function scanFile(file, violations) {
  if (!underDesign(file)) return; // only design-system source is governed here
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
    if (!escapesToWagon(spec, dir)) continue;
    violations.push({
      rule_id: RULE_ID,
      file,
      line: i + 1,
      col,
      evidence: `design-system file imports feature-wagon code (\`${spec}\`); the design system must never import from wagons (DS-06)`,
      source_line: line.trim(),
    });
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
    `vite-detector(design-wagons-import): scanned ${roots.length} root(s), ${violations.length} violation(s)\n`,
  );
  process.exit(0);
}

main();
