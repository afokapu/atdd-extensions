// CLEAN fixture — a URN-named Vitest test under the Convex tree.
// Basename derives from acceptance URN acc:score-grid:E001-UNIT-001-evaluate-cell
// -> e001-unit-001-evaluate-cell.test.ts. Expected: 0 violations.
//
// URN: test:score-grid:score-closeness:E001-UNIT-001-evaluate-cell
// Acceptance: acc:score-grid:E001-UNIT-001-evaluate-cell
// WMBT: wmbt:score-grid:E001
// Phase: GREEN
// Layer: domain
import { test, expect } from "vitest";
import { evaluateCell } from "./domain";

test("evaluateCell returns +1 for a primary match", () => {
  expect(evaluateCell("primary")).toBe(1);
});
