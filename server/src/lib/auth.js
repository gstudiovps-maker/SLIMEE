import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { pool } from "../db.js";

export async function findAdminByUsername(username) {
  if (!pool) {
    return null;
  }
  const res = await pool.query(
    `SELECT id, username, password_hash, role, is_active
     FROM admin_users
     WHERE username = $1
     LIMIT 1`,
    [String(username || "").trim().toLowerCase()]
  );
  return res.rows[0] || null;
}

export async function verifyAdminPassword(plain, hash) {
  return bcrypt.compare(String(plain || ""), String(hash || ""));
}

export function signAdminToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      username: user.username,
      role: user.role
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

export function verifyAdminToken(token) {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch {
    return null;
  }
}

export function hashPassword(plain) {
  return bcrypt.hash(String(plain), 12);
}
