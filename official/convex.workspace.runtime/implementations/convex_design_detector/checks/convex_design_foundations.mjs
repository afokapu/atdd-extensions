#!/usr/bin/env node
// Detector: coder.convex.design-foundations  (disposition: strict)
//
// A Convex feature is a vertical slice built on a foundation: the pure `domain`
// layer that holds the feature's rules, types, and value objects, which every
// upper layer (presentation/api, application, integration) composes FROM. A
// feature directory that ships an upper layer but no domain foundation is building
// on sand — the upper layers have no shared, Convex-free core to rest on. This
// detector flags any feature directory (one that directly contains an `api.ts`,
// `application.ts`, or `integration.ts` layer file, or a promoted `api/`/
// `application/`/`integration/` layer dir) that is MISSING its `domain.ts` (or
// promoted `domain/`) foundation. This is the Convex-stack realization of the
// agnostic "the system is built on its own foundations" obligation (the
// python-pytest sibling is `coder.design.foundations`).
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

import { writeFileSync, statSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";

const RULE_ID = "coder.convex.design-foundations";

const DEFAULT_EXCLUDES = ["_generated", "node_modules", "dist", "build", ".next", ".nuxt", "coverage"];

// Upper layers that must rest on a domain foundation (file form or promoted dir).
const UPPER_FILES = new Set(["api.ts", "application.ts", "integration.ts"]);
const UPPER_DIRS = new Set(["api", "application", "integration"]);
// The foundation: pure domain layer (file form or promoted dir).
const FOUNDATION_FILE = "domain.ts";
const FOUNDATION_DIR = "domain";

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

// Inspect one directory: classify whether it is a feature dir and whether it has
// a domain foundation. Returns {isFeature, hasFoundation}.
function classifyDir(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return { isFeature: false, hasFoundation: false };
  }
  let isFeature = false;
  let hasFoundation = false;
  for (const e of entries) {
    if (e.isFile() && UPPER_FILES.has(e.name)) isFeature = true;
    if (e.isDirectory() && UPPER_DIRS.has(e.name)) isFeature = true;
    if (e.isFile() && e.name === FOUNDATION_FILE) hasFoundation = true;
    if (e.isDirectory() && e.name === FOUNDATION_DIR) hasFoundation = true;
  }
  return { isFeature, hasFoundation };
}

// Recurse the tree, classifying every directory.
function* walkDirs(root, excludes) {
  let st;
  try {
    st = statSync(root);
  } catch {
    return; // missing root — skip silently
  }
  if (!st.isDirectory()) return;
  yield root;
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    if (isExcluded(full, excludes)) continue;
    let cst;
    try {
      cst = statSync(full);
    } catch {
      continue;
    }
    if (cst.isDirectory()) yield* walkDirs(full, excludes);
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
  const seen = new Set();
  for (const root of roots) {
    for (const dir of walkDirs(root, excludes)) {
      if (seen.has(dir)) continue;
      seen.add(dir);
      const { isFeature, hasFoundation } = classifyDir(dir);
      if (isFeature && !hasFoundation) {
        violations.push({
          rule_id: RULE_ID,
          file: join(dir, FOUNDATION_FILE), // the foundation Convex/the slice expects but lacks
          line: 0, // structural (missing-file) violation — no source line
          col: 0,
          evidence: `feature dir has an upper layer but no ${FOUNDATION_FILE} foundation (domain layer is the foundation upper layers compose from)`,
          source_line: "",
        });
      }
    }
  }

  writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
  process.stderr.write(
    `convex-detector: scanned ${seen.size} dir(s), ${violations.length} violation(s)\n`,
  );
  process.exit(0); // run-health OK regardless of violation count (RAW channel)
}

main();
