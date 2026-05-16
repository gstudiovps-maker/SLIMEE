import { config } from "../config.js";
import { getStorage } from "../storage/index.js";
import { getPackageSourceFile } from "./packageFiles.js";
import { logDownload } from "./downloadLog.js";

export async function resolvePackageStorageKey(packageId, preferredKey) {
  if (preferredKey) {
    return preferredKey;
  }
  const row = await getPackageSourceFile(packageId);
  return row?.storage_key || null;
}

export async function checkPackageStorage(packageId) {
  const row = await getPackageSourceFile(packageId);
  const storageKey = row?.storage_key || null;
  const storage = getStorage();
  const provider = config.storageProvider;

  const result = {
    packageId,
    storageProvider: provider,
    dbRecord: row
      ? {
          storageKey: row.storage_key,
          originalFilename: row.original_filename,
          byteSize: row.byte_size,
          uploadedAt: row.uploaded_at
        }
      : null,
    storageKey,
    objectExists: false,
    signedUrl: null,
    signedUrlExpiresAt: null,
    signedUrlExpiresInSeconds: null
  };

  if (!storageKey) {
    return result;
  }

  try {
    result.objectExists = await storage.exists(storageKey);
    logDownload("storage_check_exists", {
      packageId,
      storageKey,
      objectExists: result.objectExists,
      provider
    });
  } catch (err) {
    result.existsError = err.message;
    logDownload("storage_check_exists_error", {
      packageId,
      storageKey,
      error: err.message
    });
    return result;
  }

  if (result.objectExists && typeof storage.createSignedDownloadUrl === "function") {
    try {
      const expiresInSeconds = config.r2?.signedUrlTtlSeconds || 600;
      const signedUrl = await storage.createSignedDownloadUrl(storageKey, {
        expiresInSeconds,
        downloadFilename: row?.original_filename || `${packageId}.zip`
      });
      result.signedUrl = signedUrl;
      result.signedUrlExpiresInSeconds = expiresInSeconds;
      result.signedUrlExpiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
      logDownload("storage_check_signed_url", {
        packageId,
        storageKey,
        expiresAt: result.signedUrlExpiresAt,
        expiresInSeconds
      });
    } catch (err) {
      result.signedUrlError = err.message;
      logDownload("storage_check_signed_url_error", {
        packageId,
        storageKey,
        error: err.message
      });
    }
  }

  return result;
}

export async function readSourceBufferByKey(storageKey, meta = {}) {
  const storage = getStorage();
  logDownload("storage_read_start", { storageKey, ...meta });

  let exists = false;
  try {
    exists = await storage.exists(storageKey);
  } catch (err) {
    logDownload("storage_exists_error", { storageKey, error: err.message, ...meta });
    throw err;
  }

  logDownload("storage_object_exists", { storageKey, exists, ...meta });

  if (!exists) {
    return { buffer: null, exists: false };
  }

  const buffer = await storage.getObject(storageKey);
  if (!buffer && typeof storage.readBuffer === "function") {
    const legacy = await storage.readBuffer(storageKey);
    return { buffer: legacy, exists: Boolean(legacy) };
  }

  logDownload("storage_read_ok", {
    storageKey,
    byteSize: buffer?.length ?? 0,
    ...meta
  });

  return { buffer, exists: Boolean(buffer) };
}
