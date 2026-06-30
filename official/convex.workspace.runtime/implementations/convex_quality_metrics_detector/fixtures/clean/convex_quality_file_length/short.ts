import { query } from "./_generated/server";
import { v } from "convex/values";

// A small, focused module — well under the 500-line report threshold.
export const get = query({
  args: { id: v.id("items") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("items").take(50);
  },
});
