#!/usr/bin/env node
// Detector: tester.convex.filename-urn  (disposition: documentation-only)
//
// A Vitest test file under the Convex function tree (`convex/**`) must be named so
// it is both (a) collectable by Vitest and (b) derivable from its acceptance URN.
// Two filenames are accepted:
//
//   * URN-named   `{wmbt_lower}-{harness_lower}-{nnn}[-{slug-kebab}].test.ts`
//                 e.g. `e001-unit-001-evaluate-cell.test.ts` (slug optional)
//   * colocated   `{layer}.test.ts` where {layer} is one of the architectural
//                 layers (`domain`/`application`/`presentation`/`integration`/
//                 `composition`/`assembly`/`api`), e.g. `domain.test.ts`.
//
// Any `*.test.ts` / `*.spec.ts` whose basename matches NEITHER pattern is a silent
// green gap — a mis-named test may never be collected, so it "passes" CI by never
// running. This detector flags each such basename. The IDENTITY-from-URN-header
// invariant stays in CORE; only the per-stack FILENAME rendering lives here.
//
// CONTRACT (convex.workspace.runtime v1.1 — the JS sibling of the python-pytest
// provider contract). The provider (adapter/run.py) shells out to `node` over THIS
// file and communicates ONLY through env + a JSON report file:
//
//   INPUT   env ATDD_SCAN_ROOTS     JSON array of dir/file roots to inspect.
//           env ATDD_SCAN_EXCLUDES  JSON array of substring/segment excludes (optional).
//           env ATDD_VIOLATIONS_REPORT  path to write the JSON report to.
//   OUTPUT  {"violations": [{rule_id,file,line,col,evidence,source_line}, ...]}
//
// RAW factual channel only — the detector applies ZERO disposition. For a filename
// rule line/col are 1 and source_line is the basename. It exits 0 even when it
// finds violations (a mis-named test is not a run error); it exits non-zero only on
// a genuine runtime fault.

import { writeFileSync, statSync, readdirSync } from "node:fs";
import { join, basename, sep } from "node:path";

const RULE_ID = "tester.convex.filename-urn";

// Directories/segments never inspected: generated client code, deps, build out.
const DEFAULT_EXCLUDES = ["_generated", "node_modules", "dist", "build", ".next"];

// A file that is plainly a test by extension — `*.test.ts` or `*.spec.ts`.
const TEST_FILE_RE = /\.(test|spec)\.ts$/;

// Closed set of architectural layers a colocated single test file may be named
// after (`domain.test.ts`, `api.test.ts`, ...). Mirrors the harness→layer map of
// the atdd-js filename-ts draft.
const LAYERS = new Set([
  "domain",
  "application",
  "presentation",
  "integration",
  "composition",
  "assembly",
  "api",
]);

// URN-named rendering: `{wmbt_lower}-{harness_lower}-{nnn}[-{slug-kebab}].test.ts`
//   wmbt    one letter + digits  (E001 -> e001)
//   harness lowercase alnum      (UNIT/HTTP/E2E -> unit/http/e2e)
//   nnn     three digits         (001)
//   slug    optional kebab tail  (-evaluate-cell)
const URN_NAME_RE = /^[a-z]\d+-[a-z0-9]+-\d{3}(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?\.test\.ts$/;

// Colocated rendering: `{layer}.test.ts`.
const COLOCATED_RE = /^([a-z0-9]+)\.test\.ts$/;

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
    if (TEST_FILE_RE.test(root)) yield root;
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
    } else if (TEST_FILE_RE.test(full)) {
      yield full;
    }
  }
}

// A test basename is URN-derivable if it is either the URN-named rendering or a
// colocated `{layer}.test.ts` for a known layer.
function isDerivable(base) {
  if (URN_NAME_RE.test(base)) return true;
  const m = COLOCATED_RE.exec(base);
  return m !== null && LAYERS.has(m[1]);
}

function checkFile(file, violations) {
  const base = basename(file);
  if (isDerivable(base)) return;
  violations.push({
    rule_id: RULE_ID,
    file,
    line: 1,
    col: 1,
    evidence:
      `test file basename "${base}" is not URN-derivable ` +
      `(expected {wmbt}-{harness}-{nnn}[-slug].test.ts or {layer}.test.ts)`,
    source_line: base,
  });
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
  for (const root of roots) {
    for (const file of walk(root, excludes)) checkFile(file, violations);
  }

  writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
  process.stderr.write(
    `convex-detector: scanned ${roots.length} root(s), ${violations.length} violation(s)\n`,
  );
  process.exit(0); // run-health OK regardless of violation count (RAW channel)
}

main();
