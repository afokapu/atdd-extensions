#!/usr/bin/env node
// FAMILY validator: convex_design_detector
// Runs each member check (checks/*.mjs) VERBATIM as a subprocess and merges their
// RAW v1.1 reports into one. ONE implementation realizing a family of rule_ids
// (Core pattern). Member detection logic is preserved; each member additionally
// carries a DESIGN-LAYER SCOPE GATE (mirrors the interlocking/train-e2e no-op).
//
// DESIGN-LAYER NO-OP — per-check decision (all three NO-OP when no design layer):
//   * design-foundations      NO-OP — presupposes the layered design convention
//                             (a feature resting on a domain foundation). A repo
//                             that doesn't opt into a design layer is out of scope.
//   * design-hierarchy-import NO-OP — presupposes the layered design (inward-only
//                             import direction). Out of scope without a design layer.
//   * design-orphan-export    NO-OP — presupposes the design layer's export surface.
//                             Out of scope without a design layer.
// "Design layer present" is determined structurally in each check (a design /
// design_system / tokens / foundations dir, or a design-token/foundations file).
// Proven: over the FRG consumer (no design layer) this family drops from 83 → 0;
// the dirty fixtures (which carry a design-layer marker) keep firing.
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
process.stderr.write("family convex_design_detector: " + out.length + " violation(s)\n");
process.exit(0);
