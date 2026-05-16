import express from "express";
import { validateLicense } from "../lib/licenses.js";

export const licensesRouter = express.Router();

/**
 * POST /api/licenses/validate
 * Body: { licenseKey, packageId? }
 * Used by FiveM resources (server-side recommended).
 */
licensesRouter.post("/validate", async (req, res) => {
  try {
    const { licenseKey, packageId } = req.body || {};
    if (!licenseKey) {
      return res.status(400).json({ valid: false, error: "licenseKey is required" });
    }

    const result = await validateLicense(licenseKey, packageId || null);
    return res.json(result);
  } catch (err) {
    console.error("[validate]", err);
    return res.status(500).json({ valid: false, error: "Validation failed" });
  }
});

/**
 * GET /api/licenses/validate?licenseKey=...&packageId=...
 */
licensesRouter.get("/validate", async (req, res) => {
  try {
    const { licenseKey, packageId } = req.query;
    if (!licenseKey) {
      return res.status(400).json({ valid: false, error: "licenseKey is required" });
    }

    const result = await validateLicense(String(licenseKey), packageId ? String(packageId) : null);
    return res.json(result);
  } catch (err) {
    console.error("[validate]", err);
    return res.status(500).json({ valid: false, error: "Validation failed" });
  }
});
