// DIRTY fixture — advisory perf smells. Expected: 2 violations.
//   1. `await` inside a for-loop body (serialized per-item IO).
//   2. `.collect()` on a query with no `.withIndex()` (full-table scan).
import { query } from "./_generated/server";
import { v } from "convex/values";

export const leaderboard = query({
  args: {},
  handler: async (ctx) => {
    // Full-table scan: no withIndex before collect.
    const rows = await ctx.db.query("rankings").collect(); // ← full-table .collect()

    const enriched = [];
    for (const row of rows) {
      const player = await ctx.db.get(row.playerId); // ← await inside loop body
      enriched.push({ row, player });
    }
    return enriched;
  },
});
