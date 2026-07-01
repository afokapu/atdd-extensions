// CLEAN fixture — every log call pairs a STATIC event name with a structured
// payload object. Expected: 0 violations.
import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const charge = mutation({
  args: { amount: v.number(), userId: v.string() },
  handler: async (ctx, { amount, userId }) => {
    // Static event name + structured payload → queryable, correlatable.
    console.info("charge.started", { userId, amount });
    const id = await ctx.db.insert("charges", { amount, userId });
    console.info("charge.created", { userId, chargeId: id });
    return id;
  },
});
