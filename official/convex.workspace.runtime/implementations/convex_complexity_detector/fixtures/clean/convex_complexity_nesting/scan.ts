// CLEAN fixture — a Convex mutation whose deepest control-block nesting is 4,
// at the threshold (the rule flags depth > 4). Expected: 0 violations.
import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const scan = mutation({
  args: { rows: v.array(v.array(v.number())) },
  handler: async (ctx, { rows }) => {
    let hits = 0;
    if (rows.length > 0) {
      for (const row of rows) {
        while (row.length > 0) {
          if (row.pop() === 7) {
            hits++;
          }
        }
      }
    }
    return hits;
  },
});
