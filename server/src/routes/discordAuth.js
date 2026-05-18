import express from "express";
import { config } from "../config.js";
import {
  signCustomerToken,
  signOAuthState,
  verifyOAuthState
} from "../lib/customerAuth.js";
import { upsertCustomerFromDiscord, linkLicensesToCustomer } from "../lib/customers.js";
import { syncRolesAfterLogin } from "../lib/discordRoleSync.js";

export const discordAuthRouter = express.Router();

function discordConfigured() {
  return Boolean(config.discord.clientId && config.discord.clientSecret && config.discord.redirectUri);
}

function safeReturnTo(raw) {
  const fallback = `${config.frontendUrl}/account/`;
  if (!raw || typeof raw !== "string") {
    return fallback;
  }
  try {
    const url = new URL(raw);
    const allowed = config.corsOrigins.some((origin) => {
      try {
        return new URL(origin).origin === url.origin;
      } catch {
        return false;
      }
    });
    if (!allowed && url.origin !== new URL(config.frontendUrl).origin) {
      return fallback;
    }
    return url.toString();
  } catch {
    return fallback;
  }
}

async function exchangeDiscordCode(code) {
  const body = new URLSearchParams({
    client_id: config.discord.clientId,
    client_secret: config.discord.clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: config.discord.redirectUri
  });

  const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const tokenData = await tokenRes.json();
  if (!tokenRes.ok) {
    throw new Error(tokenData.error_description || tokenData.error || "Discord token exchange failed");
  }

  const userRes = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` }
  });
  const user = await userRes.json();
  if (!userRes.ok) {
    throw new Error(user.message || "Could not load Discord profile");
  }
  return user;
}

/** GET /api/auth/discord — start OAuth */
discordAuthRouter.get("/discord", (req, res) => {
  if (!discordConfigured()) {
    return res.status(503).json({
      error: "Discord sign-in is not configured on the server",
      code: "discord_not_configured"
    });
  }

  const returnTo = safeReturnTo(req.query.returnTo);
  const state = signOAuthState({ returnTo });
  const params = new URLSearchParams({
    client_id: config.discord.clientId,
    redirect_uri: config.discord.redirectUri,
    response_type: "code",
    scope: "identify email",
    state
  });

  return res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

/** GET /api/auth/discord/callback */
discordAuthRouter.get("/discord/callback", async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect(`${config.frontendUrl}/account/?auth_error=${encodeURIComponent(String(error))}`);
  }

  if (!discordConfigured()) {
    return res.redirect(`${config.frontendUrl}/account/?auth_error=not_configured`);
  }

  const statePayload = verifyOAuthState(String(state || ""));
  if (!code || !statePayload) {
    return res.redirect(`${config.frontendUrl}/account/?auth_error=invalid_state`);
  }

  try {
    const discordUser = await exchangeDiscordCode(String(code));
    const customer = await upsertCustomerFromDiscord(discordUser);
    await linkLicensesToCustomer(customer);
    await syncRolesAfterLogin(customer);

    const token = signCustomerToken(customer);
    const returnTo = safeReturnTo(statePayload.returnTo);
    const url = new URL(returnTo);
    url.searchParams.set("token", token);
    url.searchParams.delete("auth_error");
    return res.redirect(url.toString());
  } catch (err) {
    console.error("[auth/discord/callback]", err);
    return res.redirect(
      `${config.frontendUrl}/account/?auth_error=${encodeURIComponent(err.message || "login_failed")}`
    );
  }
});

/** GET /api/auth/discord/config — public client id for diagnostics */
discordAuthRouter.get("/discord/config", (_req, res) => {
  res.json({
    enabled: discordConfigured(),
    authorizeUrl: discordConfigured() ? `${config.apiPublicUrl}/api/auth/discord` : null
  });
});
