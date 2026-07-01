#!/usr/bin/env node
// Detector: coder.vite.security-xss  (disposition: strict)
//
// The Vite/React-stack realization of the agnostic "frontend code must not write
// unsanitized HTML into the DOM" obligation (the python-pytest sibling family is
// `coder.security.xss`). A raw `dangerouslySetInnerHTML` prop, an `.innerHTML =`
// assignment, or an `.outerHTML =` assignment injects an HTML string directly into
// the document — the classic XSS sink. This detector flags each such site in a
// non-test `*.ts`/`*.tsx`/`*.jsx` source file.
//
// CONTRACT (frontend.workspace.runtime v1.1 — the JS sibling of the python-pytest
// provider contract). The provider (adapter/run.py) shells out to `node` over THIS
// file and communicates ONLY through env + a JSON report file:
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

const RULE_ID = "coder.vite.security-xss";

const DEFAULT_EXCLUDES = ["node_modules", "dist", "build", ".next", "_generated"];
const SRC_EXT = new Set([".ts", ".tsx", ".jsx"]);
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;
// A sanitizer wrapper is the one place these sinks are permitted — mirrors the core
// convention's `**/sanitize*.ts(x)` exclusion.
const SANITIZE_FILE_RE = /sanitize/i;

// The three DOM/React HTML-injection sinks the core `coder.security.xss` names:
//   * `dangerouslySetInnerHTML` — React's escape hatch (the prop itself is the sink).
//   * `.innerHTML =`  — direct DOM assignment (not `==`/`===` comparison).
//   * `.outerHTML =`  — direct DOM assignment.
// A GET of `el.innerHTML` (read) is not an injection sink, so only assignment counts.
const SINKS = [
  { re: /\bdangerouslySetInnerHTML\b/g, kind: "dangerouslySetInnerHTML" },
  { re: /\binnerHTML\s*=(?!=)/g, kind: "innerHTML assignment" },
  { re: /\bouterHTML\s*=(?!=)/g, kind: "outerHTML assignment" },
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
    } else if (SRC_EXT.has(extname(full)) && !TEST_RE.test(full)) {
      yield full;
    }
  }
}

function scanFile(file, violations) {
  const base = file.split(sep).pop();
  if (SANITIZE_FILE_RE.test(base)) return; // sanitizer wrapper — out of scope
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
    for (const { re, kind } of SINKS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line)) !== null) {
        violations.push({
          rule_id: RULE_ID,
          file,
          line: i + 1,
          col: m.index + 1,
          evidence: `${kind} — unsanitized HTML injected into the DOM (XSS sink); render text or sanitize first`,
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
    `vite-detector(security-xss): scanned ${roots.length} root(s), ${violations.length} violation(s)\n`,
  );
  process.exit(0); // run-health OK regardless of violation count (RAW channel)
}

main();
