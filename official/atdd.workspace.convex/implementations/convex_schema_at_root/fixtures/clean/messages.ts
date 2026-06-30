// A sibling server module in the same convex root. Its presence does not affect
// the schema-at-root check — only `schema.ts` directly under the root matters.
import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const send = mutation({
  args: { body: v.string(), author: v.string() },
  handler: async (ctx, { body, author }) => {
    return await ctx.db.insert("messages", { body, author });
  },
});
