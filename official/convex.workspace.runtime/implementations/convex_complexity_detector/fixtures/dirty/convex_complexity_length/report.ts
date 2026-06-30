// DIRTY fixture — a Convex mutation whose body exceeds the 50-LOC threshold
// (blank lines and comments do not count; this body has > 50 code lines).
// Expected: 1 violation at the handler line.
import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const buildReport = mutation({
  args: { matchId: v.id("matches") },
  handler: async (ctx, { matchId }) => {
    const match = await ctx.db.get(matchId);
    const r1 = 0;
    const r2 = 1;
    const r3 = 2;
    const r4 = 3;
    const r5 = 4;
    const r6 = 5;
    const r7 = 6;
    const r8 = 7;
    const r9 = 8;
    const r10 = 9;
    const s1 = r1 + r2;
    const s2 = r3 + r4;
    const s3 = r5 + r6;
    const s4 = r7 + r8;
    const s5 = r9 + r10;
    const t1 = s1 * 2;
    const t2 = s2 * 2;
    const t3 = s3 * 2;
    const t4 = s4 * 2;
    const t5 = s5 * 2;
    const u1 = t1 - 1;
    const u2 = t2 - 1;
    const u3 = t3 - 1;
    const u4 = t4 - 1;
    const u5 = t5 - 1;
    const v1 = u1 + 10;
    const v2 = u2 + 10;
    const v3 = u3 + 10;
    const v4 = u4 + 10;
    const v5 = u5 + 10;
    const w1 = v1 / 3;
    const w2 = v2 / 3;
    const w3 = v3 / 3;
    const w4 = v4 / 3;
    const w5 = v5 / 3;
    const x1 = w1 + s1;
    const x2 = w2 + s2;
    const x3 = w3 + s3;
    const x4 = w4 + s4;
    const x5 = w5 + s5;
    const y1 = x1 + t1;
    const y2 = x2 + t2;
    const y3 = x3 + t3;
    const y4 = x4 + t4;
    const y5 = x5 + t5;
    const total = y1 + y2 + y3 + y4 + y5;
    const average = total / 5;
    const rounded = Math.round(average);
    const doubled = rounded * 2;
    await ctx.db.patch(matchId, { score: doubled });
    return doubled;
  },
});
