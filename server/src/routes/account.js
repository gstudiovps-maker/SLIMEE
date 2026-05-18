import express from "express";
import { requireCustomer } from "../middleware/customerAuth.js";
import {
  customerPublicProfile,
  listLicensesForCustomer
} from "../lib/customers.js";
import { getPackageById } from "../lib/packages.js";
import { downloadRequestHandler } from "./downloads.js";

export const accountRouter = express.Router();

accountRouter.get("/me", requireCustomer, (req, res) => {
  return res.json({
    customer: customerPublicProfile(req.customer)
  });
});

accountRouter.get("/licenses", requireCustomer, async (req, res) => {
  try {
    const rows = await listLicensesForCustomer(req.customer.discord_id);
    const licenses = await Promise.all(
      rows.map(async (row) => {
        const pkg = await getPackageById(row.package_id);
        return {
          id: row.id,
          licenseKey: row.license_key,
          packageId: row.package_id,
          packageName: pkg?.name || row.package_id,
          email: row.customer_email,
          status: row.status,
          boundServerIp: row.bound_server_ip || null,
          purchasedAt: row.created_at
        };
      })
    );
    return res.json({ licenses });
  } catch (err) {
    console.error("[account/licenses]", err);
    return res.status(500).json({ error: "Could not load purchases" });
  }
});

/** POST /api/account/licenses/:licenseId/download — authenticated re-download */
accountRouter.post("/licenses/:licenseId/download", requireCustomer, async (req, res) => {
  try {
    const licenseId = Number(req.params.licenseId);
    if (!Number.isFinite(licenseId)) {
      return res.status(400).json({ error: "Invalid license id" });
    }

    const rows = await listLicensesForCustomer(req.customer.discord_id);
    const license = rows.find((r) => r.id === licenseId);
    if (!license) {
      return res.status(404).json({ error: "Purchase not found on this account" });
    }
    if (license.status !== "active") {
      return res.status(403).json({ error: "License is not active", status: license.status });
    }

    req.body = {
      licenseKey: license.license_key,
      packageId: license.package_id
    };
    return downloadRequestHandler(req, res);
  } catch (err) {
    console.error("[account/download]", err);
    return res.status(500).json({ error: "Download failed" });
  }
});
