// A Convex migration whose filename is NOT derivable from its migration id: the
// exported migration is `fixStuff` (id `fix_stuff`), but the file is `fix-stuff.ts`
// — kebab-case, not the snake_case stem. The file<->id mapping is broken, so the
// migration cannot be traced to its test deterministically.
import { internalMutation } from "../_generated/server";

export const fixStuff = internalMutation({
  args: {},
  handler: async () => ({ fixed: 0 }),
});
