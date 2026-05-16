import { pool } from "../db.js";
import { seedPackagesFromJsonIfEmpty } from "../lib/packagesDb.js";
import { seedAdminsFromEnv } from "../lib/adminSeed.js";

async function main() {
  if (!pool) {
    console.error("Set DATABASE_URL in server/.env");
    process.exit(1);
  }
  const pkgCount = await seedPackagesFromJsonIfEmpty();
  await seedAdminsFromEnv();
  console.log(pkgCount ? `Seeded ${pkgCount} packages.` : "Packages already present (skipped JSON import).");
  console.log("Admin seed from env complete.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
