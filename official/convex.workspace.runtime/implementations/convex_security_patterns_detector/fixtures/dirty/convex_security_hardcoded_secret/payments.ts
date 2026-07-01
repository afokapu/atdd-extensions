// DIRTY fixture — credentials hardcoded directly in Convex source.
// Expected: ≥4 violations (sk_ key, AWS key, bearer token, password assignment).
import { action } from "./_generated/server";

const STRIPE_KEY = "sk_REDACTED_PLACEHOLDER_VALUE0000"; // ← coder.convex.security-hardcoded-secret
const AWS_ACCESS_KEY = "AKIAIOSFODNN7EXAMPLE"; // ← coder.convex.security-hardcoded-secret

export const charge = action({
  args: {},
  handler: async () => {
    const password = "hunter2-super-secret"; // ← coder.convex.security-hardcoded-secret
    const res = await fetch("https://api.stripe.com/v1/charges", {
      method: "POST",
      headers: {
        Authorization: "Bearer abcdef0123456789ghijklmnop", // ← coder.convex.security-hardcoded-secret
      },
    });
    return { ok: res.ok, key: STRIPE_KEY, aws: AWS_ACCESS_KEY, password };
  },
});
