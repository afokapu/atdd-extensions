#!/usr/bin/env node
// Detector: coder.astro.client-directive-explicit  (disposition: suppress-and-clean, severity 2)
//
// Astro renders components to static HTML by default — no JavaScript ships unless an
// island is explicitly hydrated with a `client:*` directive (`client:load`,
// `client:visible`, `client:idle`, `client:media`, `client:only`). A React-style event
// handler (`onClick={...}`, `onInput={...}`, …) written in `.astro` markup with NO
// `client:*` directive on its element is DEAD interactivity: Astro emits the markup but
// the handler never hydrates, so the click does nothing. This detector flags such
// handler attributes that lack a `client:*` directive on their owning tag.
//
// CONTRACT (frontend.workspace.runtime v1.1). Env in / JSON report out:
//   INPUT   env ATDD_SCAN_ROOTS / ATDD_SCAN_EXCLUDES / ATDD_VIOLATIONS_REPORT
//   OUTPUT  {"violations": [{rule_id,file,line,col,evidence,source_line}, ...]}
// RAW channel only — zero disposition; exits 0 even when violations are found.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, sep } from "node:path";

const RULE_ID = "coder.astro.client-directive-explicit";

const DEFAULT_EXCLUDES = ["node_modules", "dist", "build", ".next", ".git", "_generated"];
const EXT = new Set([".astro"]);

// React/JSX-style event handler: `on` + Capital + name, value an expression `{...}`.
// This deliberately excludes plain inline HTML handlers (`onclick="…"`, lowercase +
// string value), which are valid static-HTML attributes, not island interactivity.
const HANDLER_RE = /\son[A-Z][A-Za-z]*\s*=\s*\{/g;
const CLIENT_DIR_RE = /\bclient:[a-z]+/;

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

// Replace a region with same-length blanks, preserving newlines, so byte offsets and
// line numbers in the residual text still match the original source exactly.
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
  // Strip the frontmatter fence and any <style> blocks (handlers there are not markup
  // interactivity), blanking positionally so line/col stay accurate.
  let body = text.replace(/^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*$/m, blank);
  body = body.replace(/<style[\s\S]*?<\/style>/gi, blank);

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

  HANDLER_RE.lastIndex = 0;
  let m;
  while ((m = HANDLER_RE.exec(body)) !== null) {
    const at = m.index + 1; // skip the leading whitespace captured by `\s`
    // The owning element opens at the nearest `<tag` before the handler. Its attribute
    // region runs until the next `<` (a tag boundary). A `client:*` directive anywhere
    // in that region hydrates the island, so the handler is live.
    const tagStart = body.lastIndexOf("<", at);
    if (tagStart === -1) continue;
    if (!/[A-Za-z]/.test(body[tagStart + 1] || "")) continue; // not an element open
    let nextLt = body.indexOf("<", at);
    if (nextLt === -1) nextLt = body.length;
    const region = body.slice(tagStart, nextLt);
    if (CLIENT_DIR_RE.test(region)) continue; // explicitly hydrated — fine

    const tagName = (region.match(/^<([A-Za-z][\w.-]*)/) || [, "element"])[1];
    const handlerName = (body.slice(at).match(/^on[A-Z][A-Za-z]*/) || [, ""])[0];
    const line = lineNoFor(at);
    violations.push({
      rule_id: RULE_ID,
      file,
      line: line + 1,
      col: at - lineStarts[line] + 1,
      evidence: `<${tagName}> has ${handlerName}={…} but no client:* directive — dead interactivity`,
      source_line: (rawLines[line] || "").trim(),
    });
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
  for (const root of roots) for (const file of walk(root, excludes)) scanFile(file, violations);

  writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
  process.stderr.write(
    `astro-detector(${RULE_ID}): scanned ${roots.length} root(s), ${violations.length} violation(s)\n`,
  );
  process.exit(0);
}

main();
