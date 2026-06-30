// DIRTY fixture — a Vitest test whose basename is neither URN-derivable nor a
// known `{layer}.test.ts` (camelCase `myTest`, no acceptance URN). Vitest collects
// it, but it is untraceable to any acceptance criterion and breaks the
// URN→filename mapping. Expected: 1 violation at line 1 (filename rule).
import { test, expect } from "vitest";
import { evaluateCell } from "./domain";

test("does a thing", () => {
  expect(evaluateCell("primary")).toBe(1);
});
