// CLEAN fixture — every credential is read from process.env, never hardcoded.
// Expected: 0 violations.
import { action } from "./_generated/server";

export const charge = action({
  args: {},
  handler: async () => {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not configured");
    const res = await fetch("https://api.stripe.com/v1/charges", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });
    return res.ok;
  },
});
