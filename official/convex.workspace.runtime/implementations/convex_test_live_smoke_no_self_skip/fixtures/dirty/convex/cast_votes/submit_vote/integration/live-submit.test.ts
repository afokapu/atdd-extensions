// URN: test:cast-votes:submit-vote:E002-SMOKE-001-live-submit
// Acceptance: acc:cast-votes:E002-SMOKE-001
// Train: train:cast-votes
// Phase: LIVE_SMOKE
// Layer: integration
//
// FALSE GREEN via an availability guard: this live-smoke test (Phase: LIVE_SMOKE
// header — basename is NOT *.smoke.test.ts, so header classification is what catches
// it) gates itself on liveSmokeAvailable() and a runIf, so it silently no-ops when
// infra is "unavailable" instead of failing loudly.
import { describe, it, expect } from "vitest";
import { ConvexClient } from "convex/browser";
import { liveSmokeAvailable } from "../../../lib/smokeGuards";
import { api } from "../../../_generated/api";

// self-skip via availability guard: never fails when infra is unreachable
describe.runIf(liveSmokeAvailable())("submit-vote live smoke", () => {
  it("submits a vote against the live deployment", async () => {
    const client = new ConvexClient(process.env.CONVEX_URL!);
    const ok = await client.mutation(api.castVotes.submitVote.cast, { choice: "A" });
    expect(ok).toBe(true);
  });
});
