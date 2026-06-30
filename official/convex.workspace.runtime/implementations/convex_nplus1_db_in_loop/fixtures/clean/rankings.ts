// CLEAN fixture — reads are batched OUT of the loop. Expected: 0 violations.
// One indexed query fetches every row; the loop iterates the in-memory array and
// issues NO `ctx.db.get`/`ctx.db.query` per item.
import { query } from "./_generated/server";
import { v } from "convex/values";

export const listRankings = query({
  args: { tournamentId: v.id("tournaments") },
  handler: async (ctx, { tournamentId }) => {
    const rows = await ctx.db
      .query("rankings")
      .withIndex("by_tournament", (q) => q.eq("tournamentId", tournamentId))
      .collect();

    const out = [];
    for (const row of rows) {
      out.push({ playerId: row.playerId, score: row.score });
    }
    return out;
  },
});
