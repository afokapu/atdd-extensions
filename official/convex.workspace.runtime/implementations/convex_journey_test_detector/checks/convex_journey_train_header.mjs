#!/usr/bin/env node
// Detector: tester.convex.journey-train-header  (disposition: documentation-only)
//
// A journey test (a *.test.ts whose header carries a `test:train:` URN or a `Train:`
// marker) MUST carry a `// Train:` header referencing a valid train URN matching
// `train:\d{4}-[a-z0-9][a-z0-9-]*`. Flags a missing or malformed Train header.
import { writeFileSync } from "node:fs";
import { iterTestFiles, readText, parseHeader, TRAIN_URN_RE } from "./_shared.mjs";

const RULE_ID = "tester.convex.journey-train-header";

function main() {
  const reportPath = process.env.ATDD_VIOLATIONS_REPORT;
  if (!reportPath) { process.stderr.write("convex-detector: ATDD_VIOLATIONS_REPORT not set\n"); process.exit(2); }
  const violations = [];
  for (const file of iterTestFiles()) {
    const text = readText(file);
    if (text == null) continue;
    const h = parseHeader(text);
    if (!h.isJourney) continue;
    const valid = h.train && TRAIN_URN_RE.test(h.train);
    if (valid) continue;
    const line = h.trainLine || h.urnLine || 1;
    violations.push({
      rule_id: RULE_ID,
      file,
      line,
      col: 1,
      evidence: h.train
        ? `journey test Train header "${h.train}" is not a valid train URN (train:{NNNN}-{kebab})`
        : "journey test has no // Train: header",
      source_line: (h.lines[line - 1] || "").trim(),
    });
  }
  writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
  process.stderr.write(`convex-detector: ${violations.length} violation(s)\n`);
  process.exit(0);
}
main();
