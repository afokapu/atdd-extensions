#!/usr/bin/env node
// FAMILY validator: vite_design_hierarchy_detector
// Runs each member check (checks/*.mjs) VERBATIM as a subprocess and merges their
// RAW v1.1 reports into one. ONE implementation realizing a family of rule_ids
// (Core pattern). Member detection logic is preserved; each member additionally
// carries a DESIGN-LAYER SCOPE GATE (mirrors the interlocking/train-e2e no-op) AND a
// SELF-SCOPING file-signature guard (Vite/React detector): it SKIPS `.astro` files — an
// Astro-stack artifact is never linted by a Vite React rule. RESIDUE the extension
// cannot decide — a `.tsx` legal in both a Vite app and an Astro island — is left to the
// consumer scope map, not this guard.
//
// Emits the three design-system HIERARCHY gap rules the prior wave missed
// (tokens-pure / dependency-flow / wagons-import), siblings of the agnostic
// design.convention.yaml obligations DESIGN-HIERARCHY-001/002/003.
//
// DESIGN-LAYER NO-OP — per-check decision (all three NO-OP when no design layer):
//   * design-tokens-pure     NO-OP — presupposes a design-token layer whose values
//                            must be pure. No tokens → out of scope.
//   * design-dependency-flow NO-OP — presupposes the design-system layer hierarchy
//                            (tokens → primitives → components). Out of scope.
//   * design-wagons-import   NO-OP — presupposes design-system wagons/primitives to
//                            import from. Out of scope without a design layer.
// "Design layer present" is determined structurally in each check. These already
// scanned only design_system/ paths, so over the FRG consumer (no design layer)
// they were already 0; the gate makes the out-of-scope behavior explicit. The
// dirty fixtures live under src/design_system/ and keep firing.
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
process.stderr.write("family vite_design_hierarchy_detector: " + out.length + " violation(s)\n");
process.exit(0);
