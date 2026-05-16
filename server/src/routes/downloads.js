import express from "express";
import crypto from "node:crypto";
import { config } from "../config.js";
import { query } from "../db.js";
import { findByLicenseKey } from "../lib/licenses.js";
import { getPackageById } from "../lib/packages.js";
import { readPackageSourceBuffer } from "../lib/packageFiles.js";
import { buildProtectedPackage } from "../lib/protection/packager.js";

export const downloadsRouter = express.Router();

const TOKEN_TTL_MS = 10 * 60 * 1000;

async function assertActiveLicense(licenseKey, packageId) {
  const license = await findByLicenseKey(licenseKey);
  if (!license) {
    return { ok: false, status: 403, error: "Invalid license", reason: "not_found" };
  }
  if (license.status !== "active") {
    return { ok: false, status: 403, error: "License inactive", reason: license.status };
  }
  if (license.package_id !== packageId) {
    return { ok: false, status: 403, error: "License does not match package", reason: "wrong_package" };
  }
  return { ok: true, license };
}

/**
 * POST /api/downloads/request
 * Body: { licenseKey, packageId }
 */
downloadsRouter.post("/request", async (req, res) => {
  try {
    const { licenseKey, packageId } = req.body || {};
    if (!licenseKey || !packageId) {
      return res.status(400).json({ error: "licenseKey and packageId are required" });
    }

    const check = await assertActiveLicense(licenseKey, packageId);
    if (!check.ok) {
      return res.status(check.status).json({ error: check.error, reason: check.reason });
    }

    const pkg = await getPackageById(packageId);
    if (!pkg) {
      return res.status(404).json({ error: "Package not found" });
    }

    const source = await readPackageSourceBuffer(packageId);
    if (!source) {
      return res.status(404).json({
        error: "Protected source package not uploaded yet",
        hint: "Admin must upload development ZIP via the product manager"
      });
    }

    const token = crypto.randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

    await query(
      `INSERT INTO download_tokens (license_id, token, expires_at) VALUES ($1, $2, $3)`,
      [check.license.id, token, expiresAt]
    );

    return res.json({
      downloadUrl: `${config.apiPublicUrl}/api/downloads/file/${token}`,
      expiresAt: expiresAt.toISOString(),
      packageId,
      delivery: "Protected Package Delivery"
    });
  } catch (err) {
    console.error("[downloads/request]", err);
    return res.status(500).json({ error: "Could not create download link" });
  }
});

/**
 * GET /api/downloads/file/:token — streams customer-specific protected build.
 */
downloadsRouter.get("/file/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const result = await query(
      `SELECT dt.*, l.*
       FROM download_tokens dt
       JOIN licenses l ON l.id = dt.license_id
       WHERE dt.token = $1`,
      [token]
    );

    const row = result.rows[0];
    if (!row) {
      return res.status(404).json({ error: "Download link invalid or expired" });
    }

    if (new Date(row.expires_at) < new Date()) {
      return res.status(410).json({ error: "Download link expired" });
    }

    if (row.status !== "active") {
      return res.status(403).json({ error: "License inactive" });
    }

    const pkg = await getPackageById(row.package_id);
    const source = await readPackageSourceBuffer(row.package_id);
    if (!source || !pkg) {
      return res.status(404).json({ error: "Package source unavailable" });
    }

    const protectedZip = buildProtectedPackage(source, pkg, row);
    const filename = `${row.package_id}-${row.license_key.slice(0, 8)}-protected.zip`;

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(protectedZip);
  } catch (err) {
    console.error("[downloads/file]", err);
    return res.status(500).json({ error: "Download failed" });
  }
});
