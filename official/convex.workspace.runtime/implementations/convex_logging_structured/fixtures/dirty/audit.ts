// DIRTY fixture — log calls whose message is a bare interpolated string with no
// structured payload object. Expected: 2 violations.
import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const charge = mutation({
  args: { amount: v.number(), userId: v.string() },
  handler: async (ctx, { amount, userId }) => {
    console.info(`charge.started for ${userId} amount=${amount}`); // ← bare interpolation
    const id = await ctx.db.insert("charges", { amount, userId });
    console.info("charge.created id=" + id);                       // ← string concatenation
    return id;
  },
});
