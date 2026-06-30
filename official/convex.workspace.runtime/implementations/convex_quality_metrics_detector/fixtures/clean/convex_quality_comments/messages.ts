import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// List the most recent messages in a channel. We cap the page size so a busy
// channel cannot force an unbounded read; pagination is the caller's job.
export const listRecent = query({
  args: { channelId: v.id("channels"), limit: v.optional(v.number()) },
  handler: async (ctx, { channelId, limit }) => {
    const cap = Math.min(limit ?? 50, 100);
    return await ctx.db
      .query("messages")
      .withIndex("by_channel", (q) => q.eq("channelId", channelId))
      .order("desc")
      .take(cap);
  },
});

// Post a message. The author is taken from the authenticated identity rather than
// the arguments so a client cannot spoof another user.
export const post = mutation({
  args: { channelId: v.id("channels"), body: v.string() },
  handler: async (ctx, { channelId, body }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("UNAUTHENTICATED");
    return await ctx.db.insert("messages", {
      channelId,
      body,
      author: identity.subject,
    });
  },
});
