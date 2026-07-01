// DIRTY fixture — a Convex mutation whose cognitive complexity is above the
// threshold of 15: deeply nested control structures earn escalating nesting
// increments (for=1, if=2, for=3, if=4, while=5) plus boolean operators.
// Expected: 1 violation at the handler line.
import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const aggregate = mutation({
  args: { data: v.array(v.any()) },
  handler: async (ctx, { data }) => {
    let n = 0;
    for (const a of data) {
      if (a.value > 0 && a.value < 100) {
        for (const b of a.items) {
          if (b.active || b.pinned) {
            while (b.count > 0) {
              n = n + 1;
              b.count = b.count - 1;
            }
          }
        }
      }
    }
    return n;
  },
});
