// CLEAN fixture — failures are signalled with a coded ConvexError. A re-throw of a
// caught error object is fine (not a bare string). Expected: 0 violations.
import { mutation } from "./_generated/server";
import { ConvexError, v } from "convex/values";

export const placeOrder = mutation({
  args: { sku: v.string(), qty: v.number() },
  handler: async (ctx, { sku, qty }) => {
    if (qty <= 0) {
      throw new ConvexError({ code: "INVALID_INPUT", message: "qty must be positive" });
    }
    const item = await ctx.db
      .query("inventory")
      .filter((q) => q.eq(q.field("sku"), sku))
      .first();
    if (!item) {
      throw new ConvexError({ code: "RESOURCE_NOT_FOUND", message: "unknown sku" });
    }
    try {
      return await ctx.db.insert("orders", { sku, qty });
    } catch (err) {
      throw err; // re-throw the original error object — not a bare string
    }
  },
});
