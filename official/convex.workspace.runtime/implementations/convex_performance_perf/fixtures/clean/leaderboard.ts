// CLEAN fixture — no per-item await, and the only .collect() is indexed.
// Expected: 0 violations.
import { query } from "./_generated/server";
import { v } from "convex/values";

export const leaderboard = query({
  args: { tournamentId: v.id("tournaments") },
  handler: async (ctx, { tournamentId }) => {
    // Single indexed query (bounded scan) then a pure in-memory loop (no IO).
    const rows = await ctx.db
      .query("rankings")
      .withIndex("by_tournament", (q) => q.eq("tournamentId", tournamentId))
      .collect();

    let total = 0;
    for (const row of rows) {
      total += row.score; // pure CPU, no await
    }
    return { count: rows.length, total };
  },
});
