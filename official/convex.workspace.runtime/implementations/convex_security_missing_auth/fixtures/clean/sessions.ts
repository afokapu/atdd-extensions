// CLEAN fixture — every db-touching server function checks the caller's identity
// before reading or writing. Expected: 0 violations.
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Reads ctx.db, but gates on ctx.auth first — authenticated.
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    return await ctx.db
      .query("notes")
      .filter((q) => q.eq(q.field("owner"), identity.subject))
      .collect();
  },
});

// Writes via ctx.db after resolving the user identity — authenticated.
export const addNote = mutation({
  args: { body: v.string() },
  handler: async (ctx, { body }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("unauthenticated");
    return await ctx.db.insert("notes", { body, owner: identity.subject });
  },
});

// Pure compute — never touches ctx.db, so auth is not required by this rule.
export const ping = query({
  args: {},
  handler: async () => "pong",
});
