#!/usr/bin/env node
// STAGED — tester.convex.interlocking-train-sequence-is-exercised
//
// The tester half of the executes-the-declaration pair. Route coverage proves WHICH
// train a route selects and trace binding proves the run is attributable to its
// route; both are statements about SELECTION. A train whose wagon sequence is wrong
// is selected correctly and runs the wrong thing.
//
// STAGED, exactly as the python sibling is: this is a ROOT-level entry point, not a
// file under checks/, so the gated family runner (detect.mjs) never collects it. No
// consumer satisfies the rule yet and wiring it into a blocking gate would escalate
// an advisory concern silently. Enabling it is a gate change, not a build.
//
// Demonstrated before being written: on a consumer whose TrainRunner genuinely reads
// the train definition, replacing a train's entire `sequence:` in the plan left its
// suite green. The runtime obeyed the new plan; no test looked.
import {
  parseJsonEnv, readText, findConsumerRoots, interlockingFiles, e2eFiles,
  parseInterlocking, tokenCovered, rel, mk,
} from "./_shared/interlocking.mjs";
import { writeFileSync } from "node:fs";

export const RULE_SEQUENCE = "tester.convex.interlocking-train-sequence-is-exercised";

// A line that ASSERTS AN ORDER: names the executed sequence AND compares it.
// Merely touching the word is not asserting the order — `expect(trace.steps)` alone
// says nothing about what ran, and counting it would repeat the over-broad trigger
// that has now been fixed three times in this family.
const SEQUENCE_ASSERTION =
  /^[^\n]*\b(?:expect|assert)\b[^\n]*\b(?:steps|sequence|wagons)\b[^\n]*(?:==|toEqual|toStrictEqual|deepEqual)/m;

export function assertsASequence(text) {
  return SEQUENCE_ASSERTION.test(text);
}

export function trainsReachableFromRoutes(records) {
  // `trainId`, not `train_id`. The planner YAML is snake_case and stack-neutral, but
  // this provider's parseInterlocking normalises each route to camelCase. Reading the
  // YAML field name here returned an EMPTY train set, so the check passed on every
  // tree by having nothing to check — a vacuous green that looked like a clean port.
  // Caught by asking what the silent run had actually examined.
  const out = new Set();
  for (const rec of records) for (const r of rec.routes || []) if (r.trainId) out.add(r.trainId);
  return out;
}

export function trainSequenceCovered(trainId, texts) {
  return texts.some((t) => tokenCovered(trainId, t) && assertsASequence(t));
}

export function scanExecution(scanRoot) {
  const violations = [];
  for (const croot of findConsumerRoots(scanRoot)) {
    const records = interlockingFiles(croot).map((f) => parseInterlocking(readText(f))).filter(Boolean);
    if (!records.length) continue;
    const files = e2eFiles(croot).map((f) => ({ file: f, text: readText(f) }));
    const texts = files.map((x) => x.text);
    const anchor = files.length ? rel(files[0].file, croot) : "e2e/";
    for (const trainId of [...trainsReachableFromRoutes(records)].sort()) {
      if (trainSequenceCovered(trainId, texts)) continue;
      violations.push(
        mk(RULE_SEQUENCE, anchor, 1, 0,
          `declared train "${trainId}" is selected by a route but no test asserts the wagon ` +
          `SEQUENCE it executes; reorder or empty its definition and the suite stays green`,
          ""),
      );
    }
  }
  return violations;
}

// Runnable on its own so the obligation is exercisable code, not a paragraph.
if (import.meta.main ?? process.argv[1]?.endsWith("scan_execution.mjs")) {
  const roots = parseJsonEnv("ATDD_SCAN_ROOTS", []);
  const out = roots.flatMap((r) => scanExecution(r));
  const rp = process.env.ATDD_VIOLATIONS_REPORT;
  if (rp) writeFileSync(rp, JSON.stringify({ violations: out }, null, 2), "utf8");
  process.stderr.write(`convex-interlocking-sequence: ${out.length} violation(s)\n`);
}
