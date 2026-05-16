import { LocalStorageProvider } from "./local.js";
import { R2StorageProvider } from "./r2.js";
import { config } from "../config.js";

let storageSingleton = null;

/**
 * Modular storage — local disk or Cloudflare R2 (S3-compatible).
 * Keys are internal only; never expose raw bucket or filesystem paths to clients.
 */
export function getStorage() {
  if (storageSingleton) return storageSingleton;

  const provider = config.storageProvider;
  if (provider === "local") {
    storageSingleton = new LocalStorageProvider(config.privateStorageDir);
    return storageSingleton;
  }
  if (provider === "r2") {
    storageSingleton = new R2StorageProvider({
      bucket: config.r2.bucket,
      endpoint: config.r2.endpoint,
      accessKeyId: config.r2.accessKeyId,
      secretAccessKey: config.r2.secretAccessKey,
      signedUrlTtlSeconds: config.r2.signedUrlTtlSeconds
    });
    return storageSingleton;
  }
  throw new Error(`Unsupported STORAGE_PROVIDER: ${provider}`);
}

export function buildSourceStorageKey(packageId) {
  const safe = String(packageId).replace(/[^a-zA-Z0-9_-]/g, "");
  return `sources/${safe}/${Date.now()}.zip`;
}
