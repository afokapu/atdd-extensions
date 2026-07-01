#!/usr/bin/env node
// Detector: tester.convex.journey-urn-format  (disposition: documentation-only)
//
// A journey test's `// URN:` header MUST match
// `test:train:{train_id}:{HARNESS}-{NNN}-{slug}`. Flags a present-but-malformed URN.
import { writeFileSync } from "node:fs";
import { iterTestFiles, readText, parseHeader, JOURNEY_URN_RE } from "./_shared.mjs";

const RULE_ID = "tester.convex.journey-urn-format";

function main() {
  const reportPath = process.env.ATDD_VIOLATIONS_REPORT;
  if (!reportPath) { process.stderr.write("convex-detector: ATDD_VIOLATIONS_REPORT not set\n"); process.exit(2); }
  const violations = [];
  for (const file of iterTestFiles()) {
    const text = readText(file);
    if (text == null) continue;
    const h = parseHeader(text);
    if (!h.isJourney) continue;
    if (!h.urn) continue; // absence of a URN is a header-completeness concern, not a format one
    if (JOURNEY_URN_RE.test(h.urn)) continue;
    violations.push({
      rule_id: RULE_ID,
      file,
      line: h.urnLine || 1,
      col: 1,
      evidence: `journey test URN "${h.urn}" does not match test:train:{train_id}:{HARNESS}-{NNN}-{slug}`,
      source_line: (h.lines[(h.urnLine || 1) - 1] || "").trim(),
    });
  }
  writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
  process.stderr.write(`convex-detector: ${violations.length} violation(s)\n`);
  process.exit(0);
}
main();
