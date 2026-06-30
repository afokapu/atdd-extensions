// CLEAN fixture — a Convex mutation whose cognitive complexity is well under the
// threshold of 15 (a mostly flat structure: flat increments dominate, little
// nesting). Expected: 0 violations.
import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const grade = mutation({
  args: { status: v.string(), count: v.number() },
  handler: async (ctx, { status, count }) => {
    let out = 0;
    if (status === "a") {
      out = 1;
    } else if (status === "b") {
      out = 2;
    } else {
      out = 3;
    }
    for (const x of [1, 2, 3]) {
      if (x > count) {
        out = out + x;
      }
    }
    return out;
  },
});
