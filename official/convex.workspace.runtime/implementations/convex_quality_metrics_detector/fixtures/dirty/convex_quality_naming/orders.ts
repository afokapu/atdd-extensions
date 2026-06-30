import { query } from "./_generated/server";
import { v } from "convex/values";

// Module-level constant written as snake_case + literal — should be SCREAMING_SNAKE.
const max_retries = 5;

// Interface name is lowercase — should be PascalCase.
interface order {
  id: string;
  total: number;
}

// Type alias is snake_case — should be PascalCase.
type order_row = { id: string };

// Function declaration is PascalCase — should be camelCase.
function ComputeTotal(rows: number[]): number {
  return rows.reduce((a, b) => a + b, 0);
}

// Module-level arrow function bound to a PascalCase const — should be camelCase.
export const NormalizeRows = (rows: number[]): number[] => rows.map((r) => r + 1);

export const fetchOrder = query({
  args: { id: v.id("orders") },
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    return ComputeTotal(NormalizeRows([row?.total ?? 0]));
  },
});
