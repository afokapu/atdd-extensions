#!/usr/bin/env node
// Detector: coder.convex.security-missing-auth  (disposition: strict)
//
// A Convex server function (`query` / `mutation` / `action`) that reads or writes
// the database via `ctx.db` but never consults the caller's identity
// (`ctx.auth` / `getUserIdentity`) is reachable without authentication — every
// client can read/mutate whatever it touches. This detector flags each exported
// `query`/`mutation`/`action` whose handler body touches `ctx.db` but contains no
// reference to `ctx.auth` / `getUserIdentity`.
//
// This is the Convex-stack realization of the agnostic "no unauthenticated entry
// point" obligation (the python-pytest sibling is `coder.security.missing-auth`,
// which checks FastAPI routes for a `Depends(auth_fn)` parameter). The obligation
// is stack-bound; the detector — a regex/heuristic scan over Convex server source,
// no TS runtime — is JS-specific.
//
// CONTRACT (convex.workspace.runtime v1.1). The provider (adapter/run.py) shells out
// to `node` over THIS file and communicates ONLY through env + a JSON report file:
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

const RULE_ID = "coder.convex.security-missing-auth";

const DEFAULT_EXCLUDES = ["_generated", "node_modules", "dist", "build", ".next"];
const TS_EXT = new Set([".ts", ".tsx", ".js", ".mjs"]);
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

// Exported server-function registration: `export const <name> = query|mutation|action(`.
// `\b(query|mutation|action)\b` does not match `internalQuery`/`internalMutation`
// (no word boundary between `internal` and the verb), so internal functions — which
// are not part of the public API surface — are out of scope, matching the rule.
const EXPORT_RE =
  /export\s+const\s+([A-Za-z0-9_$]+)\s*(?::[^=]+)?=\s*(query|mutation|action)\b\s*\(/g;

const RE_CTX_DB = /\bctx\s*\.\s*db\b/;
const RE_DESTRUCT_DB = /\{\s*[^}]*\bdb\b[^}]*\}\s*=\s*ctx\b/;
const RE_DB_USE = /\bdb\s*\.\s*(get|query|insert|patch|replace|delete|normalizeId)\b/;

const RE_CTX_AUTH = /\bctx\s*\.\s*auth\b/;
const RE_GET_IDENTITY = /\bgetUserIdentity\b/;
const RE_DESTRUCT_AUTH = /\{\s*[^}]*\bauth\b[^}]*\}\s*=\s*ctx\b/;

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

// Produce two length-preserving masks of the source so regex/brace scans never
// trip on comments or string contents:
//   mc — comments blanked, string contents kept (for reading literal values)
//   ms — comments AND string contents blanked (for structural brace/paren matching)
// Newlines are preserved in both so character indices map back to line/col.
function maskSource(src) {
  const mc = src.split("");
  const ms = src.split("");
  let i = 0;
  const n = src.length;
  let state = "code"; // code | line | block | sq | dq | tpl
  const blank = (c) => (c === "\n" ? "\n" : " ");
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (state === "code") {
      if (c === "/" && d === "/") { mc[i] = mc[i + 1] = " "; ms[i] = ms[i + 1] = " "; i += 2; state = "line"; continue; }
      if (c === "/" && d === "*") { mc[i] = mc[i + 1] = " "; ms[i] = ms[i + 1] = " "; i += 2; state = "block"; continue; }
      if (c === "'") { state = "sq"; i++; continue; }
      if (c === '"') { state = "dq"; i++; continue; }
      if (c === "`") { state = "tpl"; i++; continue; }
      i++; continue;
    }
    if (state === "line") {
      if (c === "\n") { state = "code"; i++; continue; }
      mc[i] = blank(c); ms[i] = blank(c); i++; continue;
    }
    if (state === "block") {
      if (c === "*" && d === "/") { mc[i] = mc[i + 1] = " "; ms[i] = ms[i + 1] = " "; i += 2; state = "code"; continue; }
      mc[i] = blank(c); ms[i] = blank(c); i++; continue;
    }
    // string states: mc keeps the literal text; ms blanks it
    if (state === "sq") {
      if (c === "\\") { ms[i] = blank(c); ms[i + 1] = blank(src[i + 1]); i += 2; continue; }
      if (c === "'") { state = "code"; i++; continue; }
      ms[i] = blank(c); i++; continue;
    }
    if (state === "dq") {
      if (c === "\\") { ms[i] = blank(c); ms[i + 1] = blank(src[i + 1]); i += 2; continue; }
      if (c === '"') { state = "code"; i++; continue; }
      ms[i] = blank(c); i++; continue;
    }
    // tpl: blank contents in ms (we do not track ${} re-entry — adequate for a heuristic)
    if (c === "\\") { ms[i] = blank(c); ms[i + 1] = blank(src[i + 1]); i += 2; continue; }
    if (c === "`") { state = "code"; i++; continue; }
    ms[i] = blank(c); i++;
  }
  return { mc: mc.join(""), ms: ms.join("") };
}

// From the index of an opening `(` in `ms`, return the index just past the matching
// `)`, or `ms.length` if unbalanced (string/comment chars are already blanked).
function matchParenEnd(ms, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < ms.length; i++) {
    const c = ms[i];
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return ms.length;
}

function lineColAt(src, index) {
  let line = 1;
  let last = -1;
  for (let i = 0; i < index; i++) {
    if (src[i] === "\n") { line++; last = i; }
  }
  return { line, col: index - last };
}

function scanFile(file, violations) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return;
  }
  const { mc, ms } = maskSource(text);
  const lines = text.split(/\r?\n/);

  EXPORT_RE.lastIndex = 0;
  let m;
  while ((m = EXPORT_RE.exec(ms)) !== null) {
    const name = m[1];
    const kind = m[2];
    const openParen = m.index + m[0].length - 1; // index of the `(` after the verb
    const end = matchParenEnd(ms, openParen);
    const spanMs = ms.slice(openParen, end);

    const hasDb =
      RE_CTX_DB.test(spanMs) || (RE_DESTRUCT_DB.test(spanMs) && RE_DB_USE.test(spanMs));
    if (!hasDb) continue;

    const hasAuth =
      RE_CTX_AUTH.test(spanMs) ||
      RE_GET_IDENTITY.test(spanMs) ||
      RE_DESTRUCT_AUTH.test(spanMs);
    if (hasAuth) continue;

    const { line, col } = lineColAt(text, m.index);
    violations.push({
      rule_id: RULE_ID,
      file,
      line,
      col,
      evidence: `exported ${kind} '${name}' touches ctx.db but never checks ctx.auth/getUserIdentity`,
      source_line: (lines[line - 1] || "").trim(),
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
