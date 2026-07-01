// DIRTY fixture — a Convex mutation whose cyclomatic complexity is above the
// threshold of 10 (many decision keywords + boolean operators + a ternary).
// Expected: 1 violation at the handler line.
import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const classify = mutation({
  args: { score: v.number(), tier: v.string(), flagged: v.boolean() },
  handler: async (ctx, { score, tier, flagged }) => {
    let label = "none";
    if (score > 90 && tier === "gold") {
      label = "elite";
    } else if (score > 75 || flagged) {
      label = "strong";
    } else if (score > 50 && tier !== "bronze") {
      label = "fair";
    } else if (score > 25) {
      label = "weak";
    }
    for (const t of ["a", "b", "c"]) {
      if (t === tier && flagged) {
        label = label + "-" + t;
      }
    }
    const finalLabel = label === "none" ? "unrated" : label;
    while (label.length > 20) {
      label = label.slice(0, 20);
    }
    return finalLabel;
  },
});
