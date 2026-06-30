#!/usr/bin/env node
// Detector: coder.vite.refactor-coach-ratchet-pres  (disposition: advisory)
//
// The refactor ratchet rewards line/duplication reduction, but presentation files
// are uniquely sensitive: their lines map to user-visible features. The canonical
// incident (core #358) was 8 match features deleted during ratchet trimming while
// structural validators stayed green — a presentation component gutted to a stub
// that still exports but renders nothing. This detector surfaces that smell: a
// presentation-layer file that exports a component whose body renders NO real JSX
// (it returns only `null` / an empty fragment). Advisory + RAW — the smoke-evidence
// gate is a downstream coach/consumer concern; the detector just emits the finding.
//
// CONTRACT (frontend.workspace.runtime v1.1). The provider shells out to `node`
// over THIS file and communicates ONLY through env + a JSON report file:
//
//   INPUT   env ATDD_SCAN_ROOTS / ATDD_SCAN_EXCLUDES (JSON arrays)
//           env ATDD_VIOLATIONS_REPORT  path to write the JSON report to.
//   OUTPUT  {"violations": [{rule_id,file,line,col,evidence,source_line}, ...]}
//
// RAW factual channel only — exits 0 even when it finds violations.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, sep } from "node:path";

const RULE_ID = "coder.vite.refactor-coach-ratchet-pres";

const DEFAULT_EXCLUDES = ["_generated", "node_modules", "dist", "build", ".next"];
const TS_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

// An exported React component declaration.
const EXPORT_COMPONENT_RE =
  /export\s+(?:default\s+)?(?:function|const)\s+[A-Z]\w*|export\s+default\s+function\b/;
// A body that renders nothing: `return null`, `return <></>`, `return <Fragment />`.
const EMPTY_RENDER_RE =
  /return\s*(?:\(\s*)?(?:null|<>\s*<\/>|<\s*(?:React\.)?Fragment\s*\/>)\s*\)?\s*;?/;
// A real JSX element open (`<div`, `<Board `, `<Tile/>`) — the negative lookbehind
// excludes TypeScript generics like `useState<Lang>`, and the leading `<>` fragment
// never matches (it has no tag letter).
const REAL_JSX_RE = /(?<![\w$])<[A-Za-z][A-Za-z0-9]*(?:[\s/>]|$)/;

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

function isPresentation(path) {
  return path.split(sep).join("/").split("/").includes("presentation");
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

function scanFile(file, violations) {
  if (!isPresentation(file)) return; // only presentation-layer files
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return;
  }
  if (!EXPORT_COMPONENT_RE.test(text)) return; // not an exported component
  if (REAL_JSX_RE.test(text)) return; // renders real markup — not a gutted stub

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = EMPTY_RENDER_RE.exec(lines[i]);
    if (!m) continue;
    violations.push({
      rule_id: RULE_ID,
      file,
      line: i + 1,
      col: m.index + 1,
      evidence:
        "presentation component exports but renders nothing (empty render) — possible ratchet-trimmed stub",
      source_line: lines[i].trim(),
    });
    return; // one finding per stubbed component is enough
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
    `vite-detector[coach-ratchet-pres]: scanned ${roots.length} root(s), ${violations.length} violation(s)\n`,
  );
  process.exit(0); // advisory RAW — still run-health OK regardless of count
}

main();
