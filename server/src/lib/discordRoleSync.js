import { config } from "../config.js";
import { query } from "../db.js";
import { findCustomersByEmail } from "./customers.js";

const LOG = "[discord-roles]";

function botConfigured() {
  const d = config.discord;
  return Boolean(d.botToken && d.guildId);
}

function maskEmail(email) {
  if (!email || !String(email).includes("@")) return "(none)";
  const [local, domain] = String(email).split("@");
  return `${local.slice(0, 2)}…@${domain}`;
}

function logEvent(event, data = {}) {
  console.log(LOG, JSON.stringify({ event, ...data }));
}

/**
 * PUT /guilds/{guildId}/members/{discordUserId}/roles/{roleId}
 */
async function addGuildMemberRole(discordUserId, roleId) {
  if (!botConfigured() || !roleId || !discordUserId) {
    return { ok: false, skipped: true, reason: "not_configured" };
  }

  const guildId = config.discord.guildId;
  const url = `https://discord.com/api/v10/guilds/${guildId}/members/${discordUserId}/roles/${roleId}`;

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bot ${config.discord.botToken}`,
      "Content-Length": "0"
    }
  });

  if (res.status === 204 || res.status === 201) {
    return { ok: true };
  }

  let body = "";
  try {
    body = await res.text();
  } catch {
    body = "";
  }

  return { ok: false, status: res.status, body: body.slice(0, 200) };
}

export async function customerHasActiveLicense(email, discordId) {
  if (discordId) {
    const byDiscord = await query(
      `SELECT 1 FROM licenses WHERE discord_id = $1 AND status = 'active' LIMIT 1`,
      [String(discordId)]
    );
    if (byDiscord.rows.length > 0) {
      return true;
    }
  }

  if (!email) {
    return false;
  }

  const byEmail = await query(
    `SELECT 1 FROM licenses
     WHERE status = 'active'
       AND customer_email IS NOT NULL
       AND LOWER(TRIM(customer_email)) = LOWER(TRIM($1))
     LIMIT 1`,
    [email]
  );
  return byEmail.rows.length > 0;
}

/**
 * After Discord OAuth — always Verified; Verified Customer if active license.
 */
export async function syncRolesAfterLogin(customer) {
  if (!botConfigured()) {
    return;
  }

  const discordId = String(customer?.discord_id || "");
  if (!discordId) {
    return;
  }

  try {
    const verifiedRoleId = config.discord.verifiedRoleId;
    if (verifiedRoleId) {
      const verified = await addGuildMemberRole(discordId, verifiedRoleId);
      if (verified.ok) {
        logEvent("verified_role_added_after_login", { discordId });
      } else if (!verified.skipped) {
        logEvent("role_sync_failed", {
          phase: "verified_after_login",
          discordId,
          roleId: verifiedRoleId,
          status: verified.status,
          detail: verified.body || verified.reason
        });
      }
    }

    const hasActive = await customerHasActiveLicense(customer.discord_email, discordId);
    const customerRoleId = config.discord.customerRoleId;

    if (hasActive && customerRoleId) {
      const customerRole = await addGuildMemberRole(discordId, customerRoleId);
      if (customerRole.ok) {
        logEvent("customer_role_added_after_login", { discordId });
      } else if (!customerRole.skipped) {
        logEvent("role_sync_failed", {
          phase: "customer_after_login",
          discordId,
          roleId: customerRoleId,
          status: customerRole.status,
          detail: customerRole.body || customerRole.reason
        });
      }
    }
  } catch (err) {
    logEvent("role_sync_failed", {
      phase: "login",
      discordId,
      error: err.message
    });
  }
}

/**
 * After Stripe purchase — customer role only if Discord account already linked.
 */
export async function syncRolesAfterPurchase(checkoutEmail) {
  if (!botConfigured() || !config.discord.customerRoleId) {
    return;
  }

  const email = String(checkoutEmail || "").trim();
  if (!email) {
    return;
  }

  try {
    const customers = await findCustomersByEmail(email);
    if (!customers.length) {
      logEvent("customer_role_pending_no_discord_link", { email: maskEmail(email) });
      return;
    }

    const hasActive = await customerHasActiveLicense(email, null);
    if (!hasActive) {
      return;
    }

    for (const row of customers) {
      const discordId = String(row.discord_id || "");
      if (!discordId) {
        continue;
      }

      const result = await addGuildMemberRole(discordId, config.discord.customerRoleId);
      if (result.ok) {
        logEvent("customer_role_added_after_purchase", { discordId, email: maskEmail(email) });
      } else if (!result.skipped) {
        logEvent("role_sync_failed", {
          phase: "customer_after_purchase",
          discordId,
          roleId: config.discord.customerRoleId,
          status: result.status,
          detail: result.body || result.reason
        });
      }
    }
  } catch (err) {
    logEvent("role_sync_failed", {
      phase: "purchase",
      email: maskEmail(email),
      error: err.message
    });
  }
}
