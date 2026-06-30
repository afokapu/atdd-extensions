// DIRTY fixture — failures signalled with bare strings / generic Error.
// Expected: ≥2 violations (throw new Error, throw "literal").
import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const placeOrder = mutation({
  args: { sku: v.string(), qty: v.number() },
  handler: async (ctx, { sku, qty }) => {
    if (qty <= 0) {
      throw new Error("qty must be positive"); // ← coder.convex.error-response-bare-string
    }
    const item = await ctx.db
      .query("inventory")
      .filter((q) => q.eq(q.field("sku"), sku))
      .first();
    if (!item) {
      throw "unknown sku"; // ← coder.convex.error-response-bare-string
    }
    return await ctx.db.insert("orders", { sku, qty });
  },
});
