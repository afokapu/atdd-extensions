// CLEAN fixture — Convex presentation layer; thin adapter delegating to application.
import { query } from "../../_generated/server";
import { v } from "convex/values";
import { evaluateCellUseCase } from "./application";

export const evaluateCell = query({
  args: { aRow: v.number(), aCol: v.number(), bRow: v.number(), bCol: v.number() },
  handler: async (_ctx, a) =>
    evaluateCellUseCase({ row: a.aRow, col: a.aCol }, { row: a.bRow, col: a.bCol }),
});
