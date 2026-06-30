import { mutation } from "./_generated/server";
import { v } from "convex/values";

// Each handler does genuinely different work — no copy-pasted block survives.
export const charge = mutation({
  args: { accountId: v.id("accounts"), cents: v.number() },
  handler: async (ctx, { accountId, cents }) => {
    const account = await ctx.db.get(accountId);
    if (!account) throw new Error("NO_ACCOUNT");
    await ctx.db.patch(accountId, { balance: account.balance - cents });
    return { charged: cents };
  },
});

export const close = mutation({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, { accountId }) => {
    await ctx.db.delete(accountId);
    return { closed: true };
  },
});
