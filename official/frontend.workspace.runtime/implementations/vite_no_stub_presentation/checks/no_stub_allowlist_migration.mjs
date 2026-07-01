#!/usr/bin/env node
// Detector: no-stub allowlist migration field  (family member emitting 1 rule_id)
//
//   coder.vite.presentation-nostub-allowlist-migration  (NOSTUB-010, sev 2)
//
// Vite/React realization of frontend.convention.yaml::no_stub_presentation NOSTUB-010:
// "Allowlist entry must include a `migration:` field referencing the issue that will
// eliminate the exemption." Ports the allowlist half of
// src/atdd/coder/validators/test_no_stub_presentation_returns.py (`_load_allowlist`):
// every entry under `.atdd/config.yaml -> no_stub_presentation.allowlist` that lacks a
// non-empty `migration:` field is flagged, so a suppression can never be permanent.
//
// CONTRACT (frontend.workspace.runtime v1.1): env ATDD_SCAN_ROOTS / ATDD_SCAN_EXCLUDES
// in, {"violations":[...]} to ATDD_VIOLATIONS_REPORT. RAW channel — always exit 0.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, sep, basename } from "node:path";

const RULE_ALLOWLIST_MIGRATION = "coder.vite.presentation-nostub-allowlist-migration";
const DEFAULT_EXCLUDES = ["node_modules", "dist", "build", ".next"];

function parseJsonEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : fallback; } catch { return fallback; }
}
function isExcluded(path, excludes) {
  const segs = path.split(sep);
  return excludes.some((ex) => segs.includes(ex) || path.includes(ex));
}
function isConfig(path) {
  const p = path.replace(/\\/g, "/");
  return basename(p) === "config.yaml" && p.includes("/.atdd/");
}
function* walk(root, excludes) {
  let st; try { st = statSync(root); } catch { return; }
  if (st.isFile()) { if (isConfig(root)) yield root; return; }
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    if (isExcluded(full, excludes)) continue;
    let cst; try { cst = statSync(full); } catch { continue; }
    if (cst.isDirectory()) yield* walk(full, excludes);
    else if (isConfig(full)) yield full;
  }
}

// Tolerant line scan of the `no_stub_presentation: allowlist:` block. Each list item
// starts at `- path:`; the item spans until the next `- ` at the same indent or a
// dedent out of the allowlist block. An item is a violation if no `migration:` key
// with a non-empty value appears within it.
function scanConfig(file, violations) {
  let text; try { text = readFileSync(file, "utf8"); } catch { return; }
  const lines = text.split(/\r?\n/);
  let inBlock = false, blockIndent = -1;
  let cur = null; // { line, path, indent, hasMigration }
  const flush = () => {
    if (cur && !cur.hasMigration) {
      violations.push({
        rule_id: RULE_ALLOWLIST_MIGRATION, file, line: cur.line, col: 1,
        evidence: `no_stub_presentation allowlist entry '${cur.path}' is missing a 'migration:' field referencing the issue that will de-stub it`,
        source_line: (lines[cur.line - 1] || "").trim(),
      });
    }
    cur = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*#/.test(line) || line.trim() === "") continue;
    const indent = line.length - line.replace(/^\s*/, "").length;
    if (!inBlock) {
      if (/^\s*allowlist:\s*$/.test(line)) { inBlock = true; blockIndent = indent; }
      continue;
    }
    // A dedent to <= blockIndent that is not a list item ends the block.
    const itemM = line.match(/^(\s*)-\s+path:\s*(.+?)\s*$/);
    if (indent <= blockIndent && !/^\s*-/.test(line)) { flush(); inBlock = false; continue; }
    if (itemM) { flush(); cur = { line: i + 1, path: itemM[2].replace(/^["']|["']$/g, ""), indent: itemM[1].length, hasMigration: false }; continue; }
    if (cur && /^\s*migration:\s*\S/.test(line)) cur.hasMigration = true;
  }
  flush();
}

function main() {
  const reportPath = process.env.ATDD_VIOLATIONS_REPORT;
  if (!reportPath) { process.stderr.write("nostub-allowlist: ATDD_VIOLATIONS_REPORT not set\n"); process.exit(2); }
  const roots = parseJsonEnv("ATDD_SCAN_ROOTS", []);
  const excludes = [...DEFAULT_EXCLUDES, ...parseJsonEnv("ATDD_SCAN_EXCLUDES", [])];
  const violations = [];
  for (const root of roots) for (const file of walk(root, excludes)) scanConfig(file, violations);
  writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
  process.stderr.write(`nostub-allowlist: ${violations.length} violation(s)\n`);
  process.exit(0);
}
main();
