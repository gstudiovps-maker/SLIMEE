import express from "express";
import { config } from "../config.js";
import { getDiscordStats } from "../lib/discordStats.js";
import { getTopCustomer, getRecentPayments, getServerStats } from "../lib/storeStats.js";

export const statsRouter = express.Router();

/**
 * GET /api/stats
 * Public homepage stats: Discord counts, top customer, recent payments, FiveM server.
 */
statsRouter.get("/", async (_req, res) => {
  try {
    const [discord, topCustomer, recentPayments, server] = await Promise.all([
      getDiscordStats(),
      getTopCustomer(),
      getRecentPayments(6),
      getServerStats()
    ]);

    res.set("Cache-Control", "public, max-age=30");
    return res.json({
      discord,
      topCustomer,
      recentPayments,
      server,
      links: {
        discordInvite: discord?.inviteUrl || config.discord.inviteUrl || null,
        serverConnect: server?.connectUrl || config.server.connectUrl || null
      }
    });
  } catch (err) {
    console.error("[stats]", err);
    return res.status(500).json({ error: "Could not load stats" });
  }
});

statsRouter.get("/discord", async (_req, res) => {
  try {
    return res.json(await getDiscordStats());
  } catch (err) {
    console.error("[stats/discord]", err);
    return res.status(500).json({ error: "Could not load Discord stats" });
  }
});

statsRouter.get("/server", async (_req, res) => {
  try {
    return res.json(await getServerStats());
  } catch (err) {
    console.error("[stats/server]", err);
    return res.status(500).json({ error: "Could not load server stats" });
  }
});
