// DIRTY fixture — catch handlers that silently swallow. Expected: 2 violations.
//   1. empty `catch {}` — neither logs nor rethrows.
//   2. catch that returns a fallback with no log and no rethrow.
import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const settle = mutation({
  args: { matchId: v.id("matches") },
  handler: async (ctx, { matchId }) => {
    try {
      await ctx.db.patch(matchId, { phase: "done" });
    } catch (e) {} // ← silent swallow: empty handler

    try {
      return await ctx.db.get(matchId);
    } catch (e) {
      return null; // ← silent swallow: returns fallback, no log/rethrow
    }
  },
});
