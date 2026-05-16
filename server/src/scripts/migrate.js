import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlDir = path.join(__dirname, "../../sql");

async function main() {
  if (!pool) {
    console.error("Set DATABASE_URL in server/.env");
    process.exit(1);
  }

  const allSql = fs.readdirSync(sqlDir).filter((f) => f.endsWith(".sql"));
  const migrations = allSql.filter((f) => f.startsWith("migrate_")).sort();
  const files = [
    ...(allSql.includes("schema.sql") ? ["schema.sql"] : []),
    ...migrations
  ];

  for (const file of files) {
    const sql = fs.readFileSync(path.join(sqlDir, file), "utf8");
    await pool.query(sql);
    console.log(`Applied ${file}`);
  }

  console.log("Migration complete.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
