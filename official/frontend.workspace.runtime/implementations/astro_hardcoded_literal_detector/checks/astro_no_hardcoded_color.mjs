#!/usr/bin/env node
// Detector: coder.astro.no-hardcoded-color  (disposition: strict, severity 2)
//
// apps/web's palette is a token system: colors are declared once as CSS custom properties
// (`--color-charcoal: #1a1a1a;` in the `@theme` block) and consumed everywhere through
// `var(--color-*)` (or Tailwind `…-[var(--color-*)]`). A raw hex (`#1a1a1a`) or color
// function (`rgb(…)`/`hsl(…)`) used as a VALUE — in a `<style>` block, an inline `style`
// attribute, a Tailwind arbitrary value, or a `styles/*.css` rule — bypasses the token
// layer. This detector flags those literals while ALLOWING the token DEFINITIONS
// themselves (a hex on a `--custom-prop:` declaration line).
//
// CONTRACT (frontend.workspace.runtime v1.1). Env in / JSON report out:
//   INPUT   env ATDD_SCAN_ROOTS / ATDD_SCAN_EXCLUDES / ATDD_VIOLATIONS_REPORT
//   OUTPUT  {"violations": [{rule_id,file,line,col,evidence,source_line}, ...]}
// RAW channel only — zero disposition; exits 0 even when violations are found.
//
// SELF-SCOPING (defense-in-depth to the consumer scope map). This check scans `.astro`
// AND `.css` files — but `.css` is NOT an Astro-exclusive signature (a sibling Vite app
// ships `.css` too). So it file-signature-gates the whole run on the Astro marker: with
// NO `.astro` file anywhere in the roots the tree is not apps/web, and the check NO-OPS
// rather than flag a Vite app's `.css`. SCOPES TO: `.astro` markup/`<style>` plus the
// `styles/*.css` that travels with an Astro app. RESIDUE: a `.css` file that lives in a
// MIXED tree alongside `.astro` is still scanned; splitting Vite `.css` from Astro
// `.css` in one root is the consumer scope map's job, not a file-signature guard's.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, sep } from "node:path";

const RULE_ID = "coder.astro.no-hardcoded-color";

const DEFAULT_EXCLUDES = ["node_modules", "dist", "build", ".next", ".git", "_generated"];
const EXT = new Set([".astro", ".css"]);

const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;
const FUNC_RE = /\b(?:rgb|rgba|hsl|hsla)\s*\(/g;
// A CSS custom-property DECLARATION line — `--color-x: #1a1a1a;`. The token definition
// is exactly where a literal color belongs, so these lines are never flagged.
const CUSTOM_PROP_DECL_RE = /^\s*--[\w-]+\s*:/;

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

// In `.astro` markup (outside a <style> block) a literal color only counts when it is
// actually used for styling: inside a Tailwind arbitrary value `…-[#…]` / `…-[rgb(…)]`,
// or inside an inline `style="…"` / `style={…}` attribute. This skips incidental hex
// elsewhere (e.g. `<meta name="theme-color">`, an `href="#anchor"`).
function inStylingContext(line, idx) {
  const before = line.slice(0, idx);
  const opens = (before.match(/\[/g) || []).length;
  const closes = (before.match(/\]/g) || []).length;
  if (opens > closes) return true; // inside a Tailwind arbitrary `[...]`
  if (/style\s*=\s*["'{][^"'}]*$/.test(before)) return true; // inside an inline style value
  return false;
}

function scanFile(file, violations) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return;
  }
  const isCss = extname(file) === ".css";
  const lines = text.split(/\r?\n/);
  let inStyleBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!isCss) {
      // Track <style>…</style> region (Astro scoped styles are real CSS).
      if (/<style\b/i.test(line)) inStyleBlock = true;
    }
    const styleContextLine = isCss || inStyleBlock;
    const isTokenDef = CUSTOM_PROP_DECL_RE.test(line);

    for (const re of [HEX_RE, FUNC_RE]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line)) !== null) {
        if (isTokenDef) continue; // token DEFINITION — allowed
        const ok = styleContextLine || inStylingContext(line, m.index);
        if (!ok) continue;
        violations.push({
          rule_id: RULE_ID,
          file,
          line: i + 1,
          col: m.index + 1,
          evidence: `hardcoded color "${m[0]}" — use a design token (var(--color-*)) instead`,
          source_line: line.trim(),
        });
      }
    }

    if (!isCss && /<\/style>/i.test(line)) inStyleBlock = false;
  }
}

// File-signature gate: is any `.astro` file present? `.css` alone is not enough — it
// ships in Vite apps too — so the Astro marker must be seen for this check to run.
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
