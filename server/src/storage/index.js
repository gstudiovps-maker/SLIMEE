import { LocalStorageProvider } from "./local.js";
import { config } from "../config.js";

/**
 * Modular storage — swap STORAGE_PROVIDER later (r2, s3, bunny).
 * Keys are internal only; never expose filesystem paths to clients.
 */
export function getStorage() {
  const provider = config.storageProvider;
  if (provider === "local") {
    return new LocalStorageProvider(config.privateStorageDir);
  }
  throw new Error(`Unsupported STORAGE_PROVIDER: ${provider}`);
}

export function buildSourceStorageKey(packageId) {
  const safe = String(packageId).replace(/[^a-zA-Z0-9_-]/g, "");
  return `sources/${safe}/${Date.now()}.zip`;
}
