// DIRTY fixture — ConvexError codes in non-canonical formats (kebab, camelCase).
// Expected: ≥2 violations (not-found, wrongPhase).
import { mutation } from "./_generated/server";
import { ConvexError, v } from "convex/values";

export const checkout = mutation({
  args: { cartId: v.id("carts") },
  handler: async (ctx, { cartId }) => {
    const cart = await ctx.db.get(cartId);
    if (!cart) {
      throw new ConvexError({ code: "not-found", message: "cart not found" }); // ← kebab-case
    }
    if (cart.status !== "open") {
      throw new ConvexError({ code: "wrongPhase", message: "cart is not open" }); // ← camelCase
    }
    return await ctx.db.patch(cartId, { status: "ordered" });
  },
});
