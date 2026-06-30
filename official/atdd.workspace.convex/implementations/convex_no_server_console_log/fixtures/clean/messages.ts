// CLEAN fixture — a Convex mutation with no console.* call. Expected: 0 violations.
import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const send = mutation({
  args: { body: v.string(), author: v.string() },
  handler: async (ctx, { body, author }) => {
    const id = await ctx.db.insert("messages", { body, author });
    return id;
  },
});
