// DIRTY fixture — this convex root has server modules but NO schema.ts directly
// under it. Expected: exactly 1 violation (missing convex/schema.ts).
import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const send = mutation({
  args: { body: v.string(), author: v.string() },
  handler: async (ctx, { body, author }) => {
    return await ctx.db.insert("messages", { body, author });
  },
});
