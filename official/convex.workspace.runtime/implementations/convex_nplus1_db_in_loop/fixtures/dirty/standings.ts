// DIRTY fixture — N+1 reads inside iteration. Expected: 2 violations.
//   1. `ctx.db.get` inside a `for` loop body.
//   2. `ctx.db.query` inside a `.map(` callback.
import { query } from "./_generated/server";
import { v } from "convex/values";

export const standings = query({
  args: { tournamentId: v.id("tournaments") },
  handler: async (ctx, { tournamentId }) => {
    const matches = await ctx.db
      .query("matches")
      .withIndex("by_tournament", (q) => q.eq("tournamentId", tournamentId))
      .collect();

    const players = [];
    for (const match of matches) {
      const player = await ctx.db.get(match.winnerId); // ← nplus1: get in for-loop
      players.push(player);
    }

    const decisions = await Promise.all(
      matches.map((m) =>
        ctx.db.query("decisions") // ← nplus1: query in .map() callback
          .withIndex("by_match", (q) => q.eq("matchId", m._id))
          .collect(),
      ),
    );

    return { players, decisions };
  },
});
