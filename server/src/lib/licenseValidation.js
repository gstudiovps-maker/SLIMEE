import { query } from "../db.js";
import { findByLicenseKey } from "./licenses.js";

function normalizeKey(licenseKey) {
  return String(licenseKey || "").trim().toUpperCase();
}

function normalizeIp(ip) {
  return String(ip || "").trim();
}

export async function logValidationEvent({
  licenseId,
  licenseKey,
  packageId,
  resourceName,
  serverIp,
  fivemLicenseId,
  success,
  reason
}) {
  await query(
    `INSERT INTO license_validation_events
      (license_id, license_key, package_id, resource_name, server_ip, fivem_license_id, success, reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      licenseId ?? null,
      licenseKey ? normalizeKey(licenseKey) : null,
      packageId || null,
      resourceName || null,
      serverIp || null,
      fivemLicenseId || null,
      Boolean(success),
      reason || null
    ]
  );
}

/**
 * FiveM server validation with first-start binding.
 */
export async function validateLicenseForServer({
  licenseKey,
  packageId,
  resourceName,
  serverIp,
  fivemLicenseId
}) {
  const key = normalizeKey(licenseKey);
  const pkgId = String(packageId || "").trim();
  const ip = normalizeIp(serverIp);
  const resource = String(resourceName || "").trim();
  const fivem = String(fivemLicenseId || "").trim();

  if (!key || !pkgId) {
    await logValidationEvent({
      licenseKey: key,
      packageId: pkgId,
      resourceName: resource,
      serverIp: ip,
      fivemLicenseId: fivem,
      success: false,
      reason: "missing_fields"
    });
    return { valid: false, reason: "missing_fields" };
  }

  const row = await findByLicenseKey(key);
  if (!row) {
    await logValidationEvent({
      licenseKey: key,
      packageId: pkgId,
      resourceName: resource,
      serverIp: ip,
      fivemLicenseId: fivem,
      success: false,
      reason: "not_found"
    });
    return { valid: false, reason: "not_found" };
  }

  if (row.status !== "active") {
    await logValidationEvent({
      licenseId: row.id,
      licenseKey: key,
      packageId: pkgId,
      resourceName: resource,
      serverIp: ip,
      fivemLicenseId: fivem,
      success: false,
      reason: "inactive"
    });
    return { valid: false, reason: "inactive", status: row.status };
  }

  if (row.package_id !== pkgId) {
    await logValidationEvent({
      licenseId: row.id,
      licenseKey: key,
      packageId: pkgId,
      resourceName: resource,
      serverIp: ip,
      fivemLicenseId: fivem,
      success: false,
      reason: "wrong_package"
    });
    return { valid: false, reason: "wrong_package" };
  }

  if (row.bound_server_ip && row.bound_at && ip && row.bound_server_ip !== ip) {
    await logValidationEvent({
      licenseId: row.id,
      licenseKey: key,
      packageId: pkgId,
      resourceName: resource,
      serverIp: ip,
      fivemLicenseId: fivem,
      success: false,
      reason: "ip_mismatch"
    });
    return { valid: false, reason: "ip_mismatch" };
  }

  if (!row.bound_at) {
    await query(
      `UPDATE licenses SET
        bound_server_ip = COALESCE(bound_server_ip, $1),
        bound_fivem_license = COALESCE(bound_fivem_license, $2),
        bound_resource_name = COALESCE(bound_resource_name, $3),
        bound_at = NOW(),
        updated_at = NOW()
       WHERE id = $4`,
      [ip || null, fivem || null, resource || null, row.id]
    );
    await logValidationEvent({
      licenseId: row.id,
      licenseKey: key,
      packageId: pkgId,
      resourceName: resource,
      serverIp: ip,
      fivemLicenseId: fivem,
      success: true,
      reason: "bound_first_start"
    });
    return { valid: true, reason: "bound_first_start", bound: true };
  }

  if (row.bound_server_ip && ip && row.bound_server_ip !== ip) {
    await logValidationEvent({
      licenseId: row.id,
      licenseKey: key,
      packageId: pkgId,
      resourceName: resource,
      serverIp: ip,
      fivemLicenseId: fivem,
      success: false,
      reason: "ip_mismatch"
    });
    return { valid: false, reason: "ip_mismatch" };
  }

  if (row.bound_fivem_license && fivem && row.bound_fivem_license !== fivem) {
    await logValidationEvent({
      licenseId: row.id,
      licenseKey: key,
      packageId: pkgId,
      resourceName: resource,
      serverIp: ip,
      fivemLicenseId: fivem,
      success: false,
      reason: "fivem_license_mismatch"
    });
    return { valid: false, reason: "fivem_license_mismatch" };
  }

  if (row.bound_resource_name && resource && row.bound_resource_name !== resource) {
    await logValidationEvent({
      licenseId: row.id,
      licenseKey: key,
      packageId: pkgId,
      resourceName: resource,
      serverIp: ip,
      fivemLicenseId: fivem,
      success: false,
      reason: "resource_mismatch"
    });
    return { valid: false, reason: "resource_mismatch" };
  }

  await logValidationEvent({
    licenseId: row.id,
    licenseKey: key,
    packageId: pkgId,
    resourceName: resource,
    serverIp: ip,
    fivemLicenseId: fivem,
    success: true,
    reason: "ok"
  });

  return { valid: true, reason: "ok" };
}

export async function searchLicenses({ q, limit = 50 } = {}) {
  const term = `%${String(q || "").trim()}%`;
  const result = await query(
    `SELECT id, license_key, package_id, customer_email, status,
            bound_server_ip, bound_fivem_license, bound_resource_name, bound_at, created_at
     FROM licenses
     WHERE ($1 = '%%' OR license_key ILIKE $1 OR customer_email ILIKE $1 OR package_id ILIKE $1)
     ORDER BY created_at DESC
     LIMIT $2`,
    [term, limit]
  );
  return result.rows;
}

export async function updateLicenseStatus(licenseId, status) {
  const result = await query(
    `UPDATE licenses SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
    [status, licenseId]
  );
  return result.rows[0] || null;
}

function isValidIpv4(ip) {
  const parts = String(ip).trim().split(".");
  if (parts.length !== 4) return false;
  return parts.every((p) => {
    const n = Number(p);
    return Number.isInteger(n) && n >= 0 && n <= 255;
  });
}

/** Admin: lock license to a specific server IP (only you can change it in admin). */
export async function setLicenseBoundIp(licenseId, serverIp) {
  const ip = normalizeIp(serverIp);
  if (!isValidIpv4(ip)) {
    throw new Error("Invalid IPv4 address");
  }
  const result = await query(
    `UPDATE licenses SET
      bound_server_ip = $1,
      bound_at = NOW(),
      updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [ip, licenseId]
  );
  return result.rows[0] || null;
}

export async function resetLicenseBinding(licenseId) {
  const result = await query(
    `UPDATE licenses SET
      bound_server_ip = NULL,
      bound_fivem_license = NULL,
      bound_resource_name = NULL,
      bound_at = NULL,
      updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [licenseId]
  );
  return result.rows[0] || null;
}

export async function listValidationEvents({ limit = 100, failedOnly = false } = {}) {
  const sql = failedOnly
    ? `SELECT * FROM license_validation_events WHERE success = FALSE ORDER BY created_at DESC LIMIT $1`
    : `SELECT * FROM license_validation_events ORDER BY created_at DESC LIMIT $1`;
  const result = await query(sql, [limit]);
  return result.rows;
}

export async function getAdminStats() {
  const [licenses, packages, events, revenue] = await Promise.all([
    query(`SELECT COUNT(*)::int AS n FROM licenses`),
    query(`SELECT COUNT(*)::int AS n FROM packages WHERE published = TRUE`),
    query(
      `SELECT COUNT(*)::int AS n FROM license_validation_events WHERE success = FALSE AND created_at > NOW() - INTERVAL '7 days'`
    ),
    query(
      `SELECT COUNT(*)::int AS n FROM licenses WHERE created_at > NOW() - INTERVAL '30 days'`
    )
  ]);

  const recent = await query(
    `SELECT license_key, package_id, customer_email, status, created_at
     FROM licenses ORDER BY created_at DESC LIMIT 8`
  );

  return {
    totalLicenses: licenses.rows[0]?.n ?? 0,
    publishedPackages: packages.rows[0]?.n ?? 0,
    failedValidations7d: events.rows[0]?.n ?? 0,
    licenses30d: revenue.rows[0]?.n ?? 0,
    recentPurchases: recent.rows
  };
}
