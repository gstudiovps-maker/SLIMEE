import fs from "node:fs";
import { config } from "../config.js";
import { pool } from "../db.js";
import { normalizeEscrowIgnore, normalizeProtectionMode } from "./protection/escrow.js";

let cache = { list: null, at: 0 };
const CACHE_MS = 3000;

function normalizePackageBody(raw, fallbackId) {
  const p = raw && typeof raw === "object" ? { ...raw } : {};
  const id = String(p.id || fallbackId || "").trim();
  const priceAmount = String(p.priceAmount ?? "0").replace(/[^0-9.]/g, "") || "0";
  const currency = String(p.currency || "USD").trim() || "USD";
  const price = String(p.price || "").trim() || `$${priceAmount}`;
  return {
    ...p,
    id,
    name: String(p.name || "Untitled").trim() || "Untitled",
    category: String(p.category || "Scripts").trim() || "Scripts",
    description: String(p.description || "").trim(),
    price,
    priceAmount,
    currency,
    tags: Array.isArray(p.tags) ? p.tags : [],
    featured: Boolean(p.featured),
    checkoutUrl: String(p.checkoutUrl || "").trim(),
    videoPreviewUrl: String(p.videoPreviewUrl || "").trim(),
    gallery: Array.isArray(p.gallery) ? p.gallery : [],
    cardImage: String(p.cardImage || "").trim(),
    detailIntro: String(p.detailIntro || "").trim(),
    detailSections: Array.isArray(p.detailSections) ? p.detailSections : [],
    protectionMode: normalizeProtectionMode(p.protectionMode || p.protection_mode),
    escrowIgnore: normalizeEscrowIgnore(
      p.escrowIgnore || p.escrow_ignore,
      p.protectionMode || p.protection_mode
    )
  };
}

function loadPackagesFromFile() {
  try {
    const raw = fs.readFileSync(config.packagesJson, "utf8");
    const data = JSON.parse(raw);
    const list = Array.isArray(data.packages) ? data.packages : [];
    return list.map((p, i) => normalizePackageBody(p, `pkg-${i}`));
  } catch (err) {
    console.error("[packages] Failed to load catalog file:", err.message);
    return [];
  }
}

export function invalidatePackageCache() {
  cache = { list: null, at: 0 };
}

export async function loadPackagesFromDb({ publishedOnly = true } = {}) {
  if (!pool) {
    return null;
  }
  const sql = publishedOnly
    ? `SELECT id, body, published FROM packages WHERE published = TRUE ORDER BY body->>'name'`
    : `SELECT id, body, published FROM packages ORDER BY body->>'name'`;
  const res = await pool.query(sql);
  return res.rows.map((row) => {
    const body = typeof row.body === "object" ? row.body : JSON.parse(row.body || "{}");
    const pkg = normalizePackageBody(body, row.id);
    pkg.id = row.id;
    pkg.published = row.published;
    return pkg;
  });
}

export async function loadPackages(options = {}) {
  const now = Date.now();
  if (!options.bypassCache && cache.list && now - cache.at < CACHE_MS) {
    return cache.list;
  }

  const fromDb = await loadPackagesFromDb({
    publishedOnly: options.publishedOnly !== false
  });

  let list;
  if (fromDb !== null) {
    list = fromDb.length > 0 ? fromDb : loadPackagesFromFile();
  } else {
    list = loadPackagesFromFile();
  }

  if (!options.bypassCache) {
    cache = { list, at: now };
  }
  return list;
}

export async function getPackageById(packageId, options = {}) {
  const id = String(packageId || "").trim();
  if (!id) {
    return null;
  }

  if (pool) {
    const res = await pool.query(
      `SELECT id, body, published, updated_at FROM packages WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (res.rows[0]) {
      const row = res.rows[0];
      if (options.publishedOnly !== false && !row.published) {
        return null;
      }
      const body = typeof row.body === "object" ? row.body : JSON.parse(row.body || "{}");
      const pkg = normalizePackageBody(body, row.id);
      pkg.id = row.id;
      pkg.published = row.published;
      pkg.packageUpdatedAt = row.updated_at;
      return pkg;
    }
  }

  return (await loadPackages(options)).find((p) => p.id === id) || null;
}

export async function upsertPackage(pkg, { published = true } = {}) {
  if (!pool) {
    throw new Error("Database not configured");
  }
  const normalized = normalizePackageBody(pkg, pkg?.id);
  const id = normalized.id;
  if (!id) {
    throw new Error("Package id is required");
  }
  await pool.query(
    `INSERT INTO packages (id, body, published, updated_at)
     VALUES ($1, $2::jsonb, $3, NOW())
     ON CONFLICT (id) DO UPDATE
     SET body = EXCLUDED.body,
         published = EXCLUDED.published,
         updated_at = NOW()`,
    [id, JSON.stringify(normalized), Boolean(published)]
  );
  invalidatePackageCache();
  return normalized;
}

export async function deletePackageById(packageId) {
  if (!pool) {
    throw new Error("Database not configured");
  }
  const res = await pool.query(`DELETE FROM packages WHERE id = $1 RETURNING id`, [
    String(packageId).trim()
  ]);
  invalidatePackageCache();
  return res.rowCount > 0;
}

export async function seedPackagesFromJsonIfEmpty() {
  if (!pool) {
    return 0;
  }
  const count = await pool.query(`SELECT COUNT(*)::int AS n FROM packages`);
  if (count.rows[0]?.n > 0) {
    return 0;
  }
  const list = loadPackagesFromFile();
  for (const pkg of list) {
    await upsertPackage(pkg, { published: true });
  }
  console.log(`[seed] Imported ${list.length} packages from JSON catalog`);
  return list.length;
}

export function getStripeUnitAmount(pkg) {
  const amount = parseFloat(String(pkg.priceAmount || "0").replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  return Math.round(amount * 100);
}
