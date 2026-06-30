#!/usr/bin/env node
// Detector: coder.convex.composition-root  (disposition: strict)
//
// Dependency wiring — instantiating a feature's repositories, clients, services,
// adapters, gateways, and the like — MUST be confined to a composition root:
// `composition.ts` (feature wiring) or `wagon.ts` (wagon entry point). When a
// non-root module instantiates one of these dependencies, the object graph is
// being assembled in the wrong place: wiring leaks into presentation/application/
// integration code, where it cannot be swapped or tested in isolation. This
// detector flags any dependency-shaped class instantiation (`new XxxRepository(`,
// `new XxxClient(`, `new XxxService(`, ...) that appears OUTSIDE a composition
// root. This is the Convex-stack realization of the agnostic composition-root
// obligation (the python-pytest sibling is `coder.refactor.composition-root`).
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

const RULE_ID = "coder.convex.composition-root";

const DEFAULT_EXCLUDES = ["_generated", "node_modules", "dist", "build", ".next", ".nuxt", "coverage"];
const TS_EXT = new Set([".ts", ".tsx"]);
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

// The only files allowed to wire/instantiate dependencies (composition roots).
const ROOT_BASENAMES = new Set(["composition.ts", "wagon.ts"]);

// A dependency-shaped class instantiation: `new XxxRepository(`, `new XxxClient(`,
// `new XxxService(`, etc. The suffix list scopes this to injectable collaborators
// (a `new Date(`/`new Map(`/`new MyValueObject(` is not wiring).
const DEP_NEW_RE =
  /\bnew\s+([A-Z][A-Za-z0-9_]*(?:Repository|Repo|Client|Service|Adapter|Gateway|Store|Manager|Provider|Factory))\s*\(/g;

// Blank out comments (so a `new Xxx(` mentioned in a comment is not a match),
// preserving line numbers: block comments keep their newlines, line comments are cut.
function stripComments(text) {
  const noBlock = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  return noBlock
    .split(/\r?\n/)
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

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

function scanFile(file, violations) {
  if (ROOT_BASENAMES.has(basename(file))) return; // composition roots may wire freely
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return;
  }
  const origLines = text.split(/\r?\n/);
  const lines = stripComments(text).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    DEP_NEW_RE.lastIndex = 0;
    let m;
    while ((m = DEP_NEW_RE.exec(line)) !== null) {
      violations.push({
        rule_id: RULE_ID,
        file,
        line: i + 1,
        col: m.index + 1,
        evidence: `dependency '${m[1]}' instantiated outside a composition root (wiring belongs in composition.ts/wagon.ts)`,
        source_line: (origLines[i] || line).trim(),
      });
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
