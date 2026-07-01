"use node";
// Dirty: raw SQL assembled from user input by interpolation and concatenation and
// handed to SQL execution sinks — classic injection.
import { action } from "../_generated/server";
import { v } from "convex/values";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.WAREHOUSE_URL });

export const tallyForVoter = action({
  args: { voterId: v.string(), region: v.string() },
  handler: async (ctx, { voterId, region }) => {
    // ❌ template-literal interpolation of user input into the SQL text.
    const rows = await pool.query(
      `SELECT COUNT(*) FROM votes WHERE voter_id = '${voterId}'`,
    );

    // ❌ string concatenation of user input into a DELETE.
    await pool.$executeRawUnsafe(
      "DELETE FROM votes WHERE region = '" + region + "'",
    );

    return rows.rows;
  },
});
