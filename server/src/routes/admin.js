import express from "express";
import { config } from "../config.js";
import { findAdminByUsername, signAdminToken, verifyAdminPassword } from "../lib/auth.js";
import { logAdminActivity, listAdminActivityLogs } from "../lib/adminLog.js";
import {
  loadPackages,
  getPackageById,
  upsertPackage,
  deletePackageById
} from "../lib/packages.js";
import { requireAdmin, requireMainAdmin } from "../middleware/adminAuth.js";

export const adminRouter = express.Router();

const loginAttempts = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 20;

function clientIp(req) {
  return (
    req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    null
  );
}

function checkLoginRateLimit(ip) {
  const key = ip || "unknown";
  const now = Date.now();
  let entry = loginAttempts.get(key);
  if (!entry || now - entry.start > LOGIN_WINDOW_MS) {
    entry = { start: now, count: 0 };
    loginAttempts.set(key, entry);
  }
  entry.count += 1;
  return entry.count <= LOGIN_MAX_ATTEMPTS;
}

function sanitizePackageInput(body) {
  const raw = body && typeof body === "object" ? body : {};
  const id = String(raw.id || "").trim();
  if (!id || !/^[a-z0-9][a-z0-9-]{0,126}$/i.test(id)) {
    throw new Error("Invalid package id (use letters, numbers, hyphens)");
  }
  return {
    ...raw,
    id,
    published: raw.published !== false
  };
}

adminRouter.post("/login", async (req, res) => {
  try {
    if (!config.jwtSecret) {
      return res.status(503).json({ error: "Admin auth is not configured on the server." });
    }

    const ip = clientIp(req);
    if (!checkLoginRateLimit(ip)) {
      return res.status(429).json({ error: "Too many login attempts. Try again later." });
    }

    const username = String(req.body?.username || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }

    const user = await findAdminByUsername(username);
    if (!user?.is_active) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const ok = await verifyAdminPassword(password, user.password_hash);
    if (!ok) {
      await logAdminActivity({
        adminUserId: user?.id,
        adminUsername: username.toLowerCase(),
        action: "login_failed",
        details: { reason: "bad_password" },
        ipAddress: ip
      });
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = signAdminToken(user);
    await logAdminActivity({
      adminUserId: user.id,
      adminUsername: user.username,
      action: "login_success",
      ipAddress: ip
    });

    return res.json({
      token,
      user: {
        username: user.username,
        role: user.role
      }
    });
  } catch (err) {
    console.error("[admin login]", err);
    return res.status(500).json({ error: "Login failed" });
  }
});

adminRouter.get("/me", requireAdmin, (req, res) => {
  return res.json({ user: req.admin });
});

adminRouter.get("/packages", requireAdmin, async (_req, res) => {
  try {
    const packages = await loadPackages({ publishedOnly: false, bypassCache: true });
    return res.json({ packages });
  } catch (err) {
    console.error("[admin packages list]", err);
    return res.status(500).json({ error: "Could not load packages" });
  }
});

adminRouter.get("/packages/:id", requireAdmin, async (req, res) => {
  try {
    const pkg = await getPackageById(req.params.id, { publishedOnly: false, bypassCache: true });
    if (!pkg) {
      return res.status(404).json({ error: "Package not found" });
    }
    return res.json({ package: pkg });
  } catch (err) {
    console.error("[admin package get]", err);
    return res.status(500).json({ error: "Could not load package" });
  }
});

adminRouter.post("/packages", requireAdmin, async (req, res) => {
  try {
    const input = sanitizePackageInput(req.body);
    const existing = await getPackageById(input.id, { publishedOnly: false, bypassCache: true });
    if (existing) {
      return res.status(409).json({ error: "Package id already exists" });
    }
    const saved = await upsertPackage(input, { published: input.published !== false });
    await logAdminActivity({
      adminUserId: req.admin.id,
      adminUsername: req.admin.username,
      action: "package_create",
      resourceType: "package",
      resourceId: saved.id,
      details: { name: saved.name },
      ipAddress: clientIp(req)
    });
    return res.status(201).json({ package: saved });
  } catch (err) {
    return res.status(400).json({ error: err.message || "Invalid package data" });
  }
});

adminRouter.put("/packages/:id", requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const existing = await getPackageById(id, { publishedOnly: false, bypassCache: true });
    if (!existing) {
      return res.status(404).json({ error: "Package not found" });
    }
    const input = sanitizePackageInput({ ...req.body, id });
    if (input.id !== id) {
      return res.status(400).json({ error: "Package id cannot be changed" });
    }
    const saved = await upsertPackage(input, { published: input.published !== false });
    await logAdminActivity({
      adminUserId: req.admin.id,
      adminUsername: req.admin.username,
      action: "package_update",
      resourceType: "package",
      resourceId: saved.id,
      details: { name: saved.name },
      ipAddress: clientIp(req)
    });
    return res.json({ package: saved });
  } catch (err) {
    return res.status(400).json({ error: err.message || "Invalid package data" });
  }
});

adminRouter.delete("/packages/:id", requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const existing = await getPackageById(id, { publishedOnly: false, bypassCache: true });
    if (!existing) {
      return res.status(404).json({ error: "Package not found" });
    }
    await deletePackageById(id);
    await logAdminActivity({
      adminUserId: req.admin.id,
      adminUsername: req.admin.username,
      action: "package_delete",
      resourceType: "package",
      resourceId: id,
      details: { name: existing.name },
      ipAddress: clientIp(req)
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error("[admin package delete]", err);
    return res.status(500).json({ error: "Could not delete package" });
  }
});

adminRouter.get("/logs", requireAdmin, requireMainAdmin, async (req, res) => {
  try {
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 100));
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const logs = await listAdminActivityLogs({ limit, offset });
    return res.json({ logs });
  } catch (err) {
    console.error("[admin logs]", err);
    return res.status(500).json({ error: "Could not load activity logs" });
  }
});
