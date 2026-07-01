// CLEAN fixture — a Convex mutation whose cyclomatic complexity is well under
// the threshold of 10. Expected: 0 violations.
import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const setStatus = mutation({
  args: { id: v.id("tasks"), status: v.string() },
  handler: async (ctx, { id, status }) => {
    const task = await ctx.db.get(id);
    if (!task) {
      throw new Error("task not found");
    }
    if (status === "done" && task.assignee) {
      await ctx.db.patch(id, { status, closedAt: task._creationTime });
    } else {
      await ctx.db.patch(id, { status });
    }
    return id;
  },
});
