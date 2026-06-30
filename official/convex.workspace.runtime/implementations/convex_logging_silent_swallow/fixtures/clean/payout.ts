// CLEAN fixture — every catch observably reacts (logs OR rethrows), and a handler
// that does other work without returning is not a swallow. Expected: 0 violations.
import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const settle = mutation({
  args: { matchId: v.id("matches") },
  handler: async (ctx, { matchId }) => {
    try {
      return await ctx.db.get(matchId);
    } catch (e) {
      console.error("settle.lookup_failed", { matchId, error: String(e) });
      throw e; // log + rethrow → observable
    }
  },
});

export const finalize = mutation({
  args: { matchId: v.id("matches") },
  handler: async (ctx, { matchId }) => {
    let attempts = 0;
    try {
      await ctx.db.patch(matchId, { phase: "done" });
    } catch {
      attempts += 1; // does other work, neither returns nor empty → not flagged
    }
    return attempts;
  },
});
