import { findDownloadToken } from "./downloadTokens.js";
import { getPackageById } from "./packages.js";
import { resolvePackageStorageKey } from "./packageStorage.js";
import { getStorage } from "../storage/index.js";
import { config } from "../config.js";

export function buildProtectedStorageKey(packageId, token) {
  const safePackage = String(packageId || "unknown").replace(/[^a-zA-Z0-9_-]/g, "");
  const safeToken = String(token || "").slice(0, 16);
  return `protected-builds/${safePackage}/${safeToken}.zip`;
}

export async function resolveDownloadContext(tokenValue) {
  const token = String(tokenValue || "").trim();
  if (!token) {
    return {
      ok: false,
      status: 400,
      code: "token_missing",
      error: "Download token is required"
    };
  }

  const row = await findDownloadToken(token);
  if (!row) {
    return {
      ok: false,
      status: 404,
      code: "token_not_found",
      error: "Download link invalid or unknown",
      tokenFound: false
    };
  }

  const expiresAt = new Date(row.expires_at);
  const tokenValid = expiresAt >= new Date();
  const packageId = row.package_id || row.token_package_id;
  const licenseId = row.license_row_id;
  const sourceStorageKey = await resolvePackageStorageKey(packageId, row.storage_key);
  const buildStorageKey = buildProtectedStorageKey(packageId, token);

  const base = {
    ok: true,
    tokenFound: true,
    tokenValid,
    token,
    row,
    packageId,
    licenseId,
    sourceStorageKey,
    buildStorageKey,
    expiresAt: expiresAt.toISOString(),
    licenseStatus: row.license_status
  };

  if (!tokenValid) {
    return {
      ...base,
      ok: false,
      status: 410,
      code: "token_expired",
      error: "Download link expired"
    };
  }

  if (row.license_status !== "active") {
    return {
      ...base,
      ok: false,
      status: 403,
      code: "license_inactive",
      error: "License inactive"
    };
  }

  if (!sourceStorageKey) {
    return {
      ...base,
      ok: false,
      status: 404,
      code: "package_missing",
      error: "No source package is registered for this product"
    };
  }

  const pkg = await getPackageById(packageId);
  if (!pkg) {
    return {
      ...base,
      ok: false,
      status: 404,
      code: "package_missing",
      error: "Package not found in catalog"
    };
  }

  let storageObjectExists = false;
  try {
    storageObjectExists = await getStorage().exists(sourceStorageKey);
  } catch {
    storageObjectExists = false;
  }

  if (!storageObjectExists) {
    return {
      ...base,
      ok: false,
      status: 404,
      code: "package_missing",
      error: "Package source file is not available in storage",
      storageObjectExists: false
    };
  }

  return {
    ...base,
    ok: true,
    status: 200,
    pkg,
    storageObjectExists: true,
    storageProvider: config.storageProvider
  };
}
