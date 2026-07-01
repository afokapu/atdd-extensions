#!/usr/bin/env node
// Detector: coder.astro.security-xss  (disposition: strict)
//
// The Astro-stack realization of the agnostic "frontend code must not write
// unsanitized HTML into the DOM" obligation (the python-pytest sibling family is
// `coder.security.xss`). Astro's escape hatch is the `set:html={...}` directive
// (the idiomatic Astro XSS sink); `.astro` islands and `.ts`/`.tsx` component code
// can additionally reach the DOM sinks `.innerHTML =` / `.outerHTML =` and React's
// `dangerouslySetInnerHTML`. This detector flags each such site.
//
// CONTRACT (frontend.workspace.runtime v1.1). Env in / JSON report out:
//   INPUT   env ATDD_SCAN_ROOTS / ATDD_SCAN_EXCLUDES / ATDD_VIOLATIONS_REPORT
//   OUTPUT  {"violations": [{rule_id,file,line,col,evidence,source_line}, ...]}
// RAW channel only — zero disposition; exits 0 even when violations are found.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, sep } from "node:path";

const RULE_ID = "coder.astro.security-xss";

const DEFAULT_EXCLUDES = ["node_modules", "dist", "build", ".next", "_generated"];
const SRC_EXT = new Set([".astro", ".ts", ".tsx", ".jsx"]);
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;
const SANITIZE_FILE_RE = /sanitize/i;

// Astro adds `set:html={...}` (or `set:html="…"`) — the framework directive that
// renders a raw HTML string. The three shared DOM/React sinks apply to islands too.
const SINKS = [
  { re: /\bset:html\s*=/g, kind: "set:html directive" },
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
    return;
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
  if (SANITIZE_FILE_RE.test(base)) return;
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
    process.stderr.write("astro-detector: ATDD_VIOLATIONS_REPORT not set\n");
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
    `astro-detector(security-xss): scanned ${roots.length} root(s), ${violations.length} violation(s)\n`,
  );
  process.exit(0);
}

main();
