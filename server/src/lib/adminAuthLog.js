import { pool } from "../db.js";
import { config } from "../config.js";

const PREFIX = "[admin-auth]";

function ts() {
  return new Date().toISOString();
}

export function logAdminAuth(level, message, meta = {}) {
  const payload = { ...meta, at: ts() };
  const line = `${PREFIX} ${message} ${JSON.stringify(payload)}`;
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

function envFlag(name, value) {
  if (!value || !String(value).trim()) {
    return { set: false };
  }
  const s = String(value).trim();
  return {
    set: true,
    length: s.length,
    hasOuterQuotes: s.startsWith('"') && s.endsWith('"')
  };
}

function hashLooksValid(hash) {
  const h = String(hash || "").trim();
  if (!h) {
    return { valid: false, reason: "empty" };
  }
  if (h.startsWith('"') || h.endsWith('"')) {
    return { valid: false, reason: "wrapped_in_quotes_remove_quotes_in_render" };
  }
  if (!/^\$2[aby]\$\d{2}\$/.test(h)) {
    return { valid: false, reason: "not_bcrypt_format_expected_$2b$12$..." };
  }
  if (h.length < 59) {
    return { valid: false, reason: "too_short_for_bcrypt" };
  }
  return { valid: true };
}

export async function countAdminUsers() {
  if (!pool) {
    return null;
  }
  try {
    const res = await pool.query(
      `SELECT COUNT(*)::int AS n FROM admin_users WHERE is_active = TRUE`
    );
    return res.rows[0]?.n ?? 0;
  } catch (err) {
    logAdminAuth("error", "count_admins_failed", { error: err.message });
    return null;
  }
}

export async function listAdminUsernames() {
  if (!pool) {
    return [];
  }
  try {
    const res = await pool.query(
      `SELECT username, role FROM admin_users WHERE is_active = TRUE ORDER BY username`
    );
    return res.rows;
  } catch (err) {
    logAdminAuth("error", "list_admins_failed", { error: err.message });
    return [];
  }
}

export async function logAdminStartupDiagnostics() {
  const jwt = envFlag("JWT_SECRET", config.jwtSecret);
  const mainUser = envFlag("MAIN_ADMIN_USERNAME", config.mainAdminUsername);
  const mainHash = envFlag("MAIN_ADMIN_PASSWORD_HASH", config.mainAdminPasswordHash);
  const hashCheck = hashLooksValid(config.mainAdminPasswordHash);

  logAdminAuth("info", "startup_config_check", {
    nodeEnv: config.nodeEnv,
    databaseConfigured: Boolean(config.databaseUrl),
    poolReady: Boolean(pool),
    jwtSecret: jwt,
    mainAdminUsername: mainUser,
    mainAdminPasswordHash: { ...mainHash, bcrypt: hashCheck },
    admin2Username: envFlag("ADMIN2_USERNAME", config.admin2Username),
    admin3Username: envFlag("ADMIN3_USERNAME", config.admin3Username),
    admin4Username: envFlag("ADMIN4_USERNAME", config.admin4Username),
    corsOrigins: config.corsOrigins
  });

  if (!pool) {
    logAdminAuth("warn", "startup_no_database", {
      hint: "Set DATABASE_URL on Render and run db:migrate"
    });
    return;
  }

  if (!config.jwtSecret) {
    logAdminAuth("warn", "startup_jwt_missing", {
      hint: "Set JWT_SECRET on Render — login returns 503 and admin seed is skipped"
    });
  }

  if (config.mainAdminUsername && !hashCheck.valid) {
    logAdminAuth("warn", "startup_main_admin_hash_invalid", {
      username: config.mainAdminUsername,
      ...hashCheck,
      hint: "Run: npm run hash-password -- YourPassword and paste full hash with NO quotes"
    });
  }

  const admins = await listAdminUsernames();
  logAdminAuth("info", "startup_admin_accounts_in_db", {
    count: admins.length,
    users: admins.map((a) => ({ username: a.username, role: a.role }))
  });

  if (admins.length === 0) {
    logAdminAuth("warn", "startup_no_admin_users", {
      hint: "Set MAIN_ADMIN_USERNAME + MAIN_ADMIN_PASSWORD_HASH and redeploy, or run npm run db:seed"
    });
  }
}

export function logLoginAttempt({ username, ip, origin }) {
  logAdminAuth("info", "login_attempt", {
    username: username || "(empty)",
    ip: ip || "unknown",
    origin: origin || null
  });
}

export function logLoginResult({ username, ip, ok, reason, statusCode, userId, role }) {
  const level = ok ? "info" : "warn";
  logAdminAuth(level, ok ? "login_success" : "login_failed", {
    username,
    ip: ip || "unknown",
    reason: reason || (ok ? "ok" : "unknown"),
    statusCode,
    userId: userId ?? null,
    role: role ?? null
  });
}
