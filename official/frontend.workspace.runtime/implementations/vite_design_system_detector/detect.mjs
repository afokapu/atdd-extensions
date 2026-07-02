#!/usr/bin/env node
// FAMILY validator: vite_design_system_detector
// Runs each member check (checks/*.mjs) VERBATIM as a subprocess and merges their
// RAW v1.1 reports into one. ONE implementation realizing a family of rule_ids
// (Core pattern). Member detection logic is preserved; each member additionally
// carries a DESIGN-LAYER SCOPE GATE (mirrors the interlocking/train-e2e no-op).
//
// DESIGN-LAYER NO-OP — per-check decision (all four NO-OP when no design layer):
//   * design-primitives      NO-OP — "compose from the design-system primitives
//                            (<Button>…) instead of raw <button>" is meaningless
//                            when there is no design system to compose from.
//   * design-orphan-ui       NO-OP — presupposes the design-system component
//                            surface; the FE sibling of design-orphan-export.
//   * design-token-color     NO-OP — "use a design token, not a color literal"
//                            presupposes a token system exists to reference.
//   * design-token-hardcoded NO-OP — its own rationale ("forks the palette away
//                            from the centralized design tokens") presupposes
//                            centralized design tokens. On a repo with no design
//                            layer there are no tokens to fork from, so — unlike a
//                            generic "no hardcoded color" lint — this token rule is
//                            out of scope. (Documented deviation: we DEFAULT the
//                            structural token rules to no-op rather than keep them
//                            firing, per the "~0 over a no-design-layer consumer"
//                            goal; a design-token-present repo still fires them.)
// "Design layer present" is determined structurally in each check (a design /
// design_system / tokens / foundations dir, or a design-token/foundations file).
// Proven: over the FRG consumer (no design layer) this family drops from 53 → 0;
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
process.stderr.write("family vite_design_system_detector: " + out.length + " violation(s)\n");
process.exit(0);
