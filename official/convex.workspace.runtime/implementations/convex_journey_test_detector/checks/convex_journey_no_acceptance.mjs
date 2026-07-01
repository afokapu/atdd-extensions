#!/usr/bin/env node
// Detector: tester.convex.journey-no-acceptance-marker  (disposition: documentation-only)
//
// A journey test MUST NOT carry an `// Acceptance:` or `// WMBT:` header line (journey
// and acceptance tests are mutually exclusive). Flags either marker on a journey test.
import { writeFileSync } from "node:fs";
import { iterTestFiles, readText, parseHeader } from "./_shared.mjs";

const RULE_ID = "tester.convex.journey-no-acceptance-marker";

function main() {
  const reportPath = process.env.ATDD_VIOLATIONS_REPORT;
  if (!reportPath) { process.stderr.write("convex-detector: ATDD_VIOLATIONS_REPORT not set\n"); process.exit(2); }
  const violations = [];
  for (const file of iterTestFiles()) {
    const text = readText(file);
    if (text == null) continue;
    const h = parseHeader(text);
    if (!h.isJourney) continue;
    for (const [marker, ln] of [["Acceptance", h.acceptLine], ["WMBT", h.wmbtLine]]) {
      if (!ln) continue;
      violations.push({
        rule_id: RULE_ID,
        file,
        line: ln,
        col: 1,
        evidence: `journey test carries an ${marker}: marker — journey and acceptance tests are mutually exclusive`,
        source_line: (h.lines[ln - 1] || "").trim(),
      });
    }
  }
  writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
  process.stderr.write(`convex-detector: ${violations.length} violation(s)\n`);
  process.exit(0);
}
main();
