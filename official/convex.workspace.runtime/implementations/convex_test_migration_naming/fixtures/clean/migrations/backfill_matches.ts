// A Convex migration named deterministically from its migration id: the file stem
// `backfill_matches` is the snake_case rendering of the exported `backfillMatches`,
// so Convex addresses it as `migrations/backfill_matches:backfillMatches` and the
// migration stays traceable to its test.
import { internalMutation } from "../_generated/server";

export const backfillMatches = internalMutation({
  args: {},
  handler: async () => ({ migrated: 0 }),
});
