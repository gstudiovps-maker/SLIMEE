import { query } from "../db.js";

export async function ensureCustomersSchema() {
  try {
    await query(`SELECT 1 FROM customers LIMIT 1`);
    await query(`SELECT discord_id FROM licenses LIMIT 1`);
    return true;
  } catch (err) {
    if (err.code === "42P01" || err.code === "42703") {
      console.warn("[customers] schema missing — run: npm run db:migrate");
      return false;
    }
    console.warn("[customers] schema check:", err.message);
    return false;
  }
}
