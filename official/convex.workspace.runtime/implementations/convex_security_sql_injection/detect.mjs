#!/usr/bin/env node
// Detector: coder.convex.security-sql-injection  (disposition: strict)
//
// The Convex-stack realization of the agnostic "no raw SQL built by string
// concatenation/interpolation in an execute call" obligation (the python-pytest
// sibling is `coder.security.sql-injection`). A Convex `"use node"` action that
// reaches an external SQL store (via `pg`/`mysql2`/`postgres`/Prisma raw) and
// builds the query by interpolating (`` `… ${x} …` ``) or concatenating (`"…" + x`)
// user input is SQL-injectable. This detector flags a SQL sink call whose argument
// carries a SQL keyword AND is dynamically built.
//
// CONTRACT (convex.workspace.runtime v1.1 — JS sibling of the python-pytest contract):
//   INPUT   env ATDD_SCAN_ROOTS / ATDD_SCAN_EXCLUDES / ATDD_VIOLATIONS_REPORT
//   OUTPUT  {"violations":[{rule_id,file,line,col,evidence,source_line}, ...]}
// RAW factual channel only — ZERO disposition; exits 0 regardless of count.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, sep } from "node:path";

const RULE_ID = "coder.convex.security-sql-injection";

const DEFAULT_EXCLUDES = ["_generated", "node_modules", "dist", "build", ".next"];
const TS_EXT = new Set([".ts", ".tsx", ".js", ".mjs"]);
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

// SQL execution sinks — the TS/ORM analogues of the core Python-DBAPI sink set
// (`execute`/`executemany`/`raw`/`execute_sql`), plus the node SQL-driver method
// `query` (pg/mysql2). A leading `.` or `$` (Prisma) or a bare call is accepted; a
// longer identifier (`myexecute`) is not.
const SINK_RE =
  /(?<![\w$])\$?(?:execute|executemany|execute_sql|executeRaw|executeRawUnsafe|query|queryRaw|queryRawUnsafe|raw|unsafe)\s*\(/g;

// A SQL statement keyword must appear in the sink argument for it to be raw SQL —
// this is what keeps Convex's own `ctx.db.query("messages")` (a table name, no SQL
// keyword) from ever matching. `query` is a common Convex method name, so this gate
// is what makes it safe to include in the sink set: only an argument that both
// contains a SQL keyword AND is dynamically built is ever flagged.
const SQL_KW_RE = /\b(?:SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE)\b/i;
// Dynamic construction: template-literal interpolation `${…}` inside a backtick
// string, OR string-literal concatenation (`"…" +` / `+ "…"`).
const INTERP_RE = /`[^`]*\$\{/;
const CONCAT_RE = /['"]\s*\+|\+\s*['"]/;

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

// Mask string literals, template literals, and comments to spaces (newlines and
// length preserved) so paren-matching finds STRUCTURAL parens only. Ported verbatim
// from the convex_complexity_detector masker: a `${ … }` interpolation returns to
// CODE state (via an interpReturn brace-depth stack) so a `'` that closes the SQL
// string AFTER the interpolation is not mistaken for a new opening quote — the bug
// a naive single-pass masker hits on `'${x}'`.
function maskSource(text) {
  const out = Array.from(text, (ch) => ch);
  const n = text.length;
  let i = 0;
  let state = "code";
  let codeBraceDepth = 0;
  const interpReturn = [];
  while (i < n) {
    const c = text[i];
    const d = i + 1 < n ? text[i + 1] : "";
    if (state === "code") {
      if (c === "/" && d === "/") { out[i] = " "; out[i + 1] = " "; i += 2; state = "line"; continue; }
      if (c === "/" && d === "*") { out[i] = " "; out[i + 1] = " "; i += 2; state = "block"; continue; }
      if (c === "'") { out[i] = " "; i++; state = "sq"; continue; }
      if (c === '"') { out[i] = " "; i++; state = "dq"; continue; }
      if (c === "`") { out[i] = " "; i++; state = "tpl"; continue; }
      if (c === "{") { codeBraceDepth++; i++; continue; }
      if (c === "}") {
        if (interpReturn.length && codeBraceDepth === interpReturn[interpReturn.length - 1]) {
          interpReturn.pop(); out[i] = " "; i++; state = "tpl"; continue;
        }
        codeBraceDepth--; i++; continue;
      }
      i++; continue;
    }
    if (state === "line") {
      if (c === "\n") { state = "code"; i++; continue; }
      out[i] = " "; i++; continue;
    }
    if (state === "block") {
      if (c === "*" && d === "/") { out[i] = " "; out[i + 1] = " "; i += 2; state = "code"; continue; }
      if (c !== "\n") out[i] = " ";
      i++; continue;
    }
    if (state === "sq" || state === "dq") {
      const q = state === "sq" ? "'" : '"';
      if (c === "\\") { out[i] = " "; if (i + 1 < n && text[i + 1] !== "\n") out[i + 1] = " "; i += 2; continue; }
      if (c === q) { out[i] = " "; i++; state = "code"; continue; }
      if (c !== "\n") out[i] = " ";
      i++; continue;
    }
    if (state === "tpl") {
      if (c === "\\") { out[i] = " "; if (i + 1 < n && text[i + 1] !== "\n") out[i + 1] = " "; i += 2; continue; }
      if (c === "`") { out[i] = " "; i++; state = "code"; continue; }
      if (c === "$" && d === "{") { out[i] = " "; out[i + 1] = " "; interpReturn.push(codeBraceDepth); i += 2; state = "code"; continue; }
      if (c !== "\n") out[i] = " ";
      i++; continue;
    }
  }
  return out.join("");
}

function lineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") starts.push(i + 1);
  return starts;
}
function posToLineCol(starts, idx) {
  let lo = 0, hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= idx) lo = mid; else hi = mid - 1;
  }
  return { line: lo + 1, col: idx - starts[lo] + 1 };
}
function lineTextAt(text, starts, idx) {
  const { line } = posToLineCol(starts, idx);
  const start = starts[line - 1];
  let end = text.indexOf("\n", start);
  if (end === -1) end = text.length;
  return text.slice(start, end).trim();
}
// Match the `)` closing the `(` at openIdx, using the blanked copy (string parens
// already removed).
function matchParen(blanked, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < blanked.length; i++) {
    const ch = blanked[i];
    if (ch === "(") depth++;
    else if (ch === ")") { depth--; if (depth === 0) return i; }
  }
  return -1;
}

function scanFile(file, violations) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return;
  }
  const blanked = maskSource(text);
  const starts = lineStarts(text);

  SINK_RE.lastIndex = 0;
  let m;
  while ((m = SINK_RE.exec(blanked)) !== null) {
    const parenOpen = m.index + m[0].length - 1; // the `(` of the sink call
    const parenClose = matchParen(blanked, parenOpen);
    if (parenClose === -1) continue;
    // Inspect the ORIGINAL argument text (strings/templates intact) so the SQL
    // keyword and the dynamic-build markers inside the string are visible.
    const argText = text.slice(parenOpen + 1, parenClose);
    if (!SQL_KW_RE.test(argText)) continue; // not raw SQL — e.g. ctx.db.query("messages")
    const dynamic = INTERP_RE.test(argText) || CONCAT_RE.test(argText);
    if (!dynamic) continue; // static SQL string — not concatenation (core forbids concat)

    const sinkStart = m.index;
    const { line, col } = posToLineCol(starts, sinkStart);
    const how = INTERP_RE.test(argText) ? "template-literal interpolation" : "string concatenation";
    violations.push({
      rule_id: RULE_ID,
      file,
      line,
      col,
      evidence: `raw SQL built by ${how} passed to a query sink — use parameterized queries / bound parameters`,
      source_line: lineTextAt(text, starts, sinkStart),
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
    `convex-detector(security-sql-injection): scanned ${roots.length} root(s), ${violations.length} violation(s)\n`,
  );
  process.exit(0);
}

main();
