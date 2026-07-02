#!/usr/bin/env node
// Detector: coder.vite.presentation-i18n-switcher  (disposition: strict)
//
// A language/locale switcher must drive the i18n change-language API with the
// locale the user picked — a value flowing from the supported-locale list — NOT a
// hardcoded string literal baked into the call site. A switcher that calls
// `setLang('en')` / `changeLanguage('fr')` with a literal cannot reflect the
// app's actual locale set and silently drifts from it. This detector flags any
// change-language call made with a hardcoded locale string inside a switcher
// component.
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

const RULE_ID = "coder.vite.presentation-i18n-switcher";

const DEFAULT_EXCLUDES = ["_generated", "node_modules", "dist", "build", ".next"];
const TS_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

// A switcher component: the basename carries BOTH a language/locale token and a
// switch/toggle/select/pick token (`LanguageToggle`, `LocaleSwitcher`, …).
const SWITCHER_FILE_RE = /^(?=.*(?:language|locale))(?=.*(?:switch|toggle|select|pick)).*\.[cm]?[jt]sx?$/i;

// A change-language call whose argument is a hardcoded locale string literal.
const HARDCODED_SWITCH_RE =
  /\b(?:setLang|setLanguage|setLocale|changeLanguage|change_language|switchLanguage|switchLocale|i18n\.changeLanguage)\s*\(\s*(['"])[A-Za-z][\w-]*\1\s*\)/;

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
  if (!SWITCHER_FILE_RE.test(basename(file))) return; // only switcher components
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return;
  }
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = HARDCODED_SWITCH_RE.exec(line);
    if (!m) continue;
    violations.push({
      rule_id: RULE_ID,
      file,
      line: i + 1,
      col: m.index + 1,
      evidence: "language switcher hardcodes a locale string instead of using the locale picked by the user",
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
    `vite-detector[i18n-switcher]: scanned ${roots.length} root(s), ${violations.length} violation(s)\n`,
  );
  process.exit(0);
}

main();
