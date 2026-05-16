import { query } from "../db.js";
import { generateLicenseKey } from "./licenseKey.js";

function normalizeKey(licenseKey) {
  return String(licenseKey || "").trim().toUpperCase();
}

export async function createLicense({ packageId, customerEmail, stripeSessionId, stripePaymentIntent }) {
  const existing = await findBySessionAndPackage(stripeSessionId, packageId);
  if (existing) {
    return existing;
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const licenseKey = generateLicenseKey();
    try {
      const result = await query(
        `INSERT INTO licenses (license_key, package_id, customer_email, stripe_session_id, stripe_payment_intent, status)
         VALUES ($1, $2, $3, $4, $5, 'active')
         RETURNING *`,
        [licenseKey, packageId, customerEmail || null, stripeSessionId, stripePaymentIntent || null]
      );
      return result.rows[0];
    } catch (err) {
      if (err.code === "23505" && err.constraint?.includes("license_key")) {
        continue;
      }
      if (err.code === "23505") {
        const raced = await findBySessionAndPackage(stripeSessionId, packageId);
        if (raced) {
          return raced;
        }
      }
      throw err;
    }
  }
  throw new Error("Could not generate unique license key");
}

/** First license row for session (legacy single-package lookups). */
export async function findByStripeSession(stripeSessionId) {
  const rows = await findLicensesByStripeSession(stripeSessionId);
  return rows[0] || null;
}

export async function findLicensesByStripeSession(stripeSessionId) {
  const result = await query(
    `SELECT * FROM licenses WHERE stripe_session_id = $1 ORDER BY id ASC`,
    [stripeSessionId]
  );
  return result.rows;
}

export async function findBySessionAndPackage(stripeSessionId, packageId) {
  const result = await query(
    `SELECT * FROM licenses WHERE stripe_session_id = $1 AND package_id = $2`,
    [stripeSessionId, packageId]
  );
  return result.rows[0] || null;
}

export async function findByLicenseKey(licenseKey) {
  const result = await query(`SELECT * FROM licenses WHERE license_key = $1`, [normalizeKey(licenseKey)]);
  return result.rows[0] || null;
}

export async function validateLicense(licenseKey, packageId) {
  const row = await findByLicenseKey(licenseKey);
  if (!row) {
    return { valid: false, reason: "not_found" };
  }
  if (row.status !== "active") {
    return { valid: false, reason: "inactive", license: sanitize(row) };
  }
  if (packageId && row.package_id !== packageId) {
    return { valid: false, reason: "wrong_package", license: sanitize(row) };
  }
  return { valid: true, license: sanitize(row) };
}

function sanitize(row) {
  return {
    licenseKey: row.license_key,
    packageId: row.package_id,
    status: row.status,
    createdAt: row.created_at
  };
}
