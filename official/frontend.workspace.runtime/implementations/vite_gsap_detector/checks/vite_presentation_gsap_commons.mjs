#!/usr/bin/env node
// Detector: coder.vite.presentation-gsap-commons  (disposition: strict)
//
// GSAP (and equivalent motion libraries) is approved for frontend animation, but
// it must be confined to ONE shared animation-commons module so the rest of the
// app stays motion-free and the animation surface is a single auditable seam. Any
// `gsap` / `gsap/*` / `@gsap/*` import — or a bare `gsap.<method>(` call — in a
// file that is NOT the shared animation-commons module is flagged.
//
// CONTRACT (frontend.workspace.runtime v1.1 — JS sibling of the python-pytest
// provider contract). The provider (adapter/run.py) shells out to `node` over THIS
// file and communicates ONLY through env + a JSON report file:
//
//   INPUT   env ATDD_SCAN_ROOTS     JSON array of dir/file roots to inspect.
//           env ATDD_SCAN_EXCLUDES  JSON array of substring/segment excludes (optional).
//           env ATDD_VIOLATIONS_REPORT  path to write the JSON report to.
//   OUTPUT  {"violations": [{rule_id,file,line,col,evidence,source_line}, ...]}
//
// RAW factual channel only — the detector applies ZERO disposition. It exits 0
// even when it finds violations; non-zero only on a genuine runtime fault.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, sep, basename } from "node:path";

const RULE_ID = "coder.vite.presentation-gsap-commons";

const DEFAULT_EXCLUDES = ["_generated", "node_modules", "dist", "build", ".next"];
const TS_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

// gsap module import in any form: ESM `from "gsap"`, side-effect `import "gsap"`,
// dynamic `import("gsap")`, CJS `require("gsap")`, type-only — and the `@gsap/*` /
// `gsap/*` sub-path spellings.
const GSAP_IMPORT_RE = /(?:from\s*|import\s*|require\s*\(\s*|import\s*\(\s*)['"]@?gsap(?:\/[^'"]*)?['"]/;
// Bare usage of the global/imported `gsap` object: `gsap.to(`, `gsap.timeline(`…
const GSAP_USE_RE = /\bgsap\s*\.\s*[A-Za-z_$][\w$]*\s*\(/;

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

// The single sanctioned home for animation code: a module that lives in an
// `animation` directory under a `shared`/`commons` ancestor, or whose basename is
// `animationCommons` / `animation-commons`. GSAP is permitted ONLY here.
function isAnimationCommons(path) {
  const posix = path.split(sep).join("/");
  const base = basename(path).toLowerCase();
  if (/^animation[-.]?commons\.[cm]?[jt]sx?$/.test(base)) return true;
  const segs = posix.split("/");
  const ai = segs.findIndex((s) => s === "animation" || s === "animations");
  if (ai === -1) return false;
  return segs.slice(0, ai).some((s) => s === "shared" || s === "commons");
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
    } else if (extname(full) === ".astro") {
      continue; // SELF-SCOPING: never lint an Astro-stack `.astro` file (see header)
    } else if (TS_EXT.has(extname(full)) && !TEST_RE.test(full)) {
      yield full;
    }
  }
}

function scanFile(file, violations) {
  if (isAnimationCommons(file)) return; // the one sanctioned home for gsap
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return;
  }
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m = GSAP_IMPORT_RE.exec(line);
    let kind = "import";
    if (!m) {
      m = GSAP_USE_RE.exec(line);
      kind = "use";
    }
    if (!m) continue;
    violations.push({
      rule_id: RULE_ID,
      file,
      line: i + 1,
      col: m.index + 1,
      evidence:
        kind === "import"
          ? "gsap imported outside the shared animation-commons module"
          : "gsap.* used outside the shared animation-commons module",
      source_line: line.trim(),
    });
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
    `vite-detector[gsap-commons]: scanned ${roots.length} root(s), ${violations.length} violation(s)\n`,
  );
  process.exit(0);
}

main();
