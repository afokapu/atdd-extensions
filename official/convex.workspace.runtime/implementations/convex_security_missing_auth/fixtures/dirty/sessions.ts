// DIRTY fixture — db-touching server functions with no identity check.
// Expected: 2 violations (listAll query, deleteNote mutation).
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// ← coder.convex.security-missing-auth: reads ctx.db, never checks ctx.auth.
export const listAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("notes").collect();
  },
});

// ← coder.convex.security-missing-auth: deletes via ctx.db with no auth gate.
export const deleteNote = mutation({
  args: { id: v.id("notes") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});

// Pure compute — no ctx.db, so not a violation even without auth.
export const version = query({
  args: {},
  handler: async () => "1.0.0",
});
