// CLEAN fixture — a colocated `{layer}.test.ts` single test next to its layer
// source (`domain.ts`). `domain` is a known architectural layer, so the basename
// is URN-derivable without an explicit URN tail. Expected: 0 violations.
import { test, expect } from "vitest";
import { closenessScore } from "./domain";

test("closenessScore is symmetric", () => {
  expect(closenessScore(2, 5)).toBe(closenessScore(5, 2));
});
