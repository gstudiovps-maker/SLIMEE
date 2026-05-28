import { config } from "../config.js";

const LOG = "[discord-stats]";
const CACHE_TTL_MS = 60 * 1000;

let cache = { at: 0, data: null };

function botConfigured() {
  const d = config.discord;
  return Boolean(d.botToken && d.guildId);
}

/**
 * Bot API: GET /guilds/{id}?with_counts=true
 * Returns approximate total + online (presence) member counts.
 */
async function fetchViaBot() {
  const guildId = config.discord.guildId;
  const url = `https://discord.com/api/v10/guilds/${guildId}?with_counts=true`;
  const res = await fetch(url, {
    headers: { Authorization: `Bot ${config.discord.botToken}` }
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`bot guild fetch ${res.status} ${body.slice(0, 160)}`);
  }
  const data = await res.json();
  return {
    memberCount: Number(data.approximate_member_count) || null,
    onlineCount: Number(data.approximate_presence_count) || null,
    name: data.name || null,
    source: "bot"
  };
}

/**
 * Widget API: GET /guilds/{id}/widget.json (requires "Enable Server Widget").
 * Returns online member count + an instant invite.
 */
async function fetchViaWidget() {
  const guildId = config.discord.guildId;
  const url = `https://discord.com/api/guilds/${guildId}/widget.json`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`widget fetch ${res.status} ${body.slice(0, 160)}`);
  }
  const data = await res.json();
  return {
    memberCount: null,
    onlineCount: Number(data.presence_count) || null,
    name: data.name || null,
    inviteUrl: data.instant_invite || null,
    source: "widget"
  };
}

/**
 * Returns { memberCount, onlineCount, inviteUrl, name } with a 60s cache.
 * Tries the bot API first, then falls back to the public widget.
 */
export async function getDiscordStats() {
  if (!config.discord.guildId) {
    return { configured: false, memberCount: null, onlineCount: null };
  }

  if (cache.data && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.data;
  }

  let result = { configured: true, memberCount: null, onlineCount: null };

  if (botConfigured()) {
    try {
      const bot = await fetchViaBot();
      result = { ...result, ...bot };
    } catch (err) {
      console.warn(LOG, "bot lookup failed:", err.message);
    }
  }

  if (result.onlineCount == null) {
    try {
      const widget = await fetchViaWidget();
      result = {
        ...result,
        onlineCount: widget.onlineCount ?? result.onlineCount,
        memberCount: result.memberCount ?? widget.memberCount,
        name: result.name || widget.name,
        inviteUrl: result.inviteUrl || widget.inviteUrl
      };
    } catch (err) {
      console.warn(LOG, "widget lookup failed:", err.message);
    }
  }

  if (config.discord.inviteUrl) {
    result.inviteUrl = config.discord.inviteUrl;
  }

  cache = { at: Date.now(), data: result };
  return result;
}
