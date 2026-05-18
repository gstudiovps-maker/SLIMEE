import path from "node:path";
import { config } from "../config.js";
import { resolvePublicApiBase } from "./apiUrl.js";

const MEDIA_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

export function buildPackageMediaStorageKey(packageId, originalName) {
  const safeId = String(packageId).replace(/[^a-zA-Z0-9_-]/g, "");
  const ext = path.extname(String(originalName || "")).toLowerCase() || ".jpg";
  const base = path
    .basename(String(originalName || "image"), ext)
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 40) || "image";
  return `media/${safeId}/${Date.now()}-${base}${ext}`;
}

export function mediaFilenameFromKey(storageKey) {
  const parts = String(storageKey).replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || "";
}

export function buildPackageMediaPublicUrl(req, packageId, filename) {
  const apiBase = resolvePublicApiBase(req);
  const safeId = encodeURIComponent(String(packageId));
  const safeFile = encodeURIComponent(String(filename));
  return `${apiBase}/api/packages/media/${safeId}/${safeFile}`;
}

export function contentTypeForMediaFilename(filename) {
  const ext = path.extname(String(filename)).toLowerCase();
  const map = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif"
  };
  return map[ext] || "application/octet-stream";
}

export function isAllowedMediaExtension(filename) {
  return MEDIA_EXT.has(path.extname(String(filename)).toLowerCase());
}

export function resolveMediaStorageKey(packageId, filename) {
  const safeId = String(packageId).replace(/[^a-zA-Z0-9_-]/g, "");
  const safeFile = path.basename(String(filename).replace(/\\/g, "/"));
  if (!safeFile || safeFile.includes("..")) {
    throw new Error("Invalid media filename");
  }
  return `media/${safeId}/${safeFile}`;
}
