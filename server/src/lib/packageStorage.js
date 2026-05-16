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
    getObjectSuccess: false,
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

  if (result.objectExists && typeof storage.getObject === "function") {
    try {
      const probe = await storage.getObject(storageKey);
      result.getObjectSuccess = Boolean(probe?.length);
      logDownload("storage_check_getObject", {
        packageId,
        storageKey,
        success: result.getObjectSuccess,
        byteSize: probe?.length ?? 0
      });
    } catch (err) {
      result.getObjectError = err.message;
      logDownload("storage_check_getObject_fail", {
        packageId,
        storageKey,
        error: err.message
      });
    }
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
  const provider = config.storageProvider;
  logDownload("storage_read_start", { storageKey, provider, ...meta });

  let exists = false;
  try {
    exists = await storage.exists(storageKey);
  } catch (err) {
    logDownload("r2_exists_fail", { storageKey, provider, error: err.message, ...meta });
    throw err;
  }

  logDownload("storage_object_exists", { storageKey, exists, provider, ...meta });

  if (!exists) {
    logDownload("r2_getObject_skip", { storageKey, reason: "object_missing", success: false, ...meta });
    return { buffer: null, exists: false, getObjectSuccess: false };
  }

  let buffer = null;
  let getObjectSuccess = false;
  let getObjectError = null;

  try {
    if (typeof storage.getObject === "function") {
      buffer = await storage.getObject(storageKey);
    } else if (typeof storage.readBuffer === "function") {
      buffer = await storage.readBuffer(storageKey);
    }
    getObjectSuccess = Boolean(buffer?.length);
    logDownload("r2_getObject_success", {
      storageKey,
      provider,
      success: getObjectSuccess,
      byteSize: buffer?.length ?? 0,
      ...meta
    });
  } catch (err) {
    getObjectError = err.message;
    logDownload("r2_getObject_fail", {
      storageKey,
      provider,
      success: false,
      error: err.message,
      ...meta
    });
    throw err;
  }

  if (!buffer && typeof storage.readBuffer === "function") {
    buffer = await storage.readBuffer(storageKey);
    getObjectSuccess = Boolean(buffer?.length);
    logDownload("storage_read_fallback", {
      storageKey,
      success: getObjectSuccess,
      byteSize: buffer?.length ?? 0,
      ...meta
    });
  }

  if (!getObjectSuccess) {
    logDownload("r2_getObject_empty", { storageKey, provider, success: false, ...meta });
  }

  return { buffer, exists: Boolean(buffer), getObjectSuccess, getObjectError };
}
