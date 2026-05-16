import express from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { query } from "../db.js";
import { validateLicense } from "../lib/licenses.js";
import { findByLicenseKey } from "../lib/licenses.js";

export const downloadsRouter = express.Router();

const TOKEN_TTL_MS = 10 * 60 * 1000;

function resolveZipPath(packageId) {
  const filePath = path.join(config.downloadsDir, `${packageId}.zip`);
  if (fs.existsSync(filePath)) {
    return filePath;
  }
  return null;
}

/**
 * POST /api/downloads/request
 * Body: { licenseKey, packageId }
 * Returns short-lived download URL.
 */
downloadsRouter.post("/request", async (req, res) => {
  try {
    const { licenseKey, packageId } = req.body || {};
    if (!licenseKey || !packageId) {
      return res.status(400).json({ error: "licenseKey and packageId are required" });
    }

    const validation = await validateLicense(licenseKey, packageId);
    if (!validation.valid) {
      return res.status(403).json({ error: "Invalid license", reason: validation.reason });
    }

    const zipPath = resolveZipPath(packageId);
    if (!zipPath) {
      return res.status(404).json({
        error: "Download file not available yet",
        hint: `Place ${packageId}.zip in server/downloads/`
      });
    }

    const license = await findByLicenseKey(licenseKey);
    const token = crypto.randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

    await query(
      `INSERT INTO download_tokens (license_id, token, expires_at) VALUES ($1, $2, $3)`,
      [license.id, token, expiresAt]
    );

    const downloadUrl = `${config.apiPublicUrl}/api/downloads/file/${token}`;

    return res.json({
      downloadUrl,
      expiresAt: expiresAt.toISOString(),
      packageId
    });
  } catch (err) {
    console.error("[downloads/request]", err);
    return res.status(500).json({ error: "Could not create download link" });
  }
});

/**
 * GET /api/downloads/file/:token
 */
downloadsRouter.get("/file/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const result = await query(
      `SELECT dt.*, l.package_id, l.license_key, l.status
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

    const zipPath = resolveZipPath(row.package_id);
    if (!zipPath) {
      return res.status(404).json({ error: "File missing on server" });
    }

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${row.package_id}.zip"`);
    fs.createReadStream(zipPath).pipe(res);
  } catch (err) {
    console.error("[downloads/file]", err);
    return res.status(500).json({ error: "Download failed" });
  }
});
