#!/usr/bin/env node
// Detector: coder.astro.component-frontmatter-fence  (disposition: advisory, severity 1)
//
// Astro splits a component into two layers: the `---` frontmatter fence (the component
// SCRIPT — imports + build/SSR-time logic) and `<script>` blocks (CLIENT-side behavior that
// runs in the browser). A `<script>` block whose body is build-time component logic —
// module imports plus data computation with NO DOM/browser API usage — is misplaced: that
// logic belongs in the frontmatter fence, where it runs once at render time, not shipped to
// and re-run in the browser. This detector flags such `<script>` blocks.
//
// CONTRACT (frontend.workspace.runtime v1.1). Env in / JSON report out:
//   INPUT   env ATDD_SCAN_ROOTS / ATDD_SCAN_EXCLUDES / ATDD_VIOLATIONS_REPORT
//   OUTPUT  {"violations": [{rule_id,file,line,col,evidence,source_line}, ...]}
// RAW channel only — zero disposition; exits 0 even when violations are found.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, sep } from "node:path";

const RULE_ID = "coder.astro.component-frontmatter-fence";

const DEFAULT_EXCLUDES = ["node_modules", "dist", "build", ".next", ".git", "_generated"];
const EXT = new Set([".astro"]);

// Build-time component logic: an ESM import or a top-level binding/function declaration.
const LOGIC_RE = /\b(?:import\b|const\b|let\b|var\b|function\b)/;
// Client-side / browser intent: if the script touches any of these it is genuinely
// CLIENT behavior and correctly lives in a `<script>` block (out of scope).
const DOM_API_RE =
  /\b(?:document|window|navigator|location|localStorage|sessionStorage|customElements|addEventListener|IntersectionObserver|MutationObserver|ResizeObserver|requestAnimationFrame|fetch|HTMLElement|querySelector|getElementById)\b/;

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

const SCRIPT_OPEN_RE = /<script\b([^>]*)>/gi;

function scanFile(file, violations) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return;
  }
  // Skip the frontmatter fence (it legitimately holds imports + logic).
  const fenceEnd = (() => {
    const mm = /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*$/m.exec(text);
    return mm ? mm.index + mm[0].length : 0;
  })();

  SCRIPT_OPEN_RE.lastIndex = 0;
  let m;
  while ((m = SCRIPT_OPEN_RE.exec(text)) !== null) {
    if (m.index < fenceEnd) continue;
    const attrs = m[1] || "";
    // Data/JSON scripts and explicitly inline data carriers are not component logic.
    if (/\btype\s*=\s*["'](?!module\b|text\/javascript\b)[^"']*["']/i.test(attrs)) continue;

    const bodyStart = m.index + m[0].length;
    const close = text.indexOf("</script>", bodyStart);
    const body = text.slice(bodyStart, close === -1 ? text.length : close);

    if (!LOGIC_RE.test(body)) continue; // no build-time logic — nothing to relocate
    if (DOM_API_RE.test(body)) continue; // genuine client behavior — correct placement

    // Report the first logic line inside the block (points at the misplaced code).
    const bodyLines = body.split(/\r?\n/);
    let offsetLine = 0;
    for (let k = 0; k < bodyLines.length; k++) {
      if (LOGIC_RE.test(bodyLines[k])) {
        offsetLine = k;
        break;
      }
    }
    const pre = text.slice(0, bodyStart);
    const baseLine = (pre.match(/\n/g) || []).length; // 0-based line of body start
    const line = baseLine + offsetLine;
    const allLines = text.split(/\r?\n/);
    violations.push({
      rule_id: RULE_ID,
      file,
      line: line + 1,
      col: 1,
      evidence:
        "build-time component logic in a <script> block (imports/computation, no DOM API) — move it to the --- frontmatter fence",
      source_line: (allLines[line] || "").trim(),
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
