"use node";
// Clean: Convex's own document API uses table names (no SQL keyword), and the
// external SQL read below is parameterized ($1) — no concatenation/interpolation.
import { action } from "../_generated/server";
import { v } from "convex/values";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.WAREHOUSE_URL });

export const mirrorScenario = action({
  args: { scenarioId: v.string() },
  handler: async (ctx, { scenarioId }) => {
    // Convex document query — "scenarios" is a table name, not SQL.
    const local = await ctx.runQuery("curate_content:getScenario", { scenarioId });

    // Parameterized SQL — the value is bound, never concatenated into the text.
    const sql = "SELECT id, title FROM scenarios WHERE external_id = $1";
    const result = await pool.query(sql, [scenarioId]);

    return { local, remote: result.rows };
  },
});
