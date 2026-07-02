#!/usr/bin/env node
// Detector: coder.vite.design-tokens-pure  (disposition: strict)
//
// Design-system TOKEN files are pure values — spacing, radii, motion, palette
// scales — and must contain NO widgets and NO logic. A token file that pulls in
// `react`, renders JSX, or branches on control flow has stopped being a pure
// value and has become a component/behaviour, breaking the tokens layer at the
// bottom of the hierarchy. This detector flags, inside a design-system token
// file, (a) a `react` import, (b) a JSX element (`</…`, `/>`, or
// `React.createElement`), or (c) a control-flow statement (`if`/`for`/`while`/
// `switch`). It is the Vite/TSX realization of the agnostic
// `coder.design.tokens-are-pure-values` obligation (DESIGN-HIERARCHY-001;
// `layers.tokens.validation` = no_widgets + no_logic).
//
// CONTRACT (frontend.workspace.runtime v1.1): reads ATDD_SCAN_ROOTS /
// ATDD_SCAN_EXCLUDES, writes RAW {rule_id,file,line,col,evidence,source_line}
// violations to ATDD_VIOLATIONS_REPORT, exits 0 regardless of violation count
// (run-health, not a verdict). Zero dependencies, no AST.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, sep } from "node:path";

const RULE_ID = "coder.vite.design-tokens-pure";

const DEFAULT_EXCLUDES = ["node_modules", "dist", "build", ".next"];
const SCAN_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

const DESIGN_SEG = new Set(["design_system", "design-system", "design"]);

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

// A token file lives in the `tokens` layer of a design system: it has a `tokens`
// path segment AND a design-system segment somewhere in its path.
function isTokenFile(path) {
  const segs = path.split(sep);
  return segs.includes("tokens") && segs.some((s) => DESIGN_SEG.has(s));
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

const REACT_IMPORT_RE = /\bfrom\s+['"]react(?:\/[^'"]*)?['"]/;
const JSX_RE = /<\/[A-Za-z]|\/>|React\.createElement/;
const CONTROL_RE = /\b(if|for|while|switch)\s*\(/;

function scanFile(file, violations) {
  if (!isTokenFile(file)) return;
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

    let m;
    if ((m = REACT_IMPORT_RE.exec(line)) !== null) {
      violations.push({
        rule_id: RULE_ID,
        file,
        line: i + 1,
        col: m.index + 1,
        evidence: "token file imports `react`; tokens are pure values (no widgets)",
        source_line: line.trim(),
      });
      continue;
    }
    if ((m = JSX_RE.exec(line)) !== null) {
      violations.push({
        rule_id: RULE_ID,
        file,
        line: i + 1,
        col: m.index + 1,
        evidence: "token file contains a widget/JSX element; tokens must not define widgets",
        source_line: line.trim(),
      });
      continue;
    }
    if ((m = CONTROL_RE.exec(line)) !== null) {
      violations.push({
        rule_id: RULE_ID,
        file,
        line: i + 1,
        col: m.index + 1,
        evidence: `token file contains control-flow logic (\`${m[1]}\`); tokens are pure values (no logic)`,
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
    `vite-detector(design-tokens-pure): scanned ${roots.length} root(s), ${violations.length} violation(s)\n`,
  );
  process.exit(0);
}

main();
