#!/usr/bin/env node
// Detector: coder.convex.design-orphan-export  (disposition: strict)
//
// Every symbol a Convex module exports MUST either be a Convex API entry point
// (an export wired to `query`/`mutation`/`action`/`internal*`/`httpAction`/
// `httpRouter`/`cronJobs`, or a `default` export like the schema — Convex consumes
// these via the runtime and the generated client, not via a source import) OR be
// imported by at least one other module. An exported symbol that is neither is an
// ORPHAN: dead surface area that grows the bundle and the maintenance burden
// without a consumer. This detector reads every file's exports and every file's
// named imports across the scan, then flags each non-entry export whose name no
// importer references. This is the Convex-stack realization of the agnostic "no
// dead exports" obligation (the python-pytest sibling is
// `coder.design.orphan-export`).
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
import { join, extname, sep, basename } from "node:path";

const RULE_ID = "coder.convex.design-orphan-export";

const DEFAULT_EXCLUDES = ["_generated", "node_modules", "dist", "build", ".next", ".nuxt", "coverage"];
const TS_EXT = new Set([".ts", ".tsx"]);
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;
const BARREL_RE = /^index\.[cm]?[jt]sx?$/;

// An export wired to one of these is a Convex auto-discovered API entry → consumed
// by the runtime/client, never an orphan.
const CONVEX_ENTRY_RE =
  /\b(query|mutation|action|internalQuery|internalMutation|internalAction|httpAction|httpRouter|cronJobs)\s*\(/;

// Export declaration forms (one captured name each).
const EXPORT_DECL_RES = [
  /^\s*export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/,
  /^\s*export\s+(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/,
  /^\s*export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/,
  /^\s*export\s+(?:interface|type|enum)\s+([A-Za-z_$][\w$]*)/,
];

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

// Collect every name imported by a file (named + default + re-export-from).
function collectImportedNames(text, into) {
  // import { A, B as C } from '...'  /  export { A } from '...' (re-export)
  const braceRe = /(?:import|export)\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"][^'"]+['"]/g;
  let m;
  while ((m = braceRe.exec(text)) !== null) {
    for (const part of m[1].split(",")) {
      const name = part.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim();
      if (name) into.add(name);
    }
  }
  // default / namespace import: import Foo from '...'  /  import Foo, { ... } from '...'
  const defRe = /\bimport\s+(?:type\s+)?([A-Za-z_$][\w$]*)\s*(?:,\s*\{[^}]*\})?\s*from\s*['"][^'"]+['"]/g;
  while ((m = defRe.exec(text)) !== null) into.add(m[1]);
}

function main() {
  const reportPath = process.env.ATDD_VIOLATIONS_REPORT;
  if (!reportPath) {
    process.stderr.write("convex-detector: ATDD_VIOLATIONS_REPORT not set\n");
    process.exit(2);
  }
  const roots = parseJsonEnv("ATDD_SCAN_ROOTS", []);
  const excludes = [...DEFAULT_EXCLUDES, ...parseJsonEnv("ATDD_SCAN_EXCLUDES", [])];

  // 1. Collect files (dedup, deterministic).
  const files = [];
  const seen = new Set();
  for (const root of roots) {
    for (const f of walk(root, excludes)) {
      if (!seen.has(f)) {
        seen.add(f);
        files.push(f);
      }
    }
  }
  files.sort();

  // 2. Gather all imported names + all exports across the scan.
  const importedNames = new Set();
  const exports = []; // {name, file, line, isEntry, source}
  const texts = new Map();
  for (const f of files) {
    let text = "";
    try {
      text = readFileSync(f, "utf8");
    } catch {
      text = "";
    }
    texts.set(f, text);
    collectImportedNames(text, importedNames);
  }
  for (const f of files) {
    if (BARREL_RE.test(basename(f))) continue; // barrels re-export; not checked for orphans
    const lines = texts.get(f).split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const re of EXPORT_DECL_RES) {
        const m = re.exec(line);
        if (m) {
          exports.push({
            name: m[1],
            file: f,
            line: i + 1,
            col: line.indexOf("export") + 1,
            isEntry: CONVEX_ENTRY_RE.test(line),
            source: line.trim(),
          });
          break; // one declaration per line
        }
      }
    }
  }

  // 3. A non-entry export no importer references is an orphan.
  const violations = [];
  for (const ex of exports) {
    if (ex.isEntry) continue; // Convex API entry — consumed by runtime/client
    if (importedNames.has(ex.name)) continue; // has a consumer
    violations.push({
      rule_id: RULE_ID,
      file: ex.file,
      line: ex.line,
      col: ex.col,
      evidence: `exported '${ex.name}' is imported by no module and is not a Convex API entry (orphan export)`,
      source_line: ex.source,
    });
  }

  writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
  process.stderr.write(
    `convex-detector: scanned ${files.length} file(s), ${violations.length} violation(s)\n`,
  );
  process.exit(0); // run-health OK regardless of violation count (RAW channel)
}

main();
