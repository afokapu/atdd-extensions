#!/usr/bin/env node
// Detector: tester.convex.test-isolation-no-polluting-patterns  (disposition: strict)
//
// Convex/Vitest realization of the agnostic tester rule
// `tester.test-isolation.no-polluting-patterns`. A Vitest test file
// (`*.test.ts`/`*.spec.ts`) that shells out to git MUST NOT mutate shared git state
// outside a tmp-scoped path. Two pattern classes are flagged (the TS/Node rendering
// of the core's AST bare-mode-init + unscoped-core-bare-config patterns — the Wave 12
// contamination class):
//
//   A. UNSCOPED BARE INIT — a `git init --bare` whose target is not derived from a
//      tmp path (no os.tmpdir()/mkdtempSync()/tmp fixture on the statement). A bare
//      init pointed at the live worktree can rewrite shared `.git` state.
//
//   B. UNSCOPED core.bare CONFIG — a `git config core.bare true` with no isolation
//      flag (`--worktree`, `-C <tmp>`, or a `cwd:` option scoping it to a tmp dir).
//      Setting core.bare=true on the live worktree's shared .git/config is exactly
//      the Wave 12 incident (PRs #625/#627 pushed 220k-line deletions).
//
// SAFE equivalents (NOT flagged): a bare init into an os.tmpdir()/mkdtempSync() path;
// a core.bare config scoped via `git -C <tmp>`, a `cwd:` tmp option, or `--worktree`.
//
// CONTRACT (convex.workspace.runtime v1.1): reads ATDD_SCAN_ROOTS / ATDD_SCAN_EXCLUDES,
// writes RAW {rule_id,file,line,col,evidence,source_line} (one per offending line) to
// ATDD_VIOLATIONS_REPORT, exits 0 regardless of violation count. Zero deps, no AST.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";

const RULE_ID = "tester.convex.test-isolation-no-polluting-patterns";
const DEFAULT_EXCLUDES = ["_generated", "node_modules", "dist", "build", ".next"];
const TEST_FILE_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

// A line invokes git if it names the git binary as a shelled-out token.
const GIT_RE = /\bgit\b/;
// Bare-init tokens (string or array form): `init` … `--bare` on the same statement.
const BARE_INIT_RE = /\binit\b[\s\S]{0,60}?--bare|--bare[\s\S]{0,60}?\binit\b/;
// core.bare set to a truthy value via config.
const CORE_BARE_TRUE_RE = /core\.bare[\s\S]{0,20}?\btrue\b|["']core\.bare["'][\s\S]{0,20}?["']true["']/;
// A path derived from a tmp scope (the test-isolation-safe signal for bare init).
const TMP_SCOPE_RE = /tmpdir|mkdtemp|os\.tmpdir|tmp_?path|TMPDIR|\btmp\b|\/tmp|scratch/i;
// Isolation flags for a core.bare config: worktree-scoped, -C <dir>, or a cwd option.
const CONFIG_SCOPE_RE = /--worktree|(?:^|[\s'"\[,(])-C(?:$|[\s'"\],)])|\bcwd\b/;

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

function checkFile(file, violations) {
  let text;
  try { text = readFileSync(file, "utf8"); } catch { return; }
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Pattern A: unscoped bare init.
    if (GIT_RE.test(line) && BARE_INIT_RE.test(line) && !TMP_SCOPE_RE.test(line)) {
      violations.push({
        rule_id: RULE_ID,
        file,
        line: i + 1,
        col: 1,
        evidence:
          "unscoped `git init --bare` — bare-mode init whose target is not derived " +
          "from a tmp path (os.tmpdir()/mkdtempSync()); can rewrite shared .git state",
        source_line: line.trim(),
      });
      continue;
    }
    // Pattern B: unscoped core.bare config.
    if (CORE_BARE_TRUE_RE.test(line) && !CONFIG_SCOPE_RE.test(line)) {
      violations.push({
        rule_id: RULE_ID,
        file,
        line: i + 1,
        col: 1,
        evidence:
          "unscoped `git config core.bare true` — no isolation flag (--worktree, " +
          "-C <tmp>, or cwd tmp); mutates the shared worktree .git/config (Wave 12 class)",
        source_line: line.trim(),
      });
    }
  }
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
