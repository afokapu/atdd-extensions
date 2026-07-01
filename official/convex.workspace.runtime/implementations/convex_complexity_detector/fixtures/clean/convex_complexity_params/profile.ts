// CLEAN fixture — every function declares at most 5 parameters (the limit),
// so none is flagged (the rule requires fewer than 6). Expected: 0 violations.
import { mutation } from "./_generated/server";
import { v } from "convex/values";

function composeName(first, last, title, suffix, locale) {
  return [title, first, last, suffix].join(" ") + "@" + locale;
}

export const save = mutation({
  args: { first: v.string(), last: v.string() },
  handler: async (ctx, { first, last }) => {
    const display = composeName(first, last, "", "", "en");
    const id = await ctx.db.insert("profiles", { display });
    return id;
  },
});
