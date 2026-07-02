#!/usr/bin/env node
// Detector: coder.vite.boundaries-http-client  (disposition: strict)
//
// Frontend production code must route HTTP egress through the project's
// centralized, contract-driven HTTP client — never the raw `fetch()` primitive
// or a bare `axios` call inside a component / presentation file. A raw call in a
// component bypasses interceptors, auth, contracts, and telemetry the client
// applies uniformly. This detector flags every raw `fetch(` / `axios.`|`axios(`
// call site in a non-client `*.ts`/`*.tsx` source file.
//
// SELF-SCOPING (defense-in-depth to the consumer scope map). Vite/React detector.
// SCOPES TO: the React-extension whitelist `*.ts`/`*.tsx` only; it explicitly SKIPS
// `.astro` files (Astro-stack artifacts a Vite React rule must never lint). RESIDUE the
// extension cannot decide: a `.tsx` file is legal in both a Vite app and an Astro
// island, so in a MIXED tree this still scans Astro-island `.tsx` — the last-mile split
// is the consumer scope map's job, not this guard's.
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
import { join, extname, sep, basename } from "node:path";

const RULE_ID = "coder.vite.boundaries-http-client";

const DEFAULT_EXCLUDES = ["node_modules", "dist", "build", ".next"];
const SRC_EXT = new Set([".ts", ".tsx"]);
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

// The centralized HTTP client module is the ONE place a raw primitive is allowed
// (it wraps it). Identify it by filename: anything whose basename names a client.
const CLIENT_FILE_RE = /(client|httpclient|api-?client)/i;

// Raw `fetch(` that is not a property access (`this.fetch(`) or part of a longer
// identifier (`prefetch(`). Bare `axios(` / `axios.get(` likewise (not `myaxios`).
const FETCH_RE = /(?<![.\w])fetch\s*\(/g;
const AXIOS_RE = /(?<![.\w])axios\s*[.(]/g;

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
    if (SRC_EXT.has(extname(root)) && !TEST_RE.test(root)) yield root;
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
    } else if (SRC_EXT.has(extname(full)) && !TEST_RE.test(full)) {
      yield full;
    }
  }
}

function scanFile(file, violations) {
  // The centralized client legitimately wraps the primitive — out of scope.
  if (CLIENT_FILE_RE.test(basename(file))) return;
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
    for (const [re, kind] of [[FETCH_RE, "fetch()"], [AXIOS_RE, "axios"]]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line)) !== null) {
        violations.push({
          rule_id: RULE_ID,
          file,
          line: i + 1,
          col: m.index + 1,
          evidence: `raw ${kind} call in a component/presentation file; route HTTP through the centralized client`,
          source_line: line.trim(),
        });
      }
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

  const violations = [];
  for (const root of roots) {
    for (const file of walk(root, excludes)) scanFile(file, violations);
  }

  writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
  process.stderr.write(
    `vite-detector(boundaries-http-client): scanned ${roots.length} root(s), ${violations.length} violation(s)\n`,
  );
  process.exit(0); // run-health OK regardless of violation count (RAW channel)
}

main();
