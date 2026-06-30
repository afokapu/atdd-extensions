#!/usr/bin/env node
// Detector: coder.convex.domain-no-convex-import  (disposition: strict)
//
// The domain layer holds pure business rules and types. It is the innermost layer
// and MUST stay free of infrastructure: it must not import the Convex runtime
// (`convex/*`), must not import generated client code (`./_generated`, `_generated`),
// and must not touch the Convex request context (`ctx`). A domain module that does
// any of these has leaked persistence/transport concerns inward, inverting the
// dependency direction the architecture relies on. This detector flags each such
// line in a domain module (`domain.ts` or any file under a `domain/` directory).
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
// even when it finds violations; it exits non-zero only on a genuine runtime fault.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, basename, extname, sep } from "node:path";

const RULE_ID = "coder.convex.domain-no-convex-import";

// Directories/segments never inspected: generated client code, deps, build out,
// and test files.
const DEFAULT_EXCLUDES = ["_generated", "node_modules", "dist", "build", ".next"];
const TS_EXT = new Set([".ts", ".tsx", ".js", ".mjs"]);
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

// An import (static `import ... from '<spec>'` or dynamic/`require`) whose module
// specifier is a Convex runtime package: `convex`, `convex/values`, `convex/server`, ...
const CONVEX_IMPORT_RE = /\b(?:from|import|require)\s*\(?\s*["'](convex(?:\/[^"']*)?)["']/;

// An import whose specifier references the generated client code (`./_generated/...`,
// `../_generated/server`, ...). Generated code is infrastructure — domain must not see it.
const GENERATED_IMPORT_RE = /["'][^"']*_generated[^"']*["']/;

// A reference to the Convex request context `ctx` (db/auth/scheduler handle). Its
// presence in a domain module means the layer is reaching into the runtime.
const CTX_REF_RE = /\bctx\b/;

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

// A file is a domain module if its basename is `domain.ts` (the single-file layer)
// or it lives anywhere under a directory segment named `domain` (a promoted
// `domain/` layer). Only domain modules are subject to this rule.
function isDomainModule(file) {
  if (basename(file) === "domain.ts") return true;
  const segs = file.split(sep);
  // any segment EXCEPT the basename that equals "domain"
  for (let i = 0; i < segs.length - 1; i++) {
    if (segs[i] === "domain") return true;
  }
  return false;
}

function* walk(root, excludes) {
  let st;
  try {
    st = statSync(root);
  } catch {
    return; // missing root — skip silently; a missing scan root is not a fault
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
    if (cst.isDirectory()) {
      yield* walk(full, excludes);
    } else if (TS_EXT.has(extname(full)) && !TEST_RE.test(full)) {
      yield full;
    }
  }
}

function scanFile(file, violations) {
  if (!isDomainModule(file)) return;
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return;
  }
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const reasons = [];
    if (CONVEX_IMPORT_RE.test(line)) reasons.push("imports the Convex runtime (convex/*)");
    if (GENERATED_IMPORT_RE.test(line)) reasons.push("imports generated client code (_generated)");
    if (CTX_REF_RE.test(line)) reasons.push("references the Convex context (ctx)");
    if (reasons.length === 0) continue;
    violations.push({
      rule_id: RULE_ID,
      file,
      line: i + 1,
      col: 1,
      evidence: `domain module ${reasons.join(" + ")} — domain must stay free of Convex infrastructure`,
      source_line: line.trim(),
    });
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
  for (const root of roots) {
    for (const file of walk(root, excludes)) scanFile(file, violations);
  }

  writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
  process.stderr.write(
    `convex-detector: scanned ${roots.length} root(s), ${violations.length} violation(s)\n`,
  );
  process.exit(0); // run-health OK regardless of violation count (RAW channel)
}

main();
