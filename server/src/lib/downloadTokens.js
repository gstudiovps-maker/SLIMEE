import crypto from "node:crypto";
import { query } from "../db.js";
import { logDownload } from "./downloadLog.js";

export const DOWNLOAD_TOKEN_TTL_MS = 10 * 60 * 1000;
export const DOWNLOAD_TOKEN_STORAGE = "postgresql:download_tokens";

export function normalizeDownloadToken(token) {
  return String(token || "").trim().toLowerCase();
}

export async function createDownloadToken({ licenseId, packageId, storageKey }) {
  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + DOWNLOAD_TOKEN_TTL_MS);

  logDownload("token_insert_start", {
    storage: DOWNLOAD_TOKEN_STORAGE,
    licenseId,
    packageId,
    storageKey: storageKey || null,
    token,
    tokenLength: token.length,
    expiresAt: expiresAt.toISOString()
  });

  let row;
  try {
    const result = await query(
      `INSERT INTO download_tokens (license_id, package_id, storage_key, token, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, license_id, package_id, storage_key, token, expires_at, created_at`,
      [licenseId, packageId, storageKey || null, token, expiresAt]
    );
    row = result.rows[0];
  } catch (err) {
    if (err.code === "42P01") {
      logDownload("token_insert_error", { error: "download_tokens table missing — run npm run db:migrate" });
      throw new Error("download_tokens table missing. Run database migrations on Render.");
    }
    if (err.code !== "42703") {
      logDownload("token_insert_error", { error: err.message, code: err.code });
      throw err;
    }
    const result = await query(
      `INSERT INTO download_tokens (license_id, token, expires_at)
       VALUES ($1, $2, $3)
       RETURNING id, license_id, token, expires_at, created_at`,
      [licenseId, token, expiresAt]
    );
    row = {
      ...result.rows[0],
      package_id: packageId,
      storage_key: storageKey || null
    };
    logDownload("token_insert_legacy_columns", { token, downloadTokenId: row.id });
  }

  const verified = await findDownloadTokenRow(token);
  if (!verified) {
    logDownload("token_insert_verify_failed", { token, storage: DOWNLOAD_TOKEN_STORAGE });
    throw new Error("Download token was not persisted to PostgreSQL");
  }

  logDownload("token_insert_ok", {
    storage: DOWNLOAD_TOKEN_STORAGE,
    downloadTokenId: row.id,
    token: row.token,
    tokenMatches: verified.token === token,
    expiresAt: row.expires_at
  });

  return row;
}

async function findDownloadTokenRow(token) {
  const normalized = normalizeDownloadToken(token);
  const result = await query(
    `SELECT id, license_id, package_id, storage_key, token, expires_at, used_at, created_at
     FROM download_tokens
     WHERE token = $1`,
    [normalized]
  );
  return result.rows[0] || null;
}

export async function findDownloadToken(tokenValue) {
  const receivedRaw = String(tokenValue || "");
  const token = normalizeDownloadToken(tokenValue);

  logDownload("token_lookup_start", {
    storage: DOWNLOAD_TOKEN_STORAGE,
    receivedRaw,
    receivedNormalized: token,
    receivedLength: token.length
  });

  if (!token) {
    return null;
  }

  const dt = await findDownloadTokenRow(token);
  if (!dt) {
    const countResult = await query(`SELECT COUNT(*)::int AS total FROM download_tokens`);
    logDownload("token_lookup_miss", {
      receivedNormalized: token,
      totalTokensInTable: countResult.rows[0]?.total ?? null
    });
    return null;
  }

  logDownload("token_lookup_hit", {
    downloadTokenId: dt.id,
    storedToken: dt.token,
    tokensMatch: dt.token === token,
    expiresAt: dt.expires_at,
    packageId: dt.package_id,
    licenseId: dt.license_id
  });

  const licenseResult = await query(
    `SELECT id, license_key, package_id, customer_email, status,
            bound_server_ip, bound_fivem_license, bound_resource_name, bound_at
     FROM licenses WHERE id = $1`,
    [dt.license_id]
  );
  const license = licenseResult.rows[0];
  if (!license) {
    logDownload("token_lookup_license_missing", {
      downloadTokenId: dt.id,
      licenseId: dt.license_id
    });
    return null;
  }

  return {
    download_token_id: dt.id,
    token: dt.token,
    expires_at: dt.expires_at,
    used_at: dt.used_at,
    storage_key: dt.storage_key,
    token_package_id: dt.package_id,
    token_created_at: dt.created_at,
    license_row_id: license.id,
    license_key: license.license_key,
    package_id: license.package_id,
    customer_email: license.customer_email,
    license_status: license.status,
    bound_server_ip: license.bound_server_ip,
    bound_at: license.bound_at
  };
}

export async function markDownloadTokenUsed(tokenValue) {
  const token = normalizeDownloadToken(tokenValue);
  await query(
    `UPDATE download_tokens SET used_at = NOW() WHERE token = $1 AND used_at IS NULL`,
    [token]
  );
}

export async function countDownloadTokensForLicense(licenseId) {
  const result = await query(
    `SELECT COUNT(*)::int AS count FROM download_tokens WHERE license_id = $1`,
    [licenseId]
  );
  return result.rows[0]?.count ?? 0;
}
