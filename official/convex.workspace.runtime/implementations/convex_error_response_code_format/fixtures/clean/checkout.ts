// CLEAN fixture — every ConvexError code is canonical SCREAMING_SNAKE (one dotted).
// Expected: 0 violations.
import { mutation } from "./_generated/server";
import { ConvexError, v } from "convex/values";

export const checkout = mutation({
  args: { cartId: v.id("carts") },
  handler: async (ctx, { cartId }) => {
    const cart = await ctx.db.get(cartId);
    if (!cart) {
      throw new ConvexError({ code: "RESOURCE_NOT_FOUND", message: "cart not found" });
    }
    if (cart.items.length === 0) {
      throw new ConvexError({ code: "INVALID_INPUT", message: "cart is empty" });
    }
    if (cart.lockedBy) {
      throw new ConvexError({ code: "CART.ALREADY_LOCKED", message: "cart is locked" });
    }
    return await ctx.db.patch(cartId, { status: "ordered" });
  },
});
