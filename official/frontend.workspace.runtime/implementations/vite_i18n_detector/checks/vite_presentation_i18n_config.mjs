#!/usr/bin/env node
// Detector: coder.vite.presentation-i18n-config  (disposition: strict)
//
// A Vite/React i18n config/init module must wire the two things i18n needs to
// function: a PROVIDER that publishes the active locale to the component tree, and
// the RESOURCES (dictionaries / translation tables) the translator reads from. An
// i18n config that initializes localization but is missing either piece ships a
// half-wired runtime — components mount with no context, or the translator has no
// strings. This detector flags any recognized i18n config file that uses i18n but
// lacks the required provider/resources wiring.
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
import { join, extname, sep, basename } from "node:path";

const RULE_ID = "coder.vite.presentation-i18n-config";

const DEFAULT_EXCLUDES = ["_generated", "node_modules", "dist", "build", ".next"];
const TS_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

// Recognized i18n config/init modules: `i18n.ts(x)`, `i18nConfig.ts`, `i18n-config.ts`…
const I18N_FILE_RE = /^i18n([.-]?config)?\.[cm]?[jt]sx?$/i;

// The file actually sets up i18n (vs. merely mentioning the word in a comment).
const I18N_USE_RE =
  /\b(i18next|initReactI18next|createInstance|useTranslation|LanguageProvider|I18n(?:ext)?Provider|LanguageContext|createContext|\.init\s*\()/;

// Required wiring #1 — a provider component publishing locale to the tree.
const PROVIDER_RE = /\b[A-Z]\w*Provider\b/;
// Required wiring #2 — the resources/dictionaries the translator reads.
const RESOURCES_RE = /\b(resources|dictionaries|DICTIONARIES|translations|messages|DICT)\b/;

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
    } else if (extname(full) === ".astro") {
      continue; // SELF-SCOPING: never lint an Astro-stack `.astro` file (see header)
    } else if (TS_EXT.has(extname(full)) && !TEST_RE.test(full)) {
      yield full;
    }
  }
}

function scanFile(file, violations) {
  if (!I18N_FILE_RE.test(basename(file))) return; // only the i18n config surface
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return;
  }
  const lines = text.split(/\r?\n/);
  let useLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (I18N_USE_RE.test(lines[i])) {
      useLine = i;
      break;
    }
  }
  if (useLine === -1) return; // file does not actually set up i18n — inert

  const hasProvider = PROVIDER_RE.test(text);
  const hasResources = RESOURCES_RE.test(text);
  if (hasProvider && hasResources) return; // fully wired — absolved

  const missing = [];
  if (!hasProvider) missing.push("provider");
  if (!hasResources) missing.push("resources");
  violations.push({
    rule_id: RULE_ID,
    file,
    line: useLine + 1,
    col: 1,
    evidence: `i18n config initializes i18n but is missing required wiring: ${missing.join(", ")}`,
    source_line: lines[useLine].trim(),
  });
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
    `vite-detector[i18n-config]: scanned ${roots.length} root(s), ${violations.length} violation(s)\n`,
  );
  process.exit(0);
}

main();
