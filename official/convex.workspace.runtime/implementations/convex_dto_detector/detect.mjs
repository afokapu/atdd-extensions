#!/usr/bin/env node
// FAMILY validator: convex_dto_detector
// Convex realization of core dto.convention.yaml's three obligations
// (DTO-PLACEMENT-001 / DTO-PURITY-001 / DTO-MAPPER-001): DTOs live in the neutral
// contracts module, DTOs are pure immutable data structures, and DTO<->domain
// mappers live in the integration layer. Runs each member check (checks/*.mjs)
// VERBATIM as a subprocess and merges their RAW v1.1 reports into one. ONE
// implementation realizing a family of rule_ids (Core pattern).
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
process.stderr.write("family convex_dto_detector: " + out.length + " violation(s)\n");
process.exit(0);
