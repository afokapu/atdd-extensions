// CLEAN fixture — exports a Convex query (an API entry → graph root). It imports
// the helper below, so the helper is reachable too. Nothing is dead.
import { query } from "./_generated/server";
import { v } from "convex/values";
import { formatBody } from "./format";

export const list = query({
  args: { limit: v.number() },
  handler: async (ctx, { limit }) => {
    const rows = await ctx.db.query("messages").take(limit);
    return rows.map((r) => formatBody(r.body));
  },
});
