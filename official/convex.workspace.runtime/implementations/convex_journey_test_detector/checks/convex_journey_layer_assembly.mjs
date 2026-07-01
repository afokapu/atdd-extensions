#!/usr/bin/env node
// Detector: tester.convex.journey-layer-assembly  (disposition: documentation-only)
//
// A journey test's `// Layer:` header, when present, MUST be `assembly`. Flags any
// non-assembly layer declared on a journey test.
import { writeFileSync } from "node:fs";
import { iterTestFiles, readText, parseHeader } from "./_shared.mjs";

const RULE_ID = "tester.convex.journey-layer-assembly";

function main() {
  const reportPath = process.env.ATDD_VIOLATIONS_REPORT;
  if (!reportPath) { process.stderr.write("convex-detector: ATDD_VIOLATIONS_REPORT not set\n"); process.exit(2); }
  const violations = [];
  for (const file of iterTestFiles()) {
    const text = readText(file);
    if (text == null) continue;
    const h = parseHeader(text);
    if (!h.isJourney) continue;
    if (!h.layer) continue; // no Layer: header — completeness concern, not a value one
    if (h.layer.toLowerCase() === "assembly") continue;
    violations.push({
      rule_id: RULE_ID,
      file,
      line: h.layerLine || 1,
      col: 1,
      evidence: `journey test declares Layer "${h.layer}" — journey tests MUST be Layer: assembly`,
      source_line: (h.lines[(h.layerLine || 1) - 1] || "").trim(),
    });
  }
  writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
  process.stderr.write(`convex-detector: ${violations.length} violation(s)\n`);
  process.exit(0);
}
main();
