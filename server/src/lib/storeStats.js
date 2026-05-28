import { config } from "../config.js";
import { pool, query } from "../db.js";
import { getPackageById } from "./packages.js";

const LOG = "[store-stats]";
const SERVER_CACHE_TTL_MS = 30 * 1000;

let serverCache = { at: 0, data: null };

/**
 * Customer with the most active purchases.
 * Falls back gracefully (null) when the DB is unavailable.
 */
export async function getTopCustomer() {
  if (!pool) {
    return null;
  }
  try {
    const result = await query(
      `SELECT
         COALESCE(c.discord_global_name, c.discord_username, split_part(l.customer_email, '@', 1)) AS name,
         COUNT(*)::int AS purchases
       FROM licenses l
       LEFT JOIN customers c ON c.discord_id = l.discord_id
       WHERE l.status = 'active'
       GROUP BY
         COALESCE(NULLIF(l.discord_id, ''), LOWER(l.customer_email)),
         COALESCE(c.discord_global_name, c.discord_username, split_part(l.customer_email, '@', 1))
       ORDER BY purchases DESC, MAX(l.created_at) DESC
       LIMIT 1`
    );
    const row = result.rows[0];
    if (!row || !row.name) {
      return null;
    }
    return { name: row.name, purchases: row.purchases };
  } catch (err) {
    console.warn(LOG, "top customer query failed:", err.message);
    return null;
  }
}

/**
 * Most recent purchases for the "Recent Payments" panel.
 */
export async function getRecentPayments(limit = 6) {
  if (!pool) {
    return [];
  }
  try {
    const result = await query(
      `SELECT
         COALESCE(c.discord_global_name, c.discord_username, split_part(l.customer_email, '@', 1)) AS name,
         l.package_id,
         l.created_at
       FROM licenses l
       LEFT JOIN customers c ON c.discord_id = l.discord_id
       WHERE l.status = 'active'
       ORDER BY l.created_at DESC
       LIMIT $1`,
      [Math.max(1, Math.min(20, Number(limit) || 6))]
    );

    return Promise.all(
      result.rows.map(async (row) => {
        let packageName = row.package_id;
        try {
          const pkg = await getPackageById(row.package_id);
          packageName = pkg?.name || row.package_id;
        } catch {
          /* keep package id as fallback */
        }
        return {
          name: row.name || "Customer",
          packageName,
          createdAt: row.created_at
        };
      })
    );
  } catch (err) {
    console.warn(LOG, "recent payments query failed:", err.message);
    return [];
  }
}

/**
 * Live FiveM server info from the cfx.re server list, by join code.
 */
export async function getServerStats() {
  const code = config.server.fivemCode;
  if (!code) {
    return {
      connectUrl: config.server.connectUrl || null,
      online: false,
      clients: null,
      maxClients: null
    };
  }

  if (serverCache.data && Date.now() - serverCache.at < SERVER_CACHE_TTL_MS) {
    return serverCache.data;
  }

  let data = {
    connectUrl: config.server.connectUrl || `https://cfx.re/join/${code}`,
    online: false,
    clients: null,
    maxClients: null,
    hostname: null
  };

  try {
    const res = await fetch(
      `https://servers-frontend.fivem.net/api/servers/single/${encodeURIComponent(code)}`,
      { headers: { "User-Agent": "SlimeeStore/1.0", Accept: "application/json" } }
    );
    if (res.ok) {
      const json = await res.json();
      const d = json?.Data || {};
      data = {
        ...data,
        online: true,
        clients: Number(d.clients) || 0,
        maxClients: Number(d.sv_maxclients ?? d.svMaxclients) || null,
        hostname: d.hostname || null
      };
    }
  } catch (err) {
    console.warn(LOG, "fivem server lookup failed:", err.message);
  }

  serverCache = { at: Date.now(), data };
  return data;
}
