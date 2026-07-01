// DIRTY fixture — a helper that declares 8 parameters, above the limit of 5
// (the rule requires fewer than 6; these arguments want to be a parameter
// object). Expected: 1 violation at the helper declaration line.
import { mutation } from "./_generated/server";
import { v } from "convex/values";

function postEntry(account, amount, currency, memo, category, ts, ref, actor) {
  return { account, amount, currency, memo, category, ts, ref, actor };
}

export const record = mutation({
  args: { account: v.string(), amount: v.number() },
  handler: async (ctx, { account, amount }) => {
    const entry = postEntry(account, amount, "USD", "", "general", 0, "", "system");
    const id = await ctx.db.insert("ledger", entry);
    return id;
  },
});
