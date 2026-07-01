// URN: test:run-match:drive-match:E001-SMOKE-001-live-match
// Acceptance: acc:run-match:E001-SMOKE-001
// Train: train:run-match
// Phase: SMOKE
// Layer: integration
//
// A live-smoke test: it runs against the real Convex deployment and either passes
// or fails. It carries NO self-skip mechanism, so it can never go vacuously green.
// (The string below mentions "it.skip" to prove the detector masks string literals
// and does not flag the word inside a literal — this file has 0 violations.)
import { expect, test } from "vitest";
import { ConvexClient } from "convex/browser";
import { api } from "../../../_generated/api";

const DIAGNOSTIC = "a live-smoke test must never it.skip against real infra";

test("drives a full match against the live deployment", async () => {
  const client = new ConvexClient(process.env.CONVEX_URL!);
  const matchId = await client.mutation(api.runMatch.driveMatch.start, {});
  const result = await client.query(api.runMatch.driveMatch.result, { matchId });
  expect(result.status).toBe("completed");
  expect(DIAGNOSTIC).toContain("live-smoke");
});
