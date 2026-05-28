import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, "..");
const repoRoot = path.join(serverRoot, "..");
const dontAddEnv = path.join(repoRoot, "dont add", "server.env");

dotenv.config({ path: path.join(serverRoot, ".env") });
dotenv.config({ path: dontAddEnv });

export const config = {
  port: Number(process.env.PORT) || 3001,
  nodeEnv: process.env.NODE_ENV || "development",
  databaseUrl: process.env.DATABASE_URL || "",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  frontendUrl: (process.env.FRONTEND_URL || "http://localhost:5500").replace(/\/$/, ""),
  apiPublicUrl: (process.env.API_PUBLIC_URL || `http://localhost:${process.env.PORT || 3001}`)
    .replace(/\/+$/, "")
    .replace(/\/api$/i, ""),
  corsOrigins: [
    ...new Set(
      [
        ...(process.env.CORS_ORIGINS || "").split(","),
        process.env.FRONTEND_URL || "",
        "http://localhost:5500",
        "http://127.0.0.1:5500"
      ]
        .map((s) => s.trim().replace(/\/$/, ""))
        .filter(Boolean)
    )
  ],
  packagesJson: path.resolve(
    serverRoot,
    process.env.PACKAGES_JSON || "../content/packages.json"
  ),
  downloadsDir: path.resolve(
    serverRoot,
    process.env.DOWNLOADS_DIR || path.join(repoRoot, "dont add", "downloads")
  ),
  jwtSecret: process.env.JWT_SECRET || "",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "12h",
  customerJwtExpiresIn: process.env.CUSTOMER_JWT_EXPIRES_IN || "30d",
  discord: {
    clientId: process.env.DISCORD_CLIENT_ID || "",
    clientSecret: process.env.DISCORD_CLIENT_SECRET || "",
    redirectUri:
      process.env.DISCORD_REDIRECT_URI ||
      `${(process.env.API_PUBLIC_URL || `http://localhost:${process.env.PORT || 3001}`).replace(/\/+$/, "").replace(/\/api$/i, "")}/api/auth/discord/callback`,
    botToken: process.env.DISCORD_BOT_TOKEN || "",
    guildId: process.env.DISCORD_GUILD_ID || "",
    inviteUrl: process.env.DISCORD_INVITE_URL || "",
    verifiedRoleId: process.env.DISCORD_VERIFIED_ROLE_ID || "",
    customerRoleId: process.env.DISCORD_CUSTOMER_ROLE_ID || ""
  },
  server: {
    fivemCode: (process.env.FIVEM_SERVER_CODE || "amor5e").trim(),
    connectUrl: (
      process.env.SERVER_CONNECT_URL ||
      `https://cfx.re/join/${(process.env.FIVEM_SERVER_CODE || "amor5e").trim()}`
    ).trim()
  },
  mainAdminUsername: (process.env.MAIN_ADMIN_USERNAME || "").trim().toLowerCase(),
  mainAdminPasswordHash: process.env.MAIN_ADMIN_PASSWORD_HASH || "",
  admin2Username: (process.env.ADMIN2_USERNAME || "").trim().toLowerCase(),
  admin2PasswordHash: process.env.ADMIN2_PASSWORD_HASH || "",
  admin3Username: (process.env.ADMIN3_USERNAME || "").trim().toLowerCase(),
  admin3PasswordHash: process.env.ADMIN3_PASSWORD_HASH || "",
  admin4Username: (process.env.ADMIN4_USERNAME || "").trim().toLowerCase(),
  admin4PasswordHash: process.env.ADMIN4_PASSWORD_HASH || "",
  adminSeedJson: process.env.ADMIN_SEED_JSON || "",
  storageProvider: (process.env.STORAGE_PROVIDER || "local").toLowerCase(),
  privateStorageDir: path.resolve(
    serverRoot,
    process.env.PRIVATE_STORAGE_DIR || path.join(repoRoot, "dont add", "private-storage")
  ),
  r2: {
    bucket: process.env.R2_BUCKET || "",
    endpoint: process.env.R2_ENDPOINT || "",
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
    signedUrlTtlSeconds: Number(process.env.R2_SIGNED_URL_TTL_SECONDS) || 600
  },
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB) || 250
};

export function assertConfig() {
  const missing = [];
  if (!config.databaseUrl) missing.push("DATABASE_URL");
  if (!config.stripeSecretKey) missing.push("STRIPE_SECRET_KEY");
  if (missing.length && config.nodeEnv === "production") {
    console.warn(`[config] Missing in production: ${missing.join(", ")}`);
  }
}
