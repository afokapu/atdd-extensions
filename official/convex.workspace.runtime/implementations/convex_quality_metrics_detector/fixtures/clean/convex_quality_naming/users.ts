import { query } from "./_generated/server";
import { v } from "convex/values";

// Module constant in SCREAMING_SNAKE_CASE — correct.
const MAX_PAGE_SIZE = 100;
// A non-constant camelCase binding (no underscore) is not a constant — also fine.
const defaultName = "anonymous";

// Interface in PascalCase — correct.
interface PublicProfile {
  name: string;
  avatarUrl: string;
}

// Type alias in PascalCase — correct.
type ProfileFields = Pick<PublicProfile, "name">;

// camelCase function declaration — correct.
function projectProfile(row: { name: string; avatarUrl: string }): PublicProfile {
  return { name: row.name ?? defaultName, avatarUrl: row.avatarUrl };
}

// camelCase const arrow function — correct.
export const getProfile = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const row = await ctx.db.get(userId);
    if (!row) return null;
    const limited: ProfileFields = projectProfile(row);
    return { ...limited, cap: MAX_PAGE_SIZE };
  },
});
