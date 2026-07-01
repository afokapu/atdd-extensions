// DIRTY fixture — a Convex mutation whose deepest control-block nesting is 5
// (if > for > while > if > try), above the threshold of 4. Expected: 1 violation.
import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const walk = mutation({
  args: { grid: v.array(v.array(v.number())) },
  handler: async (ctx, { grid }) => {
    let found = 0;
    if (grid.length > 0) {
      for (const row of grid) {
        while (row.length > 0) {
          if (row.pop() === 0) {
            try {
              found = found + 1;
            } catch (e) {
              found = found;
            }
          }
        }
      }
    }
    return found;
  },
});
