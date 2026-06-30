// DIRTY fixture — a Convex mutation with a bare console.log in server code.
// Expected: 1 violation at the console.log line.
import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const charge = mutation({
  args: { amount: v.number(), userId: v.string() },
  handler: async (ctx, { amount, userId }) => {
    console.log("charging", userId, amount); // ← coder.convex.no-server-console-log
    const id = await ctx.db.insert("charges", { amount, userId });
    return id;
  },
});
