#!/usr/bin/env node
// Detector: coder.convex.dead-code-reachability  (disposition: strict)
//
// Every production TypeScript module under a convex/ function tree MUST be
// reachable from at least one GRAPH ROOT by following the static import graph.
// For Convex the roots are the modules the runtime/client anchor on: `schema.ts`
// (auto-loaded), `http.ts` (auto-loaded HTTP router), an `index.ts`/`index.tsx`
// barrel, a test file, OR any module that exports a Convex function
// (`query`/`mutation`/`action`/`internal*`/`httpAction` — Convex auto-discovers
// these as API entry points). A `*.ts` that no root transitively imports is dead
// code: it inflates the deploy surface with no caller. This is the Convex-stack
// realization of the agnostic "all production source is reachable from an entry
// point" obligation (the python-pytest sibling is
// `coder.dead-code.reachability-typescript`).
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

const RULE_ID = "coder.convex.dead-code-reachability";

const DEFAULT_EXCLUDES = ["_generated", "node_modules", "dist", "build", ".next", ".nuxt", "coverage"];
const TS_EXT = new Set([".ts", ".tsx"]);
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

// A module that exports a Convex function is an auto-discovered API entry → a root.
const CONVEX_ENTRY_RE =
  /\b(query|mutation|action|internalQuery|internalMutation|internalAction|httpAction)\s*\(/;
// Basenames Convex/the bundler anchor on directly (always roots).
const ROOT_BASENAMES = new Set([
  "schema.ts",
  "http.ts",
  "index.ts",
  "index.tsx",
  "crons.ts",
  "auth.config.ts",
]);

// Quoted module specifiers following import/export-from/dynamic-import/require.
const SPEC_RES = [
  /\bfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\bimport\s*['"]([^'"]+)['"]/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
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
    return; // missing root — skip silently
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

// Collect relative module specifiers (`./x`, `../y`) from a file's source.
function relativeSpecifiers(text) {
  const specs = [];
  for (const re of SPEC_RES) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m[1].startsWith(".")) specs.push(m[1]);
    }
  }
  return specs;
}

// Resolve a relative specifier from `fromDir` to a concrete file in `fileSet`.
function resolveSpec(fromDir, spec, fileSet) {
  const base = resolve(fromDir, spec);
  const candidates = [
    base,
    base + ".ts",
    base + ".tsx",
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ];
  for (const c of candidates) if (fileSet.has(c)) return c;
  return null;
}

function main() {
  const reportPath = process.env.ATDD_VIOLATIONS_REPORT;
  if (!reportPath) {
    process.stderr.write("convex-detector: ATDD_VIOLATIONS_REPORT not set\n");
    process.exit(2);
  }
  const roots = parseJsonEnv("ATDD_SCAN_ROOTS", []);
  const excludes = [...DEFAULT_EXCLUDES, ...parseJsonEnv("ATDD_SCAN_EXCLUDES", [])];

  // 1. Collect the file universe (absolute, deduped, deterministic order).
  const files = [];
  const seen = new Set();
  for (const root of roots) {
    for (const f of walk(root, excludes)) {
      const abs = resolve(f);
      if (!seen.has(abs)) {
        seen.add(abs);
        files.push(abs);
      }
    }
  }
  files.sort();
  const fileSet = new Set(files);

  // 2. Classify roots + build the forward import graph.
  const graphRoots = new Set();
  const forward = new Map(); // file -> Set(imported files)
  for (const f of files) {
    let text = "";
    try {
      text = readFileSync(f, "utf8");
    } catch {
      text = "";
    }
    if (ROOT_BASENAMES.has(basename(f)) || CONVEX_ENTRY_RE.test(text)) {
      graphRoots.add(f);
    }
    const edges = new Set();
    for (const spec of relativeSpecifiers(text)) {
      const target = resolveSpec(dirname(f), spec, fileSet);
      if (target) edges.add(target);
    }
    forward.set(f, edges);
  }

  // 3. Forward BFS from every root → reachable set.
  const reachable = new Set();
  const queue = [...graphRoots];
  for (const r of graphRoots) reachable.add(r);
  while (queue.length) {
    const cur = queue.shift();
    for (const next of forward.get(cur) || []) {
      if (!reachable.has(next)) {
        reachable.add(next);
        queue.push(next);
      }
    }
  }

  // 4. Any in-scope file not reachable from a root is dead code.
  const violations = [];
  for (const f of files) {
    if (reachable.has(f)) continue;
    violations.push({
      rule_id: RULE_ID,
      file: f,
      line: 0, // structural (whole-file) violation — no single source line
      col: 0,
      evidence:
        "module unreachable from any graph root (schema.ts/http.ts/index barrel/exported Convex fn/test)",
      source_line: "",
    });
  }

  writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
  process.stderr.write(
    `convex-detector: scanned ${files.length} file(s), ${violations.length} violation(s)\n`,
  );
  process.exit(0); // run-health OK regardless of violation count (RAW channel)
}

main();
