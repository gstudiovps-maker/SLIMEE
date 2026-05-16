import crypto from "node:crypto";
import { query } from "../db.js";

export const DOWNLOAD_TOKEN_TTL_MS = 10 * 60 * 1000;

export function normalizeDownloadToken(token) {
  return String(token || "").trim().toLowerCase();
}

export async function createDownloadToken({ licenseId, packageId, storageKey }) {
  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + DOWNLOAD_TOKEN_TTL_MS);

  try {
    const result = await query(
      `INSERT INTO download_tokens (license_id, package_id, storage_key, token, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, license_id, package_id, storage_key, token, expires_at, created_at`,
      [licenseId, packageId, storageKey || null, token, expiresAt]
    );
    return result.rows[0];
  } catch (err) {
    if (err.code !== "42703") {
      throw err;
    }
    const result = await query(
      `INSERT INTO download_tokens (license_id, token, expires_at)
       VALUES ($1, $2, $3)
       RETURNING id, license_id, token, expires_at, created_at`,
      [licenseId, token, expiresAt]
    );
    return {
      ...result.rows[0],
      package_id: packageId,
      storage_key: storageKey || null
    };
  }
}

export async function findDownloadToken(tokenValue) {
  const token = normalizeDownloadToken(tokenValue);
  if (!token) {
    return null;
  }

  try {
    const result = await query(
      `SELECT
         dt.id AS download_token_id,
         dt.token,
         dt.expires_at,
         dt.storage_key,
         dt.package_id AS token_package_id,
         dt.created_at AS token_created_at,
         l.id AS license_row_id,
         l.license_key,
         l.package_id,
         l.customer_email,
         l.status AS license_status
       FROM download_tokens dt
       INNER JOIN licenses l ON l.id = dt.license_id
       WHERE dt.token = $1`,
      [token]
    );
    return result.rows[0] || null;
  } catch (err) {
    if (err.code !== "42703") {
      throw err;
    }
    const result = await query(
      `SELECT
         dt.id AS download_token_id,
         dt.token,
         dt.expires_at,
         dt.created_at AS token_created_at,
         l.id AS license_row_id,
         l.license_key,
         l.package_id,
         l.customer_email,
         l.status AS license_status
       FROM download_tokens dt
       INNER JOIN licenses l ON l.id = dt.license_id
       WHERE dt.token = $1`,
      [token]
    );
    const row = result.rows[0];
    if (!row) return null;
    return { ...row, storage_key: null, token_package_id: null };
  }
}

export async function countDownloadTokensForLicense(licenseId) {
  const result = await query(
    `SELECT COUNT(*)::int AS count FROM download_tokens WHERE license_id = $1`,
    [licenseId]
  );
  return result.rows[0]?.count ?? 0;
}
