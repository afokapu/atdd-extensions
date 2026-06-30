// CLEAN fixture — a Convex mutation whose body is well under the 50-LOC
// threshold. Expected: 0 violations.
import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const seed = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const existing = await ctx.db
      .query("teams")
      .withIndex("by_name", (q) => q.eq("name", name))
      .unique();
    if (existing) {
      return existing._id;
    }
    const id = await ctx.db.insert("teams", { name, score: 0 });
    return id;
  },
});
