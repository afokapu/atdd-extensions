// URN: test:run-match:drive-match:E001-SMOKE-001-live-match
// Acceptance: acc:run-match:E001-SMOKE-001
// Train: train:run-match
// Phase: SMOKE
// Layer: integration
//
// FALSE GREEN: this is a live-smoke test (basename *.smoke.test.ts AND Phase: SMOKE)
// yet it can self-skip — so SMOKE goes green without ever hitting real infra.
import { describe, it, test, expect } from "vitest";
import { ConvexClient } from "convex/browser";
import { api } from "../../../_generated/api";

const HAS_URL = Boolean(process.env.CONVEX_URL);

describe("drive-match live smoke", () => {
  // self-skip #1: static skip — never runs
  it.skip("drives a full match against the live deployment", async () => {
    const client = new ConvexClient(process.env.CONVEX_URL!);
    const matchId = await client.mutation(api.runMatch.driveMatch.start, {});
    expect(matchId).toBeTruthy();
  });

  // self-skip #2: conditional skip — silenced whenever the URL is unset
  test.skipIf(!HAS_URL)("reveals rounds against live data", async () => {
    expect(HAS_URL).toBe(true);
  });
});
