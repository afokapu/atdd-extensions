// DIRTY fixture — this feature ships an api (presentation) and application layer
// but NO domain.ts foundation. The business rule has been inlined into the use
// case instead of resting on a pure domain core → 1 violation (missing foundation).
import { query } from "../../_generated/server";
import { v } from "convex/values";
import { evaluateCellUseCase } from "./application";

export const evaluateCell = query({
  args: { aRow: v.number(), aCol: v.number(), bRow: v.number(), bCol: v.number() },
  handler: async (_ctx, a) =>
    evaluateCellUseCase({ row: a.aRow, col: a.aCol }, { row: a.bRow, col: a.bCol }),
});
