#!/usr/bin/env node
// Detector: coder.astro.i18n-no-hardcoded-ui-string  (disposition: documentation-only, severity 2)
//
// apps/web is internationalized: user-facing copy lives in the `i18n/ui.ts` table and is
// rendered through the `t(locale, key)` helper (or a bound expression). A multi-word,
// user-facing string hardcoded directly into `.astro` markup bypasses that table — it
// cannot be translated and drifts out of the locale catalog. This detector flags
// hardcoded multi-word text nodes in `.astro` markup.
//
// CONTRACT (frontend.workspace.runtime v1.1). Env in / JSON report out:
//   INPUT   env ATDD_SCAN_ROOTS / ATDD_SCAN_EXCLUDES / ATDD_VIOLATIONS_REPORT
//   OUTPUT  {"violations": [{rule_id,file,line,col,evidence,source_line}, ...]}
// RAW channel only — zero disposition; exits 0 even when violations are found.
//
// SELF-SCOPING (defense-in-depth to the consumer scope map). Keys on the strongest
// Astro signature: inspects ONLY `.astro` markup. It also file-signature-gates the run
// (NO `.astro` anywhere → NO-OP) so its scope is explicit and uniform with the family.
// SCOPES TO: `.astro` text nodes. RESIDUE: none — hardcoded UI copy in `.astro` markup
// is fully decidable from the extension; nothing is left for the scope map.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, sep } from "node:path";

const RULE_ID = "coder.astro.i18n-no-hardcoded-ui-string";

const DEFAULT_EXCLUDES = ["node_modules", "dist", "build", ".next", ".git", "_generated"];
const EXT = new Set([".astro"]);

// User-facing copy: a phrase a human reads — a word of 2+ letters followed by one or
// more further words (short connectors like "a"/"of" allowed), the signal that
// distinguishes prose from a class name, slug, or single token.
const PHRASE_RE = /[A-Za-z]{2,}(?:[ \t'’,.\-]+[A-Za-z]+)+/;

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
    if (EXT.has(extname(root))) yield root;
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
    else if (EXT.has(extname(full))) yield full;
  }
}

// Replace a region with same-length blanks, preserving newlines, so the residual text
// keeps original byte offsets and line numbers.
function blank(s) {
  return s.replace(/[^\n]/g, " ");
}

function scanFile(file, violations) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return;
  }
  // Blank (positionally) everything that is NOT a literal markup text node:
  // frontmatter, <script>/<style> bodies, HTML comments, and `{...}` expressions
  // (i18n calls and other bound values). Iterate brace removal to collapse nesting.
  let body = text.replace(/^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*$/m, blank);
  body = body.replace(/<script[\s\S]*?<\/script>/gi, blank);
  body = body.replace(/<style[\s\S]*?<\/style>/gi, blank);
  body = body.replace(/<!--[\s\S]*?-->/g, blank);
  for (let pass = 0; pass < 6; pass++) {
    const next = body.replace(/\{[^{}]*\}/g, blank);
    if (next === body) break;
    body = next;
  }

  const lineStarts = [0];
  for (let i = 0; i < body.length; i++) if (body[i] === "\n") lineStarts.push(i + 1);
  const lineNoFor = (idx) => {
    let lo = 0,
      hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= idx) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const rawLines = text.split(/\r?\n/);

  // Text nodes: content between a `>` (tag close) and the next `<` (tag open).
  const TEXT_RE = />([^<>]+)</g;
  let m;
  while ((m = TEXT_RE.exec(body)) !== null) {
    const inner = m[1];
    if (!PHRASE_RE.test(inner)) continue;
    const offsetInInner = inner.search(/[A-Za-z]/);
    const at = m.index + 1 + Math.max(0, offsetInInner);
    const line = lineNoFor(at);
    violations.push({
      rule_id: RULE_ID,
      file,
      line: line + 1,
      col: at - lineStarts[line] + 1,
      evidence: `hardcoded UI string "${inner.trim().slice(0, 60)}" — reference the i18n/ui.ts table via t(locale, key)`,
      source_line: (rawLines[line] || "").trim(),
    });
  }
}

// File-signature gate: is any `.astro` file present in the scan tree?
function treeHasAstro(roots, excludes) {
  for (const root of roots) {
    for (const file of walk(root, excludes)) {
      if (extname(file) === ".astro") return true;
    }
  }
  return false;
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
  if (!treeHasAstro(roots, excludes)) {
    writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
    process.stderr.write(
      `astro-detector(${RULE_ID}): no .astro files in scan tree — self-scoped no-op\n`,
    );
    process.exit(0);
  }
  for (const root of roots) for (const file of walk(root, excludes)) scanFile(file, violations);

  writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
  process.stderr.write(
    `astro-detector(${RULE_ID}): scanned ${roots.length} root(s), ${violations.length} violation(s)\n`,
  );
  process.exit(0);
}

main();
