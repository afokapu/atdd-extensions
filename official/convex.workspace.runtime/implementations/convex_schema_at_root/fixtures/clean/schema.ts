// CLEAN fixture — this convex root has a schema.ts directly under it.
// Expected: 0 violations (the scan root is treated as a convex/ dir).
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  messages: defineTable({
    body: v.string(),
    author: v.string(),
  }),
});
