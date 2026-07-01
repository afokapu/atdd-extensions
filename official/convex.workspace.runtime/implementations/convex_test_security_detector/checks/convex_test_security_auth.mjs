#!/usr/bin/env node
// Detector: tester.convex.security-auth  (disposition: documentation-only)
//
// Convex/Vitest realization of the agnostic tester rule `tester.security.auth`
// ("Security-sensitive endpoints are covered by tests asserting auth and
// authorization"). A Vitest test file under the Convex function tree that IS a
// security test — its `// URN: test:…-SEC|RLS|AUTH-NNN` header, or a URN-derived
// basename `…-sec|rls|auth-NNN[-slug].test.ts` — MUST make at least one assertion
// tying an authentication/authorization outcome to a test expectation
// (`expect(...)` / `.rejects` / `.toThrow` co-located with an identity/auth/401/403
// token). A "security" test that never asserts on security is a silent green gap:
// it exercises the happy path and passes without ever proving the endpoint rejects
// an unauthenticated or unauthorized caller.
//
// The IDENTITY-of-a-test-comes-from-its-URN-header invariant stays in CORE; only the
// per-stack FILENAME/BODY rendering lives here. This detector flags each security
// test file that lacks an auth assertion.
//
// CONTRACT (convex.workspace.runtime v1.1): reads ATDD_SCAN_ROOTS / ATDD_SCAN_EXCLUDES,
// writes RAW {rule_id,file,line,col,evidence,source_line} to ATDD_VIOLATIONS_REPORT,
// exits 0 regardless of violation count (a gap is not a run error). Zero deps, no AST.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, basename, sep } from "node:path";

const RULE_ID = "tester.convex.security-auth";
const DEFAULT_EXCLUDES = ["_generated", "node_modules", "dist", "build", ".next"];
const TEST_FILE_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

// A test file is a SECURITY test if its URN header carries a SEC/RLS/AUTH harness,
// or its basename renders one (`d001-sec-001-…test.ts`).
const URN_SEC_RE = /\/\/\s*URN:\s*test:[^\n]*-(SEC|RLS|AUTH)-\d/i;
const NAME_SEC_RE = /-(sec|rls|auth)-\d/i;

// An auth/authorization assertion: an expectation verb near an identity/auth token
// (either order). This is what proves the test asserts on the security outcome.
const AUTH_TOKEN = "(auth|identity|unauthenticat|unauthoriz|forbidden|permission|401|403)";
const ASSERT_VERB = "(expect|rejects|toThrow|assert)";
const AUTH_ASSERT_RE = new RegExp(
  `${ASSERT_VERB}[^\\n]*${AUTH_TOKEN}|${AUTH_TOKEN}[^\\n]*${ASSERT_VERB}`,
  "i",
);

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

function isSecurityTest(base, text) {
  return NAME_SEC_RE.test(base) || URN_SEC_RE.test(text);
}

// Line of the URN header (1-based) if present, else 1 — where to anchor the finding.
function urnLine(text) {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (/\/\/\s*URN:\s*test:/i.test(lines[i])) return i + 1;
  }
  return 1;
}

function checkFile(file, violations) {
  let text;
  try { text = readFileSync(file, "utf8"); } catch { return; }
  const base = basename(file);
  if (!isSecurityTest(base, text)) return;
  if (AUTH_ASSERT_RE.test(text)) return; // asserts on an auth/authorization outcome
  const line = urnLine(text);
  const source = (text.split(/\r?\n/)[line - 1] || base).trim();
  violations.push({
    rule_id: RULE_ID,
    file,
    line,
    col: 1,
    evidence:
      `security test "${base}" makes no authentication/authorization assertion ` +
      `(expected an expect/rejects/toThrow tied to identity, auth, 401 or 403)`,
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
