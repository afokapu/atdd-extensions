#!/usr/bin/env node
// Detector: coder.vite.presentation-gsap-layer  (disposition: strict)
//
// GSAP (and equivalent motion libraries) is approved for frontend animation, but
// must be constrained to a feature's presentation layer. Importing it into a
// non-presentation layer (`*/domain/`, `*/application/`, `*/integration/`) couples
// business logic to a view concern. This detector flags any `gsap` / `gsap/*` /
// `@gsap/*` import — or a bare `gsap.<method>(` call — in a non-presentation layer
// file.
//
// CONTRACT (frontend.workspace.runtime v1.1 — JS sibling of the python-pytest
// provider contract). The provider shells out to `node` over THIS file and
// communicates ONLY through env + a JSON report file:
//
//   INPUT   env ATDD_SCAN_ROOTS / ATDD_SCAN_EXCLUDES (JSON arrays)
//           env ATDD_VIOLATIONS_REPORT  path to write the JSON report to.
//   OUTPUT  {"violations": [{rule_id,file,line,col,evidence,source_line}, ...]}
//
// RAW factual channel only — exits 0 even when it finds violations.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, sep } from "node:path";

const RULE_ID = "coder.vite.presentation-gsap-layer";

const DEFAULT_EXCLUDES = ["_generated", "node_modules", "dist", "build", ".next"];
const TS_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

const GSAP_IMPORT_RE = /(?:from\s*|import\s*|require\s*\(\s*|import\s*\(\s*)['"]@?gsap(?:\/[^'"]*)?['"]/;
const GSAP_USE_RE = /\bgsap\s*\.\s*[A-Za-z_$][\w$]*\s*\(/;

// Layers a view-motion library must NOT enter. `presentation` is the only layer
// permitted to import it, so a file carrying a presentation segment is exempt even
// if it also sits below one of these names.
const NON_PRESENTATION_LAYERS = new Set(["domain", "application", "integration"]);

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

// True when the file belongs to a non-presentation layer (and is not itself in a
// presentation subtree). Presentation is the sanctioned home for animation.
function isNonPresentationLayer(path) {
  const segs = path.split(sep).join("/").split("/");
  if (segs.includes("presentation")) return false;
  return segs.some((s) => NON_PRESENTATION_LAYERS.has(s));
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
  if (!isNonPresentationLayer(file)) return; // presentation & layer-less files exempt
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
          ? "gsap imported in a non-presentation layer (domain/application/integration)"
          : "gsap.* used in a non-presentation layer (domain/application/integration)",
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
    `vite-detector[gsap-layer]: scanned ${roots.length} root(s), ${violations.length} violation(s)\n`,
  );
  process.exit(0);
}

main();
