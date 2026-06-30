// CLEAN fixture — presentation imports inward only (application, domain). Allowed.
import { query } from "./_generated/server";
import { v } from "convex/values";
import { evaluateCellUseCase } from "./application";
import type { Cell } from "./domain";

export const evaluateCell = query({
  args: { aRow: v.number(), aCol: v.number(), bRow: v.number(), bCol: v.number() },
  handler: async (_ctx, a) => {
    const x: Cell = { row: a.aRow, col: a.aCol };
    return evaluateCellUseCase(x, { row: a.bRow, col: a.bCol });
  },
});
