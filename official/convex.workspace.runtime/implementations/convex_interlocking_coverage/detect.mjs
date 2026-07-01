#!/usr/bin/env node
// FAMILY validator: convex_interlocking_coverage
// Convex/TS realization of the core python `interlocking_coverage.py` detector — four strict
// tester.convex.interlocking-* rule_ids from ONE implementation (Core FAMILY pattern). Runs each member
// check (checks/*.mjs) VERBATIM as a subprocess and merges their RAW v1.1 reports into one.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const reportPath = process.env.ATDD_VIOLATIONS_REPORT;
if (!reportPath) {
  process.stderr.write("family: ATDD_VIOLATIONS_REPORT not set\n");
  process.exit(2);
}
const checks = readdirSync(join(here, "checks")).filter((f) => f.endsWith(".mjs"));
const td = mkdtempSync(join(tmpdir(), "atdd-fam-"));
const out = [];
for (const c of checks) {
  const rep = join(td, c + ".json");
  try {
    execFileSync(process.execPath, [join(here, "checks", c)], {
      env: { ...process.env, ATDD_VIOLATIONS_REPORT: rep },
      stdio: ["ignore", "ignore", "ignore"],
    });
  } catch {
    /* member may exit non-zero; still try its report */
  }
  try {
    out.push(...JSON.parse(readFileSync(rep, "utf8")).violations);
  } catch {
    /* member wrote no report */
  }
}
writeFileSync(reportPath, JSON.stringify({ violations: out }, null, 2), "utf8");
process.stderr.write("family convex_interlocking_coverage: " + out.length + " violation(s)\n");
process.exit(0);
