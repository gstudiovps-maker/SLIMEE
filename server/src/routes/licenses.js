import express from "express";
import { validateLicense } from "../lib/licenses.js";
import {
  validateLicenseForServer,
  activateLicenseFromRequest,
  getRequestClientIp
} from "../lib/licenseValidation.js";
import { unlockScriptForRequest } from "../lib/protection/unlockScript.js";

export const licensesRouter = express.Router();

/**
 * GET /api/licenses/whoami — public IP of the caller (FiveM server outbound).
 */
licensesRouter.get("/whoami", (req, res) => {
  return res.json({ ip: getRequestClientIp(req) });
});

/**
 * POST /api/licenses/activate
 * Body: { licenseKey, packageId, resourceName?, buildId? }
 * IP is taken from the request — nothing in server.cfg required.
 */
licensesRouter.post("/activate", async (req, res) => {
  try {
    const { licenseKey, packageId, resourceName, buildId } = req.body || {};
    if (!licenseKey || !packageId) {
      return res.status(400).json({ valid: false, error: "licenseKey and packageId are required" });
    }

    const result = await activateLicenseFromRequest(req, {
      licenseKey,
      packageId,
      resourceName,
      buildId
    });

    if (!result.valid) {
      return res.status(result.reason === "ip_mismatch" ? 403 : 401).json(result);
    }

    return res.json(result);
  } catch (err) {
    console.error("[licenses/activate]", err);
    return res.status(500).json({ valid: false, error: "Activation failed" });
  }
});

/**
 * POST /api/licenses/validate
 */
/**
 * POST /api/licenses/unlock-script
 * Body: { licenseKey, packageId, buildId, blobB64, resourceName?, vaultPath?, luaPath? }
 * Server-side decrypt only — no keys in customer slimee_license.lua.
 */
licensesRouter.post("/unlock-script", async (req, res) => {
  try {
    const result = await unlockScriptForRequest(req, req.body);
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }
    return res.json({ source: result.source });
  } catch (err) {
    console.error("[licenses/unlock-script]", err);
    return res.status(500).json({ error: "unlock_failed" });
  }
});

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
