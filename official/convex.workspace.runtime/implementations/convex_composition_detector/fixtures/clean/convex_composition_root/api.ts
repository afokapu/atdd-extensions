// CLEAN fixture — presentation layer. It instantiates NOTHING; it delegates to the
// use case wired by the composition root. No wiring leaks here.
import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { composePayout } from "./composition";

export const runPayout = mutation({
  args: { batchId: v.string() },
  handler: async (ctx, { batchId }) => composePayout(ctx)(batchId),
});
