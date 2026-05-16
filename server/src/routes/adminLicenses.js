import express from "express";
import { requireAdmin, requireMainAdmin } from "../middleware/adminAuth.js";
import {
  searchLicenses,
  updateLicenseStatus,
  resetLicenseBinding,
  listValidationEvents,
  getAdminStats
} from "../lib/licenseValidation.js";
import { logAdminActivity } from "../lib/adminLog.js";
import { listAdminActivityLogs } from "../lib/adminLog.js";

export const adminLicensesRouter = express.Router();

function clientIp(req) {
  return req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() || null;
}

adminLicensesRouter.use(requireAdmin, requireMainAdmin);

adminLicensesRouter.get("/stats", async (_req, res) => {
  try {
    const stats = await getAdminStats();
    return res.json(stats);
  } catch (err) {
    console.error("[admin stats]", err);
    return res.status(500).json({ error: "Could not load stats" });
  }
});

adminLicensesRouter.get("/search", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const licenses = await searchLicenses({ q, limit: 80 });
    return res.json({ licenses });
  } catch (err) {
    console.error("[admin license search]", err);
    return res.status(500).json({ error: "Search failed" });
  }
});

adminLicensesRouter.get("/validation-events", async (req, res) => {
  try {
    const failedOnly = req.query.failed === "1" || req.query.failed === "true";
    const events = await listValidationEvents({ limit: 150, failedOnly });
    return res.json({ events });
  } catch (err) {
    console.error("[admin validation events]", err);
    return res.status(500).json({ error: "Could not load events" });
  }
});

adminLicensesRouter.get("/audit-logs", async (req, res) => {
  try {
    const logs = await listAdminActivityLogs({ limit: 150 });
    return res.json({ logs });
  } catch (err) {
    return res.status(500).json({ error: "Could not load audit logs" });
  }
});

adminLicensesRouter.post("/:id/reset-binding", async (req, res) => {
  try {
    const row = await resetLicenseBinding(Number(req.params.id));
    if (!row) {
      return res.status(404).json({ error: "License not found" });
    }
    await logAdminActivity({
      adminUserId: req.admin.id,
      adminUsername: req.admin.username,
      action: "license_reset_binding",
      resourceType: "license",
      resourceId: String(row.id),
      ipAddress: clientIp(req)
    });
    return res.json({ license: row });
  } catch (err) {
    return res.status(500).json({ error: "Reset failed" });
  }
});

adminLicensesRouter.post("/:id/suspend", async (req, res) => {
  try {
    const row = await updateLicenseStatus(Number(req.params.id), "suspended");
    if (!row) {
      return res.status(404).json({ error: "License not found" });
    }
    await logAdminActivity({
      adminUserId: req.admin.id,
      adminUsername: req.admin.username,
      action: "license_suspend",
      resourceType: "license",
      resourceId: String(row.id),
      ipAddress: clientIp(req)
    });
    return res.json({ license: row });
  } catch (err) {
    return res.status(500).json({ error: "Suspend failed" });
  }
});

adminLicensesRouter.post("/:id/revoke", async (req, res) => {
  try {
    const row = await updateLicenseStatus(Number(req.params.id), "revoked");
    if (!row) {
      return res.status(404).json({ error: "License not found" });
    }
    await logAdminActivity({
      adminUserId: req.admin.id,
      adminUsername: req.admin.username,
      action: "license_revoke",
      resourceType: "license",
      resourceId: String(row.id),
      ipAddress: clientIp(req)
    });
    return res.json({ license: row });
  } catch (err) {
    return res.status(500).json({ error: "Revoke failed" });
  }
});

adminLicensesRouter.post("/:id/activate", async (req, res) => {
  try {
    const row = await updateLicenseStatus(Number(req.params.id), "active");
    if (!row) {
      return res.status(404).json({ error: "License not found" });
    }
    await logAdminActivity({
      adminUserId: req.admin.id,
      adminUsername: req.admin.username,
      action: "license_activate",
      resourceType: "license",
      resourceId: String(row.id),
      ipAddress: clientIp(req)
    });
    return res.json({ license: row });
  } catch (err) {
    return res.status(500).json({ error: "Activate failed" });
  }
});
