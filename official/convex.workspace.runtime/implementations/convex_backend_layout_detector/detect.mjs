#!/usr/bin/env node
// FAMILY validator: convex_backend_layout_detector
// Convex realization of core backend.convention.yaml's three layering invariants
// (BOUNDARIES-LAYER-001/002/003): code-is-organized-into-4-layers, component file
// suffix matches its layer's catalog, and imports respect the allowed dependency
// edges. Runs each member check (checks/*.mjs) VERBATIM as a subprocess and merges
// their RAW v1.1 reports into one. ONE implementation realizing a family of
// rule_ids (Core pattern). Member logic is preserved byte-for-byte.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const reportPath = process.env.ATDD_VIOLATIONS_REPORT;
if (!reportPath) { process.stderr.write("family: ATDD_VIOLATIONS_REPORT not set\n"); process.exit(2); }
const checks = readdirSync(join(here, "checks")).filter((f) => f.endsWith(".mjs"));
const td = mkdtempSync(join(tmpdir(), "atdd-fam-"));
const out = [];
for (const c of checks) {
  const rep = join(td, c + ".json");
  try {
    execFileSync(process.execPath, [join(here, "checks", c)],
      { env: { ...process.env, ATDD_VIOLATIONS_REPORT: rep }, stdio: ["ignore", "ignore", "ignore"] });
  } catch { /* member may exit non-zero; still try its report */ }
  try { out.push(...JSON.parse(readFileSync(rep, "utf8")).violations); } catch {}
}
writeFileSync(reportPath, JSON.stringify({ violations: out }, null, 2), "utf8");
process.stderr.write("family convex_backend_layout_detector: " + out.length + " violation(s)\n");
process.exit(0);
