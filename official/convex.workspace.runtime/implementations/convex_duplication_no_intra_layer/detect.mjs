#!/usr/bin/env node
// Detector: coder.convex.duplication-no-intra-layer  (disposition: strict)
//
// When two Convex modules are classified to the SAME architectural layer (domain /
// application / presentation / integration), that layer MUST NOT contain a
// structurally identical code fragment of meaningful size copy-pasted across
// DIFFERENT sibling files. A duplicated helper in one layer is a maintenance
// hazard: a fix has to be applied in every copy. This detector fingerprints each
// file with structural normalization (comments stripped; string/number/identifier
// tokens replaced) over a sliding window of >= 6 non-trivial normalized lines, and
// flags a window-hash that recurs across two different files of the same layer.
// This is the Convex-stack realization of the agnostic "no copy-paste within a
// layer" obligation (the python-pytest sibling is
// `coder.duplication.no-intra-layer-code-typescript`).
//
// CONTRACT (convex.workspace.runtime v1.1 — the JS sibling of the python-pytest
// provider contract). The provider (adapter/run.py) shells out to `node` over
// THIS file and communicates ONLY through env + a JSON report file:
//
//   INPUT   env ATDD_SCAN_ROOTS     JSON array of dir/file roots to inspect.
//           env ATDD_SCAN_EXCLUDES  JSON array of substring/segment excludes (optional).
//           env ATDD_VIOLATIONS_REPORT  path to write the JSON report to.
//   OUTPUT  {"violations": [{rule_id,file,line,col,evidence,source_line}, ...]}
//
// RAW factual channel only — the detector applies ZERO disposition. It exits 0
// even when it finds violations (finding violations is not a run error); it exits
// non-zero only on a genuine runtime fault.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, sep, basename } from "node:path";
import { createHash } from "node:crypto";

const RULE_ID = "coder.convex.duplication-no-intra-layer";

const DEFAULT_EXCLUDES = ["_generated", "node_modules", "dist", "build", ".next", ".nuxt", "coverage"];
const TS_EXT = new Set([".ts", ".tsx"]);
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;
const DTS_RE = /\.d\.ts$/;
const BARREL_RE = /^index\.[cm]?[jt]sx?$/;
const WINDOW = 6; // non-trivial normalized lines per fingerprint window

// Structural keywords preserved during normalization (everything else -> ID).
const KEYWORDS = new Set([
  "abstract", "any", "as", "async", "await", "boolean", "break", "case", "catch",
  "class", "const", "continue", "default", "delete", "do", "else", "enum", "export",
  "extends", "false", "finally", "for", "from", "function", "get", "if", "implements",
  "import", "in", "instanceof", "interface", "let", "new", "null", "number", "of",
  "private", "protected", "public", "readonly", "return", "set", "static", "string",
  "super", "switch", "this", "throw", "true", "try", "type", "typeof", "undefined",
  "void", "while", "yield",
]);

function layerOfToken(tok) {
  switch (tok) {
    case "api":
      return "presentation";
    case "application":
      return "application";
    case "domain":
      return "domain";
    case "integration":
      return "integration";
    default:
      return null;
  }
}

function classifyLayer(p) {
  const baseNoExt = basename(p).replace(/\.[cm]?[jt]sx?$/, "");
  const byBase = layerOfToken(baseNoExt);
  if (byBase) return byBase;
  for (const seg of p.split(sep)) {
    const l = layerOfToken(seg);
    if (l) return l;
  }
  return null; // unknown layer — excluded from comparison
}

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
    if (TS_EXT.has(extname(root)) && !TEST_RE.test(root) && !DTS_RE.test(root)) yield root;
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
    else if (TS_EXT.has(extname(full)) && !TEST_RE.test(full) && !DTS_RE.test(full)) yield full;
  }
}

// Normalize one source line to its structural shape; "" if it collapses to nothing.
function normalizeLine(line) {
  let s = line.replace(/\/\/.*$/, ""); // strip line comment
  s = s.replace(/(['"`])(?:\\.|(?!\1).)*\1/g, "S"); // strings -> S
  s = s.replace(/\b\d[\d_.eE+-]*\b/g, "0"); // numbers -> 0
  s = s.replace(/[A-Za-z_$][\w$]*/g, (id) => (KEYWORDS.has(id) ? id : "ID")); // idents -> ID
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

// A line is trivial when it carries no structural content (bare brackets/punct).
function isTrivial(norm) {
  return norm === "" || /^[{}()\[\];,.]+$/.test(norm);
}

// Build the list of non-trivial normalized lines + their original 1-based numbers.
function nonTrivialLines(text) {
  // Strip block comments across the whole text first.
  const noBlock = text.replace(/\/\*[\s\S]*?\*\//g, "");
  const lines = noBlock.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const norm = normalizeLine(lines[i]);
    if (!isTrivial(norm)) out.push({ norm, line: i + 1 });
  }
  return out;
}

function main() {
  const reportPath = process.env.ATDD_VIOLATIONS_REPORT;
  if (!reportPath) {
    process.stderr.write("convex-detector: ATDD_VIOLATIONS_REPORT not set\n");
    process.exit(2);
  }
  const roots = parseJsonEnv("ATDD_SCAN_ROOTS", []);
  const excludes = [...DEFAULT_EXCLUDES, ...parseJsonEnv("ATDD_SCAN_EXCLUDES", [])];

  // Collect comparable files (classified, non-barrel), deterministic order.
  const files = [];
  const seen = new Set();
  for (const root of roots) {
    for (const f of walk(root, excludes)) {
      if (seen.has(f)) continue;
      seen.add(f);
      if (BARREL_RE.test(basename(f))) continue;
      const layer = classifyLayer(f);
      if (!layer) continue;
      files.push({ file: f, layer });
    }
  }
  files.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));

  // hash -> [{file, layer, line}], windowing >= WINDOW non-trivial lines.
  const byHash = new Map();
  for (const { file, layer } of files) {
    let text = "";
    try {
      text = readFileSync(file, "utf8");
    } catch {
      text = "";
    }
    const nt = nonTrivialLines(text);
    for (let i = 0; i + WINDOW <= nt.length; i++) {
      const slice = nt.slice(i, i + WINDOW);
      const key = slice.map((x) => x.norm).join("\n");
      const hash = createHash("sha256").update(`${layer}\n${key}`).digest("hex");
      if (!byHash.has(hash)) byHash.set(hash, []);
      byHash.get(hash).push({ file, layer, line: slice[0].line });
    }
  }

  // A hash shared across two different files of the same layer is a collision.
  // Dedup to one violation per unordered file-pair within a layer.
  const reportedPairs = new Set();
  const violations = [];
  for (const occ of byHash.values()) {
    if (occ.length < 2) continue;
    for (let a = 0; a < occ.length; a++) {
      for (let b = a + 1; b < occ.length; b++) {
        if (occ[a].file === occ[b].file) continue; // same-file repetition is out of scope
        if (occ[a].layer !== occ[b].layer) continue; // different layers — not intra-layer
        const [first, second] =
          occ[a].file < occ[b].file ? [occ[a], occ[b]] : [occ[b], occ[a]];
        const pairKey = `${first.layer}|${first.file}|${second.file}`;
        if (reportedPairs.has(pairKey)) continue;
        reportedPairs.add(pairKey);
        violations.push({
          rule_id: RULE_ID,
          file: second.file,
          line: second.line,
          col: 1,
          evidence: `structurally identical fragment (>= ${WINDOW} lines) duplicated in the ${second.layer} layer; also in ${basename(first.file)}`,
          source_line: "",
        });
      }
    }
  }
  // Deterministic output order.
  violations.sort((x, y) =>
    x.file < y.file ? -1 : x.file > y.file ? 1 : x.line - y.line,
  );

  writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
  process.stderr.write(
    `convex-detector: scanned ${files.length} file(s), ${violations.length} violation(s)\n`,
  );
  process.exit(0); // run-health OK regardless of violation count (RAW channel)
}

main();
