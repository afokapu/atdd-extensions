// CLEAN fixture — graph root. Convex auto-loads schema.ts at the convex root.
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  messages: defineTable({ body: v.string(), author: v.string() }),
});
