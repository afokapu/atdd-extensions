// DIRTY fixture — presentation layer wiring its own dependency. `new
// LedgerRepository(ctx)` is instantiation OUTSIDE a composition root (this is
// api.ts, not composition.ts/wagon.ts) → 1 violation.
import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { LedgerRepository } from "./integration";
import { makePayoutUseCase } from "./application";

export const runPayout = mutation({
  args: { batchId: v.string() },
  handler: async (ctx, { batchId }) => {
    const ledger = new LedgerRepository(ctx);
    return makePayoutUseCase(ledger)(batchId);
  },
});
