import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const charge = mutation({
  args: { accountId: v.id("accounts"), cents: v.number() },
  handler: async (ctx, { accountId, cents }) => {
    const account = await ctx.db.get(accountId);
    if (!account) throw new Error("NO_ACCOUNT");
    const fee = Math.round(cents * 0.029) + 30;
    const net = cents - fee;
    await ctx.db.patch(accountId, { balance: account.balance - net });
    return { charged: net };
  },
});
