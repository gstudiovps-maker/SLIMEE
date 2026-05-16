import { pool } from "../db.js";

export async function logAdminActivity({
  adminUserId,
  adminUsername,
  action,
  resourceType = null,
  resourceId = null,
  details = null,
  ipAddress = null
}) {
  if (!pool) {
    return;
  }
  await pool.query(
    `INSERT INTO admin_activity_logs
      (admin_user_id, admin_username, action, resource_type, resource_id, details, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      adminUserId ?? null,
      adminUsername,
      action,
      resourceType,
      resourceId,
      details ? JSON.stringify(details) : null,
      ipAddress
    ]
  );
}

export async function listAdminActivityLogs({ limit = 100, offset = 0 } = {}) {
  if (!pool) {
    return [];
  }
  const res = await pool.query(
    `SELECT id, admin_user_id, admin_username, action, resource_type, resource_id,
            details, ip_address, created_at
     FROM admin_activity_logs
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return res.rows;
}
