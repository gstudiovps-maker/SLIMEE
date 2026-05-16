import { pool } from "../db.js";
import { config } from "../config.js";
import { hashPassword } from "./auth.js";
import { countAdminUsers, logAdminAuth, listAdminUsernames } from "./adminAuthLog.js";

async function upsertAdmin(username, passwordHash, role) {
  const user = String(username || "").trim().toLowerCase();
  if (!user || !passwordHash) {
    return false;
  }
  await pool.query(
    `INSERT INTO admin_users (username, password_hash, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (username) DO UPDATE
     SET password_hash = EXCLUDED.password_hash,
         role = EXCLUDED.role,
         is_active = TRUE`,
    [user, passwordHash, role === "main" ? "main" : "admin"]
  );
  logAdminAuth("info", "admin_user_upserted", { username: user, role });
  return true;
}

export async function seedAdminsFromEnv() {
  if (!pool) {
    logAdminAuth("warn", "seed_skipped", { reason: "no_database_pool" });
    return 0;
  }

  if (!config.jwtSecret) {
    logAdminAuth("warn", "seed_skipped", {
      reason: "jwt_secret_missing",
      hint: "Set JWT_SECRET on Render before admin accounts can be created"
    });
    return 0;
  }

  let seeded = 0;

  if (config.mainAdminUsername && config.mainAdminPasswordHash) {
    if (await upsertAdmin(config.mainAdminUsername, config.mainAdminPasswordHash, "main")) {
      seeded += 1;
    }
  } else {
    logAdminAuth("warn", "seed_main_admin_incomplete", {
      hasUsername: Boolean(config.mainAdminUsername),
      hasPasswordHash: Boolean(config.mainAdminPasswordHash)
    });
  }

  const secondary = [
    { username: config.admin2Username, hash: config.admin2PasswordHash },
    { username: config.admin3Username, hash: config.admin3PasswordHash },
    { username: config.admin4Username, hash: config.admin4PasswordHash }
  ];

  for (const entry of secondary) {
    if (entry.username && entry.hash) {
      if (await upsertAdmin(entry.username, entry.hash, "admin")) {
        seeded += 1;
      }
    }
  }

  if (config.adminSeedJson) {
    try {
      const list = JSON.parse(config.adminSeedJson);
      if (Array.isArray(list)) {
        for (const row of list) {
          const username = row.username;
          let hash = row.passwordHash || row.password_hash;
          if (!hash && row.password) {
            hash = await hashPassword(row.password);
          }
          const role = row.role === "main" ? "main" : "admin";
          if (username && hash && (await upsertAdmin(username, hash, role))) {
            seeded += 1;
          }
        }
      }
    } catch (err) {
      logAdminAuth("warn", "seed_admin_json_invalid", { error: err.message });
    }
  }

  const total = await countAdminUsers();
  const users = await listAdminUsernames();
  logAdminAuth("info", "seed_complete", {
    upsertedFromEnv: seeded,
    activeAdminsInDb: total,
    users: users.map((u) => u.username)
  });

  return seeded;
}
