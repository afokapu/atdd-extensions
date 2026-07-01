#!/usr/bin/env node
// Detector: tester.convex.smoke-no-collaborator-substitution  (disposition: suppress-and-clean)
//
// The Convex/TypeScript sibling of the CORE python-only rule
// `tester.smoke.no-collaborator-substitution` (#704). A SMOKE test must exercise
// the REAL subject. A test that substitutes one of the subject's collaborators —
// by faking infrastructure (`vi.fn(`, `vi.mock(`, `jest.fn(`, `jest.mock(`), or by
// stubbing behavior over a real object (`vi.spyOn(...).mockImplementation/
// mockReturnValue/mockResolvedValue`), or by assigning a locally-defined
// function/lambda over an object attribute (`obj.method = () => ...`) — is a unit
// test wearing a SMOKE label: it passes CI while exercising nothing real. CORE
// scopes its own detector to Python and names this exact realization the follow-up:
// "TS smoke tests (consumer-repo frontend e2e) are a #704 follow-up."
//
// SCOPE — only files that ARE smoke tests: a `*.test.ts`/`*.spec.ts` (or `.tsx`)
// whose basename contains `smoke`, or whose header declares `Phase: SMOKE` /
// `Smoke: true`. Non-smoke tests legitimately mock and are never flagged.
//
// CONTRACT (convex.workspace.runtime v1.1): reads ATDD_SCAN_ROOTS /
// ATDD_SCAN_EXCLUDES, writes RAW {rule_id,file,line,col,evidence,source_line} to
// ATDD_VIOLATIONS_REPORT, exits 0 regardless of violation count. Zero deps, no AST.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, sep, basename } from "node:path";

const RULE_ID = "tester.convex.smoke-no-collaborator-substitution";
const DEFAULT_EXCLUDES = ["_generated", "node_modules", "dist", "build", ".next"];
const TS_EXT = new Set([".ts", ".tsx"]);
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

// Infrastructure faking + behavior substitution patterns.
const SUBSTITUTION_PATTERNS = [
  { re: /\bvi\.fn\s*\(/, why: "vi.fn(...) fakes a collaborator instead of driving the real one" },
  { re: /\bvi\.mock\s*\(/, why: "vi.mock(...) replaces a real module — a smoke test must import the real one" },
  { re: /\bjest\.fn\s*\(/, why: "jest.fn(...) fakes a collaborator instead of driving the real one" },
  { re: /\bjest\.mock\s*\(/, why: "jest.mock(...) replaces a real module — a smoke test must import the real one" },
  { re: /\.mockImplementation\s*\(/, why: "spy .mockImplementation(...) substitutes a collaborator's behavior" },
  { re: /\.mockReturnValue\s*\(/, why: "spy .mockReturnValue(...) substitutes a collaborator's return" },
  { re: /\.mockResolvedValue\s*\(/, why: "spy .mockResolvedValue(...) substitutes a collaborator's resolved value" },
  // obj.method = () => ... / = async () => ... / = function ...  (attribute reassignment)
  { re: /\b[\w$]+\.[\w$]+\s*=\s*(?:async\s*)?(?:\([^)]*\)|[\w$]+)\s*=>/, why: "assigns a local lambda over an object attribute (collaborator substitution)" },
  { re: /\b[\w$]+\.[\w$]+\s*=\s*(?:async\s*)?function\b/, why: "assigns a local function over an object attribute (collaborator substitution)" },
];

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
  if (st.isFile()) { if (TS_EXT.has(extname(root))) yield root; return; }
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    if (isExcluded(full, excludes)) continue;
    let cst;
    try { cst = statSync(full); } catch { continue; }
    if (cst.isDirectory()) yield* walk(full, excludes);
    else if (TS_EXT.has(extname(full))) yield full;
  }
}
function isSmokeTest(file, text) {
  const b = basename(file).toLowerCase();
  if (!TEST_RE.test(b)) return false;
  if (b.includes("smoke")) return true;
  const head = text.slice(0, 2000);
  return /(^|\n)\s*(?:\/\/|#)\s*Phase:\s*SMOKE\b/.test(head) || /(^|\n)\s*(?:\/\/|#)\s*Smoke:\s*true\b/i.test(head);
}
function main() {
  const reportPath = process.env.ATDD_VIOLATIONS_REPORT;
  if (!reportPath) { process.stderr.write("convex-detector: ATDD_VIOLATIONS_REPORT not set\n"); process.exit(2); }
  const roots = parseJsonEnv("ATDD_SCAN_ROOTS", []);
  const excludes = [...DEFAULT_EXCLUDES, ...parseJsonEnv("ATDD_SCAN_EXCLUDES", [])];
  const violations = [];
  for (const root of roots) {
    for (const file of walk(root, excludes)) {
      let text;
      try { text = readFileSync(file, "utf8"); } catch { continue; }
      if (!isSmokeTest(file, text)) continue;
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (const p of SUBSTITUTION_PATTERNS) {
          const m = p.re.exec(line);
          if (m) {
            violations.push({ rule_id: RULE_ID, file, line: i + 1, col: m.index + 1, evidence: p.why, source_line: line.trim() });
            break; // one violation per line is enough
          }
        }
      }
    }
  }
  writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
  process.stderr.write("convex-detector: " + violations.length + " smoke-substitution violation(s)\n");
  process.exit(0);
}
main();
