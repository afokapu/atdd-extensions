#!/usr/bin/env node
// Detector: tester.convex.live-smoke-no-self-skip  (disposition: strict)
//
// A Convex/Vitest test carrying a LIVE-SMOKE identity must run-or-fail against real
// infrastructure — it must never SELF-SKIP. A skipped live-smoke test passes
// vacuously: the SMOKE phase goes green without the real-infra claim ever being
// exercised (a false green — cf. core #1076). This is the Convex/Vitest sibling of
// the core `tester.acceptance-violation.live-smoke-acceptance-must-execute` (whose
// python rendering forbids pytest.skip / importorskip / mark.skip(if)).
//
// This detector (1) classifies each `*.test.ts`/`*.spec.ts` under the supplied scan
// roots as live-smoke via its URN header (`Phase: SMOKE`/`LIVE_SMOKE`,
// `execution_kind: live_smoke`) or basename (`*.smoke.test.ts` / `*.live.test.ts` /
// `*.live-smoke.test.ts`), and (2) flags every self-skip call site inside those
// files. Ordinary (non-live-smoke) tests are out of scope — they may `it.skip`.
//
// CONTRACT (convex.workspace.runtime v1.1 — the JS sibling of the python-pytest
// provider contract). The provider (adapter/run.py) shells out to `node` over THIS
// file and communicates ONLY through env + a JSON report file:
//
//   INPUT   env ATDD_SCAN_ROOTS     JSON array of dir/file roots to inspect.
//           env ATDD_SCAN_EXCLUDES  JSON array of substring/segment excludes (optional).
//           env ATDD_VIOLATIONS_REPORT  path to write the JSON report to.
//   OUTPUT  {"violations": [{rule_id,file,line,col,evidence,source_line}, ...]}
//
// RAW factual channel only — the detector applies ZERO disposition. It exits 0 even
// when it finds violations (a self-skip is not a run error); it exits non-zero only
// on a genuine runtime fault. Zero dependencies, no AST.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, basename, sep } from "node:path";

const RULE_ID = "tester.convex.live-smoke-no-self-skip";

// Directories/segments never inspected: generated client code, deps, build out.
const DEFAULT_EXCLUDES = ["_generated", "node_modules", "dist", "build", ".next"];

// A file that is plainly a test by extension — `*.test.*` / `*.spec.*` (ts/tsx/js/mjs).
const TEST_FILE_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

// Live-smoke BY BASENAME: `foo.smoke.test.ts` / `foo.live.test.ts` / `foo.live-smoke.test.ts`.
const LIVE_SMOKE_BASENAME_RE = /\.(smoke|live|live-smoke)\.(test|spec)\.[cm]?[jt]sx?$/i;

// Live-smoke BY HEADER: a `Phase: SMOKE`/`LIVE_SMOKE` marker or `execution_kind: live_smoke`
// (typically in the `// URN:` header block). Matched over raw source; the header comment is
// the realistic carrier.
const HEADER_PHASE_RE = /\bPhase\s*:\s*(SMOKE|LIVE[_-]?SMOKE)\b/i;
const HEADER_EXECKIND_RE = /\bexecution[_-]?kind\s*[:=]\s*["']?live[_-]?smoke\b/i;

// Self-skip call sites (scanned over a string/comment-masked copy so a "skip" inside
// a literal or comment is never flagged). Each entry describes one call site.
const SKIP_PATTERNS = [
  {
    re: /\b(describe|it|test|suite)\s*\.\s*(skip|skipIf|todo)\b/g,
    evidence: (m) => `${m[1]}.${m[2]}(...) self-skip in a live-smoke test`,
  },
  {
    re: /\b(describe|it|test|suite)\s*\.\s*runIf\b/g,
    evidence: (m) => `${m[1]}.runIf(...) conditional run (can silence a live-smoke test)`,
  },
  {
    re: /\b(ctx|context)\s*\.\s*skip\s*\(/g,
    evidence: (m) => `${m[1]}.skip() in-body skip in a live-smoke test`,
  },
  {
    re: /\b(liveSmokeAvailable|isLiveSmoke|smokeAvailable|liveAvailable|live_smoke_available)\s*\(/gi,
    evidence: (m) => `live-smoke availability guard '${m[1]}(...)' gates execution (must run-or-fail)`,
  },
];

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
    return; // missing root — skip silently; a missing scan root is not a fault
  }
  if (st.isFile()) {
    if (TEST_FILE_RE.test(root)) yield root;
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
    } else if (TEST_FILE_RE.test(full)) {
      yield full;
    }
  }
}

// A test file is live-smoke if its basename OR its (raw) header declares it so.
function isLiveSmoke(file, rawText) {
  if (LIVE_SMOKE_BASENAME_RE.test(basename(file))) return true;
  if (HEADER_PHASE_RE.test(rawText)) return true;
  if (HEADER_EXECKIND_RE.test(rawText)) return true;
  return false;
}

// Blank out line comments, block comments, and single/double/template string bodies
// (replaced with spaces, newlines preserved) so skip-primitive scanning never trips
// on the word "skip" inside a literal or comment. Positions are preserved 1:1, so
// line/col map straight back to the original source.
function maskSource(text) {
  const out = Array.from(text);
  const n = text.length;
  let i = 0;
  let state = "code";
  while (i < n) {
    const c = text[i];
    const d = i + 1 < n ? text[i + 1] : "";
    if (state === "code") {
      if (c === "/" && d === "/") { out[i] = " "; out[i + 1] = " "; i += 2; state = "line"; continue; }
      if (c === "/" && d === "*") { out[i] = " "; out[i + 1] = " "; i += 2; state = "block"; continue; }
      if (c === "'") { out[i] = " "; i++; state = "sq"; continue; }
      if (c === '"') { out[i] = " "; i++; state = "dq"; continue; }
      if (c === "`") { out[i] = " "; i++; state = "tpl"; continue; }
      i++; continue;
    }
    if (state === "line") {
      if (c === "\n") { state = "code"; i++; continue; }
      out[i] = " "; i++; continue;
    }
    if (state === "block") {
      if (c === "*" && d === "/") { out[i] = " "; out[i + 1] = " "; i += 2; state = "code"; continue; }
      if (c !== "\n") out[i] = " ";
      i++; continue;
    }
    if (state === "sq" || state === "dq") {
      const q = state === "sq" ? "'" : '"';
      if (c === "\\") { out[i] = " "; if (i + 1 < n && text[i + 1] !== "\n") out[i + 1] = " "; i += 2; continue; }
      if (c === q) { out[i] = " "; i++; state = "code"; continue; }
      if (c !== "\n") out[i] = " ";
      i++; continue;
    }
    if (state === "tpl") {
      if (c === "\\") { out[i] = " "; if (i + 1 < n && text[i + 1] !== "\n") out[i + 1] = " "; i += 2; continue; }
      if (c === "`") { out[i] = " "; i++; state = "code"; continue; }
      if (c !== "\n") out[i] = " ";
      i++; continue;
    }
  }
  return out.join("");
}

function scanFile(file, violations) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return;
  }
  if (!isLiveSmoke(file, text)) return; // only live-smoke tests are in scope

  const origLines = text.split(/\r?\n/);
  const masked = maskSource(text);
  const maskedLines = masked.split(/\r?\n/);

  for (let i = 0; i < maskedLines.length; i++) {
    const mline = maskedLines[i];
    for (const { re, evidence } of SKIP_PATTERNS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(mline)) !== null) {
        violations.push({
          rule_id: RULE_ID,
          file,
          line: i + 1,
          col: m.index + 1,
          evidence: evidence(m),
          source_line: (origLines[i] || "").trim(),
        });
        if (m.index === re.lastIndex) re.lastIndex++; // guard against zero-width
      }
    }
  }
}

function main() {
  const reportPath = process.env.ATDD_VIOLATIONS_REPORT;
  if (!reportPath) {
    process.stderr.write("convex-detector: ATDD_VIOLATIONS_REPORT not set\n");
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
    `convex-detector: scanned ${roots.length} root(s), ${violations.length} violation(s)\n`,
  );
  process.exit(0); // run-health OK regardless of violation count (RAW channel)
}

main();
