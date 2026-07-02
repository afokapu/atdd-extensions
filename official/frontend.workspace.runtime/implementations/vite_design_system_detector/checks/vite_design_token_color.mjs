#!/usr/bin/env node
// Detector: coder.vite.design-token-color  (disposition: strict)
//
// A color-bearing style property in app code must reference a design token / theme
// value, not a raw inline color literal. When a `*.tsx` style object sets `color`,
// `backgroundColor`, `borderColor`, `fill`, `stroke`, or `outlineColor` to a string
// literal (a named color like `'tomato'` or a hex like `'#3a7bd5'`), the palette
// forks away from the centralized theme. This detector flags each such site.
//
// CONTRACT (frontend.workspace.runtime v1.1 — the JS sibling of the
// python-pytest provider contract). The provider (adapter/run.py) shells out to
// `node` over THIS file and communicates ONLY through env + a JSON report file:
//
//   INPUT   env ATDD_SCAN_ROOTS     JSON array of dir/file roots to inspect.
//           env ATDD_SCAN_EXCLUDES  JSON array of substring/segment excludes (optional).
//           env ATDD_VIOLATIONS_REPORT  path to write the JSON report to.
//   OUTPUT  {"violations": [{rule_id,file,line,col,evidence,source_line}, ...]}
//
// RAW factual channel only — the detector applies ZERO disposition. It exits 0
// even when it finds violations; it exits non-zero only on a genuine runtime fault.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, sep } from "node:path";

const RULE_ID = "coder.vite.design-token-color";

const DEFAULT_EXCLUDES = ["node_modules", "dist", "build", ".next"];
const TSX_EXT = new Set([".tsx"]);
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

// A color-bearing style property assigned to a STRING LITERAL (single/double/
// backtick). A token reference (`colors.primary`) is not a string literal, so it
// is not matched. Captures the property and the literal value.
const COLOR_PROP_RE =
  /\b(color|backgroundColor|borderColor|outlineColor|fill|stroke)\s*:\s*(['"`])([^'"`]+)\2/g;

// Literal values that are NOT a forked palette color — keywords and CSS vars.
const ALLOWED = new Set([
  "transparent", "inherit", "currentcolor", "none", "unset", "initial", "revert",
]);
const VAR_RE = /^var\(\s*--/;

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

function* walk(root, excludes) {
  let st;
  try {
    st = statSync(root);
  } catch {
    return; // missing root — skip silently; a missing scan root is not a fault
  }
  if (st.isFile()) {
    if (TSX_EXT.has(extname(root)) && !TEST_RE.test(root)) yield root;
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
    } else if (TSX_EXT.has(extname(full)) && !TEST_RE.test(full)) {
      yield full;
    }
  }
}

function scanFile(file, violations) {
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
    COLOR_PROP_RE.lastIndex = 0;
    let m;
    while ((m = COLOR_PROP_RE.exec(line)) !== null) {
      const prop = m[1];
      const value = m[3].trim();
      const norm = value.toLowerCase();
      if (ALLOWED.has(norm) || VAR_RE.test(norm)) continue;
      violations.push({
        rule_id: RULE_ID,
        file,
        line: i + 1,
        col: m.index + 1,
        evidence: `${prop} set to color literal '${value}' instead of a design-token reference`,
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
    `vite-detector(design-token-color): scanned ${roots.length} root(s), ${violations.length} violation(s)\n`,
  );
  process.exit(0); // run-health OK regardless of violation count (RAW channel)
}

main();
