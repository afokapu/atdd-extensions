#!/usr/bin/env node
// Detector: tester.convex.telemetry-emit  (disposition: documentation-only)
//
// Convex/Vitest realization of the agnostic tester rule `tester.telemetry.emit`
// ("Telemetry tests assert that the validator emits the expected events to the
// configured sink"). A Vitest test file under the Convex function tree that IS a
// telemetry test — its `// URN: test:...-TELEMETRY|EVENT|METRIC-NNN` header, or a
// URN-derived / telemetry-rendered basename (`m001-telemetry-001-…test.ts`,
// `…-event-NNN.test.ts`, `*.telemetry.test.ts`) — MUST assert that a signal was
// EMITTED to the sink: a spy assertion (`toHaveBeenCalled[With]`) or an
// `expect(...)` referencing an emission (`.emit`/`.capture`/`.track`/`.emitted`).
// A telemetry test that only checks a return value never proves the signal reached
// the sink: it is a silent green gap.
//
// The IDENTITY-of-a-test-comes-from-its-URN-header invariant stays in CORE; only the
// per-stack rendering lives here. This detector flags each telemetry test file that
// makes no emission assertion.
//
// CONTRACT (convex.workspace.runtime v1.1): reads ATDD_SCAN_ROOTS / ATDD_SCAN_EXCLUDES,
// writes RAW {rule_id,file,line,col,evidence,source_line} to ATDD_VIOLATIONS_REPORT,
// exits 0 regardless of violation count. Zero deps, no AST.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, basename, sep } from "node:path";

const RULE_ID = "tester.convex.telemetry-emit";
const DEFAULT_EXCLUDES = ["_generated", "node_modules", "dist", "build", ".next"];
const TEST_FILE_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

// A test file is a TELEMETRY test if its URN header carries a TELEMETRY/EVENT/METRIC
// harness, or its basename renders one (`m001-telemetry-001-…`, `…-event-001`), or
// the basename is a `*.telemetry.test.ts` colocation.
const URN_TEL_RE = /\/\/\s*URN:\s*test:[^\n]*-(TELEMETRY|EVENT|METRIC)-\d/i;
const NAME_TEL_RE = /-(telemetry|event|metric)-\d|\.telemetry\.(test|spec)\./i;

// An emission assertion — the proof the test asserts the sink received the signal.
// Either a spy assertion (`toHaveBeenCalled[With/Times]`) or an expect(...) whose
// subject is an emission verb (`.emit`/`.capture`/`.track`/`.emitted`).
const EMIT_ASSERT_RE =
  /toHaveBeenCalled(?:With|Times)?\b|expect\([^)\n]*\.(?:emit|capture|track|emitted)\b|\.emitted\b/i;

function parseJsonEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : fallback; } catch { return fallback; }
}
function isExcluded(path, excludes) {
  const segs = path.split(sep);
  return excludes.some((ex) => segs.includes(ex) || path.includes(ex));
}
function* walk(root, excludes) {
  let st;
  try { st = statSync(root); } catch { return; }
  if (st.isFile()) { if (TEST_FILE_RE.test(root)) yield root; return; }
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    if (isExcluded(full, excludes)) continue;
    let cst;
    try { cst = statSync(full); } catch { continue; }
    if (cst.isDirectory()) yield* walk(full, excludes);
    else if (TEST_FILE_RE.test(full)) yield full;
  }
}
function isTelemetryTest(base, text) {
  return NAME_TEL_RE.test(base) || URN_TEL_RE.test(text);
}
function urnLine(text) {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) if (/\/\/\s*URN:\s*test:/i.test(lines[i])) return i + 1;
  return 1;
}
function checkFile(file, violations) {
  let text;
  try { text = readFileSync(file, "utf8"); } catch { return; }
  const base = basename(file);
  if (!isTelemetryTest(base, text)) return;
  if (EMIT_ASSERT_RE.test(text)) return; // asserts the sink received the signal
  const line = urnLine(text);
  const source = (text.split(/\r?\n/)[line - 1] || base).trim();
  violations.push({
    rule_id: RULE_ID,
    file,
    line,
    col: 1,
    evidence:
      `telemetry test "${base}" makes no emission assertion ` +
      `(expected toHaveBeenCalled[With] on the sink, or expect(sink.emit|capture|track))`,
    source_line: source,
  });
}
function main() {
  const reportPath = process.env.ATDD_VIOLATIONS_REPORT;
  if (!reportPath) { process.stderr.write("convex-detector: ATDD_VIOLATIONS_REPORT not set\n"); process.exit(2); }
  const roots = parseJsonEnv("ATDD_SCAN_ROOTS", []);
  const excludes = [...DEFAULT_EXCLUDES, ...parseJsonEnv("ATDD_SCAN_EXCLUDES", [])];
  const violations = [];
  for (const root of roots) for (const file of walk(root, excludes)) checkFile(file, violations);
  writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
  process.stderr.write(`convex-detector: scanned ${roots.length} root(s), ${violations.length} violation(s)\n`);
  process.exit(0);
}
main();
