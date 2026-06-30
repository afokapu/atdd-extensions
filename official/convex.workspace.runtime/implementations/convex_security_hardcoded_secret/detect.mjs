#!/usr/bin/env node
// Detector: coder.convex.security-hardcoded-secret  (disposition: strict)
//
// A credential literal committed to Convex source is leaked the moment it lands in
// the repo: it cannot be rotated by code review and is readable by anyone with
// repo access. This detector flags secret-shaped string literals — AWS access keys
// (`AKIA…`), `sk_…` secret-key prefixes, `Bearer …` tokens, PEM private-key
// headers, long hex/base64 blobs, and `password`/`api_key`/`token` assignments to a
// quoted literal — in Convex server source. The correct place for credentials is
// `process.env.*` (Convex environment variables), never source.
//
// This is the Convex-stack realization of the agnostic "no committed secrets"
// obligation (the python-pytest sibling is `coder.security.hardcoded-secret`). The
// obligation is stack-bound; the detector — a regex line scan, no TS runtime — is
// JS-specific. The matched secret is truncated in the emitted evidence so the
// detector never re-leaks the value.
//
// CONTRACT (convex.workspace.runtime v1.1):
//   INPUT   env ATDD_SCAN_ROOTS     JSON array of dir/file roots to inspect.
//           env ATDD_SCAN_EXCLUDES  JSON array of substring/segment excludes (optional).
//           env ATDD_VIOLATIONS_REPORT  path to write the JSON report to.
//   OUTPUT  {"violations": [{rule_id,file,line,col,evidence,source_line}, ...]}
// RAW factual channel only — exits 0 even when it finds violations.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, sep } from "node:path";

const RULE_ID = "coder.convex.security-hardcoded-secret";

const DEFAULT_EXCLUDES = ["_generated", "node_modules", "dist", "build", ".next"];
const TS_EXT = new Set([".ts", ".tsx", ".js", ".mjs"]);
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

// Each pattern: a global regex, a human label, and the index of the capture group
// holding the sensitive value (so evidence/source_line can be redacted). AWS-key
// and PEM-header patterns are case-sensitive (real keys are); the keyword-assignment
// pattern is case-insensitive (matching the python sibling's vendored set).
const PATTERNS = [
  { re: /AKIA[0-9A-Z]{16}/g, label: "AWS access key", group: 0 },
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g, label: "PEM private-key header", group: 0 },
  { re: /\bsk_[A-Za-z0-9_]{12,}/g, label: "secret-key literal (sk_…)", group: 0 },
  { re: /Bearer\s+[A-Za-z0-9._\-]{12,}/g, label: "bearer-token literal", group: 0 },
  {
    re: /(password|passwd|pwd|api[_-]?key|secret|secret[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|token)\s*[:=]\s*(['"])([^'"\n]{12,})\2/gi,
    label: "credential assignment to a literal",
    group: 3,
  },
  { re: /(['"])([0-9a-fA-F]{32,})\1/g, label: "long hex literal", group: 2 },
  { re: /(['"])([A-Za-z0-9+/]{40,}={0,2})\1/g, label: "long base64 literal", group: 2 },
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
    if (cst.isDirectory()) {
      yield* walk(full, excludes);
    } else if (TS_EXT.has(extname(full)) && !TEST_RE.test(full)) {
      yield full;
    }
  }
}

// Comment-masked, length-preserving copy of the source: `//` and `/* */` blanked
// (so a documented example secret in a comment is not flagged), string contents
// kept (so secrets inside string literals are still matched). Newlines preserved.
function maskComments(src) {
  const out = src.split("");
  let i = 0;
  const n = src.length;
  let state = "code"; // code | line | block | sq | dq | tpl
  const blank = (c) => (c === "\n" ? "\n" : " ");
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (state === "code") {
      if (c === "/" && d === "/") { out[i] = out[i + 1] = " "; i += 2; state = "line"; continue; }
      if (c === "/" && d === "*") { out[i] = out[i + 1] = " "; i += 2; state = "block"; continue; }
      if (c === "'") { state = "sq"; i++; continue; }
      if (c === '"') { state = "dq"; i++; continue; }
      if (c === "`") { state = "tpl"; i++; continue; }
      i++; continue;
    }
    if (state === "line") {
      if (c === "\n") { state = "code"; i++; continue; }
      out[i] = blank(c); i++; continue;
    }
    if (state === "block") {
      if (c === "*" && d === "/") { out[i] = out[i + 1] = " "; i += 2; state = "code"; continue; }
      out[i] = blank(c); i++; continue;
    }
    if (state === "sq") {
      if (c === "\\") { i += 2; continue; }
      if (c === "'") { state = "code"; }
      i++; continue;
    }
    if (state === "dq") {
      if (c === "\\") { i += 2; continue; }
      if (c === '"') { state = "code"; }
      i++; continue;
    }
    // tpl
    if (c === "\\") { i += 2; continue; }
    if (c === "`") { state = "code"; }
    i++;
  }
  return out.join("");
}

function redact(value) {
  if (value.length <= 6) return value[0] + "…";
  return value.slice(0, 4) + "…" + `(${value.length} chars)`;
}

function scanFile(file, violations) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return;
  }
  const masked = maskComments(text);
  const maskedLines = masked.split(/\r?\n/);
  const rawLines = text.split(/\r?\n/);

  for (let i = 0; i < maskedLines.length; i++) {
    const mline = maskedLines[i];
    if (!mline.trim()) continue;
    const seen = new Set(); // dedupe overlapping pattern hits at the same column
    for (const { re, label, group } of PATTERNS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(mline)) !== null) {
        const col = m.index + 1;
        if (seen.has(col)) continue;
        seen.add(col);
        const value = m[group] ?? m[0];
        violations.push({
          rule_id: RULE_ID,
          file,
          line: i + 1,
          col,
          evidence: `hardcoded ${label} in Convex source — read it from process.env instead [${redact(value)}]`,
          source_line: (rawLines[i] || "").replace(value, redact(value)).trim(),
        });
      }
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
  for (const root of roots) {
    for (const file of walk(root, excludes)) scanFile(file, violations);
  }

  writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
  process.stderr.write(
    `convex-detector: scanned ${roots.length} root(s), ${violations.length} violation(s)\n`,
  );
  process.exit(0);
}

main();
