import express from "express";
import { validateLicense } from "../lib/licenses.js";
import { validateLicenseForServer } from "../lib/licenseValidation.js";

export const licensesRouter = express.Router();

/**
 * POST /api/licenses/validate
 * FiveM (server-side): licenseKey, packageId, resourceName, serverIp, fivemLicenseId?
 * Simple check (download page): omit serverIp for basic validation only.
 */
licensesRouter.post("/validate", async (req, res) => {
  try {
    const { licenseKey, packageId, resourceName, serverIp, fivemLicenseId } = req.body || {};
    if (!licenseKey) {
      return res.status(400).json({ valid: false, error: "licenseKey is required" });
    }

    if (serverIp || resourceName || fivemLicenseId) {
      const result = await validateLicenseForServer({
        licenseKey,
        packageId,
        resourceName,
        serverIp,
        fivemLicenseId
      });
      return res.json(result);
    }

    const result = await validateLicense(licenseKey, packageId || null);
    return res.json(result);
  } catch (err) {
    console.error("[validate]", err);
    return res.status(500).json({ valid: false, error: "Validation failed" });
  }
});

licensesRouter.get("/validate", async (req, res) => {
  try {
    const { licenseKey, packageId, resourceName, serverIp, fivemLicenseId } = req.query;
    if (!licenseKey) {
      return res.status(400).json({ valid: false, error: "licenseKey is required" });
    }

    if (serverIp || resourceName || fivemLicenseId) {
      const result = await validateLicenseForServer({
        licenseKey: String(licenseKey),
        packageId: packageId ? String(packageId) : "",
        resourceName: resourceName ? String(resourceName) : "",
        serverIp: serverIp ? String(serverIp) : "",
        fivemLicenseId: fivemLicenseId ? String(fivemLicenseId) : ""
      });
      return res.json(result);
    }

    const result = await validateLicense(String(licenseKey), packageId ? String(packageId) : null);
    return res.json(result);
  } catch (err) {
    console.error("[validate]", err);
    return res.status(500).json({ valid: false, error: "Validation failed" });
  }
});