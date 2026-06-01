import { query } from "../db.js";

export async function findCustomerByDiscordId(discordId) {
  const res = await query(
    `SELECT id, discord_id, discord_username, discord_global_name, discord_avatar, discord_email, created_at
     FROM customers WHERE discord_id = $1 LIMIT 1`,
    [String(discordId)]
  );
  return res.rows[0] || null;
}

export async function findCustomersByEmail(email) {
  if (!email) {
    return [];
  }
  const res = await query(
    `SELECT id, discord_id, discord_username, discord_global_name, discord_avatar, discord_email
     FROM customers
     WHERE discord_email IS NOT NULL
       AND LOWER(TRIM(discord_email)) = LOWER(TRIM($1))`,
    [email]
  );
  return res.rows;
}

export async function findCustomerById(id) {
  const res = await query(
    `SELECT id, discord_id, discord_username, discord_global_name, discord_avatar, discord_email, created_at
     FROM customers WHERE id = $1 LIMIT 1`,
    [id]
  );
  return res.rows[0] || null;
}

export async function upsertCustomerFromDiscord(profile) {
  const discordId = String(profile.id);
  const username = profile.username || null;
  const globalName = profile.global_name || profile.display_name || null;
  const avatar = profile.avatar || null;
  const email = profile.email || null;

  const res = await query(
    `INSERT INTO customers (discord_id, discord_username, discord_global_name, discord_avatar, discord_email, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (discord_id) DO UPDATE SET
       discord_username = EXCLUDED.discord_username,
       discord_global_name = EXCLUDED.discord_global_name,
       discord_avatar = EXCLUDED.discord_avatar,
       discord_email = COALESCE(EXCLUDED.discord_email, customers.discord_email),
       updated_at = NOW()
     RETURNING id, discord_id, discord_username, discord_global_name, discord_avatar, discord_email, created_at`,
    [discordId, username, globalName, avatar, email]
  );
  return res.rows[0];
}

/** Link licenses to any Discord account that shares this checkout email. */
export async function linkLicensesForCheckoutEmail(email) {
  if (!email) {
    return 0;
  }
  const res = await query(
    `SELECT discord_id, discord_email FROM customers WHERE LOWER(TRIM(discord_email)) = LOWER(TRIM($1))`,
    [email]
  );
  let total = 0;
  for (const row of res.rows) {
    total += await linkLicensesToCustomer(row);
  }
  return total;
}

export async function linkLicensesToCustomer(customer) {
  if (!customer?.discord_id) {
    return 0;
  }
  const email = customer.discord_email;
  if (!email) {
    return 0;
  }
  const res = await query(
    `UPDATE licenses
     SET discord_id = $1
     WHERE discord_id IS NULL
       AND customer_email IS NOT NULL
       AND LOWER(TRIM(customer_email)) = LOWER(TRIM($2))`,
    [customer.discord_id, email]
  );
  return res.rowCount || 0;
}

export async function listLicensesForCustomer(discordId, email) {
  const res = await query(
    `SELECT id, license_key, package_id, customer_email, status, bound_server_ip, created_at
     FROM licenses
     WHERE discord_id = $1
        OR (discord_id IS NULL AND $2 <> '' AND customer_email IS NOT NULL
            AND LOWER(TRIM(customer_email)) = LOWER(TRIM($2)))
     ORDER BY created_at DESC`,
    [String(discordId || ""), String(email || "")]
  );
  return res.rows;
}

export async function getLicenseForCustomer(licenseId, discordId) {
  const res = await query(
    `SELECT id, license_key, package_id, customer_email, status, discord_id
     FROM licenses
     WHERE id = $1 AND discord_id = $2
     LIMIT 1`,
    [licenseId, String(discordId)]
  );
  return res.rows[0] || null;
}

export function customerPublicProfile(row) {
  if (!row) return null;
  const display =
    row.discord_global_name || row.discord_username || `User ${row.discord_id}`;
  let avatarUrl = null;
  if (row.discord_avatar && row.discord_id) {
    avatarUrl = `https://cdn.discordapp.com/avatars/${row.discord_id}/${row.discord_avatar}.png?size=128`;
  } else if (row.discord_id) {
    const disc = Number((BigInt(row.discord_id) >> 22n) % 6n);
    avatarUrl = `https://cdn.discordapp.com/embed/avatars/${disc}.png`;
  }
  return {
    id: row.id,
    discordId: row.discord_id,
    username: row.discord_username,
    displayName: display,
    email: row.discord_email,
    avatarUrl
  };
}
