// An exported mutation parked under an underscore-prefixed directory. Convex
// excludes `_internal/` from the API surface, so `secretMutation` is registered
// nowhere and can never be called as `api.*` / `internal.*` — a silent dead end.
import { mutation } from "../_generated/server";

export const secretMutation = mutation({
  args: {},
  handler: async () => {
    return { ok: true };
  },
});
