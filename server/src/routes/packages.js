import express from "express";
import { loadPackages, getPackageById } from "../lib/packages.js";
import { getStorage } from "../storage/index.js";
import {
  contentTypeForMediaFilename,
  resolveMediaStorageKey
} from "../lib/packageMedia.js";

export const packagesRouter = express.Router();

/** GET /api/packages/media/:packageId/:filename — public package images */
packagesRouter.get("/media/:packageId/:filename", async (req, res) => {
  try {
    const packageId = String(req.params.packageId || "").trim();
    const filename = String(req.params.filename || "").trim();
    if (!packageId || !filename) {
      return res.status(400).json({ error: "Invalid media path" });
    }

    const pkg = await getPackageById(packageId, { publishedOnly: false, bypassCache: true });
    if (!pkg) {
      return res.status(404).json({ error: "Package not found" });
    }

    const storageKey = resolveMediaStorageKey(packageId, filename);
    const buffer = await getStorage().readBuffer(storageKey);
    if (!buffer?.length) {
      return res.status(404).json({ error: "Image not found" });
    }

    res.setHeader("Content-Type", contentTypeForMediaFilename(filename));
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.send(buffer);
  } catch (err) {
    console.error("[packages/media]", err);
    return res.status(500).json({ error: "Could not load image" });
  }
});

packagesRouter.get("/", async (_req, res) => {
  try {
    const packages = await loadPackages({ publishedOnly: true });
    return res.json({ packages });
  } catch (err) {
    console.error("[packages]", err);
    return res.status(500).json({ error: "Could not load catalog" });
  }
});
