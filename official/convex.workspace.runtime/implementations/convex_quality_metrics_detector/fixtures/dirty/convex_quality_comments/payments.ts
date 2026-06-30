import { mutation } from "./_generated/server";
import { v } from "convex/values";

// TODO: re-enable the legacy refund path once finance signs off
// FIXME: this whole module needs to move behind an auth check
export const charge = mutation({
  args: { accountId: v.id("accounts"), cents: v.number() },
  handler: async (ctx, { accountId, cents }) => {
    const account = await ctx.db.get(accountId);
    if (!account) throw new Error("NO_ACCOUNT");

    // const oldBalance = account.balance;
    // const fee = Math.round(cents * 0.029) + 30;
    // const net = cents - fee;
    // await ctx.db.patch(accountId, { balance: oldBalance - net });
    // return { charged: net, fee };

    await ctx.db.patch(accountId, { balance: account.balance - cents });
    // TODO: emit a ledger entry here
    // HACK: swallow the webhook for now, retries are broken
    // XXX: revisit idempotency before launch
    return { charged: cents };
  },
});
