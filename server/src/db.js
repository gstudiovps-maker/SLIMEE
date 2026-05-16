import pg from "pg";
import { config } from "./config.js";

const { Pool } = pg;

export const pool = config.databaseUrl
  ? new Pool({
      connectionString: config.databaseUrl,
      ssl: config.databaseUrl.includes("localhost") ? false : { rejectUnauthorized: false }
    })
  : null;

export async function query(text, params) {
  if (!pool) {
    throw new Error("DATABASE_URL is not configured");
  }
  return pool.query(text, params);
}
