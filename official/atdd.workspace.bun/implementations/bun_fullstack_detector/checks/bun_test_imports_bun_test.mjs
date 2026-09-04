#!/usr/bin/env bun
// Detector: coder.bun.test-imports-bun-test  (disposition: strict)
//
// Tests in a Bun stack import their harness from `bun:test`. A test still
// importing `vitest`, `@jest/globals` or `mocha` is not run by `bun test` in the
// way the project thinks: it drags a second runner (and its transform pipeline)
// back into a toolchain whose entire premise is that Bun runs TypeScript
// directly. Worse for ATDD specifically — the workspace provider's declared
// runner IS `bun`, so an acceptance test bound to a foreign harness is not
// executed by the runner the gate believes it ran, and the coverage the gate
// reports is not the coverage that exists.
//
// Scans test files ONLY (that is where a harness import belongs) and masks
// comments so a migration note naming the old runner does not trip it.
import { walk, readRoots, readExcludes, readText, emit, locate, maskLiteralsAndComments, SOURCE_EXT, TEST_RE } from "../../../lib/scan.mjs";

const RULE_ID = "coder.bun.test-imports-bun-test";
const FOREIGN_HARNESS_RE =
  /\b(?:import|from|require\s*\()\s*['"](vitest|@jest\/globals|jest|mocha|chai)['"]/g;

const violations = [];
const excludes = readExcludes();
for (const root of readRoots()) {
  for (const file of walk(root, excludes, SOURCE_EXT, true)) {
    if (!TEST_RE.test(file)) continue;
    const text = readText(file);
    if (!text) continue;
    // Mask comments only: the harness name lives INSIDE the import's string
    // literal, so masking literals here would blank the very thing being matched.
    const masked = text.replace(/\/\/[^\n]*/g, (s) => " ".repeat(s.length));
    for (const m of masked.matchAll(FOREIGN_HARNESS_RE)) {
      violations.push({
        rule_id: RULE_ID,
        file,
        ...locate(text, m.index),
        evidence: `test imports '${m[1]}' instead of 'bun:test'; the declared runner is bun, so this test is not run by the harness the gate reports`,
      });
    }
  }
}
process.stderr.write(`bun-detector[test-imports-bun-test]: ${violations.length} violation(s)\n`);
emit(violations);
