import { verifyAdminToken } from "../lib/auth.js";

export function requireAdmin(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }
  const payload = verifyAdminToken(token);
  if (!payload?.sub) {
    return res.status(401).json({ error: "Invalid or expired session" });
  }
  req.admin = {
    id: payload.sub,
    username: payload.username,
    role: payload.role
  };
  return next();
}

export function requireMainAdmin(req, res, next) {
  if (req.admin?.role !== "main") {
    return res.status(403).json({ error: "Main admin access required" });
  }
  return next();
}
