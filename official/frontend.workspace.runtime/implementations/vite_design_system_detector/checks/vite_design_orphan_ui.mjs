#!/usr/bin/env node
// Detector: coder.vite.design-orphan-ui  (disposition: strict)
//
// An exported React component that nothing in the codebase ever imports is dead
// UI — disconnected from the rendered surface, untested in situ, and a drift
// hazard. This detector flags every PascalCase React component exported from a
// `*.tsx` file whose name is never imported by any other scanned file.
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

const RULE_ID = "coder.vite.design-orphan-ui";

const DEFAULT_EXCLUDES = ["node_modules", "dist", "build", ".next"];
// Imports are gathered from .ts and .tsx; exported components only from .tsx.
const IMPORT_EXT = new Set([".ts", ".tsx"]);
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

// Exported PascalCase declarations (a React component, by convention).
const EXPORT_FN_RE = /\bexport\s+(?:default\s+)?(?:async\s+)?function\s+([A-Z][A-Za-z0-9_]*)/;
const EXPORT_CONST_RE = /\bexport\s+const\s+([A-Z][A-Za-z0-9_]*)\s*[:=]/;

// Import specifiers — default, namespace, and named (both sides of `as`).
const IMPORT_RE = /\bimport\s+([^'";]+?)\s+from\s*['"][^'"]+['"]/g;

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
    return; // missing root — skip silently; a missing scan root is not a fault
  }
  if (st.isFile()) {
    if (IMPORT_EXT.has(extname(root)) && !TEST_RE.test(root)) yield root;
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
    } else if (IMPORT_EXT.has(extname(full)) && !TEST_RE.test(full)) {
      yield full;
    }
  }
}

// Collect every identifier any import statement brings into scope (default,
// namespace, and named — including the original name on either side of `as`).
function collectImportedNames(text, names) {
  IMPORT_RE.lastIndex = 0;
  let m;
  while ((m = IMPORT_RE.exec(text)) !== null) {
    const clause = m[1];
    const brace = clause.match(/\{([^}]*)\}/);
    if (brace) {
      for (const part of brace[1].split(",")) {
        for (const id of part.split(/\s+as\s+/)) {
          const t = id.trim();
          if (t) names.add(t);
        }
      }
    }
    // default / namespace specifiers (the portion before any `{`)
    const head = clause.replace(/\{[^}]*\}/, "").replace(/,/g, " ");
    for (const tok of head.split(/\s+/)) {
      const t = tok.replace(/^\*/, "").replace(/^as$/, "").trim();
      if (t && t !== "as" && t !== "type") names.add(t);
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

  const files = [];
  for (const root of roots) for (const f of walk(root, excludes)) files.push(f);

  // Pass 1: every imported identifier across the whole scan set.
  const imported = new Set();
  const contents = new Map();
  for (const file of files) {
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    contents.set(file, text);
    collectImportedNames(text, imported);
  }

  // Pass 2: each exported PascalCase component in a .tsx file that no file imports.
  const violations = [];
  for (const file of files) {
    if (extname(file) !== ".tsx") continue;
    const text = contents.get(file);
    if (text === undefined) continue;
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const m = EXPORT_FN_RE.exec(line) || EXPORT_CONST_RE.exec(line);
      if (!m) continue;
      const name = m[1];
      if (imported.has(name)) continue;
      violations.push({
        rule_id: RULE_ID,
        file,
        line: i + 1,
        col: line.indexOf(name) + 1,
        evidence: `exported component ${name} is never imported anywhere (orphan UI)`,
        source_line: line.trim(),
      });
    }
  }

  writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
  process.stderr.write(
    `vite-detector(design-orphan-ui): scanned ${files.length} file(s), ${violations.length} violation(s)\n`,
  );
  process.exit(0); // run-health OK regardless of violation count (RAW channel)
}

main();
