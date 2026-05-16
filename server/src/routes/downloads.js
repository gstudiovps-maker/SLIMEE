import express from "express";
import { config } from "../config.js";
import { findByLicenseKey } from "../lib/licenses.js";
import { getPackageById } from "../lib/packages.js";
import { getPackageSourceFile } from "../lib/packageFiles.js";
import { buildProtectedPackage } from "../lib/protection/packager.js";
import { logDownload } from "../lib/downloadLog.js";
import {
  createDownloadToken,
  findDownloadToken,
  countDownloadTokensForLicense,
  DOWNLOAD_TOKEN_TTL_MS
} from "../lib/downloadTokens.js";
import { checkPackageStorage, readSourceBufferByKey, resolvePackageStorageKey } from "../lib/packageStorage.js";

export const downloadsRouter = express.Router();

function jsonError(res, status, code, message, extra = {}) {
  return res.status(status).json({ error: message, code, ...extra });
}

async function assertActiveLicense(licenseKey, packageId) {
  const license = await findByLicenseKey(licenseKey);
  if (!license) {
    return { ok: false, status: 403, error: "Invalid license", reason: "not_found", code: "license_invalid" };
  }
  if (license.status !== "active") {
    return {
      ok: false,
      status: 403,
      error: "License inactive",
      reason: license.status,
      code: "license_inactive"
    };
  }
  if (license.package_id !== packageId) {
    return {
      ok: false,
      status: 403,
      error: "License does not match package",
      reason: "wrong_package",
      code: "license_wrong_package"
    };
  }
  return { ok: true, license };
}

/**
 * POST /api/downloads/request
 * Body: { licenseKey, packageId }
 */
downloadsRouter.post("/request", async (req, res) => {
  try {
    const { licenseKey, packageId } = req.body || {};
    logDownload("request_start", { packageId, hasLicenseKey: Boolean(licenseKey) });

    if (!licenseKey || !packageId) {
      return jsonError(res, 400, "missing_fields", "licenseKey and packageId are required");
    }

    const check = await assertActiveLicense(licenseKey, packageId);
    if (!check.ok) {
      logDownload("request_license_denied", { packageId, reason: check.reason, code: check.code });
      return res.status(check.status).json({
        error: check.error,
        code: check.code,
        reason: check.reason
      });
    }

    const pkg = await getPackageById(packageId);
    if (!pkg) {
      logDownload("request_package_missing", { packageId });
      return jsonError(res, 404, "package_missing", "Package not found");
    }

    const sourceRow = await getPackageSourceFile(packageId);
    const storageKey = sourceRow?.storage_key || null;
    logDownload("request_storage_key", {
      packageId,
      storageKey: storageKey || null,
      hasDbRow: Boolean(sourceRow)
    });

    if (!storageKey) {
      return jsonError(res, 404, "package_missing", "Protected source package not uploaded yet", {
        hint: "Admin must upload development ZIP via the product manager"
      });
    }

    const { buffer: source, exists } = await readSourceBufferByKey(storageKey, {
      packageId,
      phase: "request"
    });

    if (!exists || !source) {
      logDownload("request_storage_missing", { packageId, storageKey });
      return jsonError(res, 503, "storage_unavailable", "Package source file is missing from storage", {
        storageKey
      });
    }

    const tokenRow = await createDownloadToken({
      licenseId: check.license.id,
      packageId,
      storageKey
    });

    const tokenCount = await countDownloadTokensForLicense(check.license.id);
    const expiresAt = new Date(tokenRow.expires_at);

    logDownload("request_token_created", {
      packageId,
      storageKey,
      tokenId: tokenRow.id,
      tokenPrefix: `${tokenRow.token.slice(0, 8)}…`,
      expiresAt: expiresAt.toISOString(),
      licenseTokenCount: tokenCount
    });

    const downloadUrl = `${config.apiPublicUrl}/api/downloads/file/${tokenRow.token}`;

    return res.json({
      downloadUrl,
      expiresAt: expiresAt.toISOString(),
      expiresInSeconds: Math.floor(DOWNLOAD_TOKEN_TTL_MS / 1000),
      packageId,
      delivery: "Protected Package Delivery"
    });
  } catch (err) {
    logDownload("request_error", { error: err.message, stack: err.stack });
    console.error("[downloads/request]", err);
    return jsonError(res, 500, "request_failed", "Could not create download link");
  }
});

/**
 * GET /api/downloads/file/:token — validates token, builds protected ZIP, streams to client.
 */
downloadsRouter.get("/file/:token", async (req, res) => {
  const rawToken = req.params.token;
  logDownload("file_start", {
    tokenReceived: Boolean(rawToken),
    tokenPrefix: rawToken ? `${String(rawToken).slice(0, 8)}…` : null,
    method: req.method,
    path: req.path
  });

  try {
    const token = String(rawToken || "").trim();
    if (!token) {
      return jsonError(res, 400, "token_missing", "Download token is required");
    }

    const row = await findDownloadToken(token);
    if (!row) {
      logDownload("file_token_not_found", { tokenPrefix: `${token.slice(0, 8)}…` });
      return jsonError(res, 404, "token_not_found", "Download link invalid or unknown");
    }

    logDownload("file_token_found", {
      tokenPrefix: `${token.slice(0, 8)}…`,
      downloadTokenId: row.download_token_id,
      licenseId: row.license_row_id,
      packageId: row.package_id,
      storageKey: row.storage_key || null,
      expiresAt: new Date(row.expires_at).toISOString()
    });

    const expiresAt = new Date(row.expires_at);
    if (expiresAt < new Date()) {
      logDownload("file_token_expired", {
        tokenPrefix: `${token.slice(0, 8)}…`,
        expiresAt: expiresAt.toISOString()
      });
      return jsonError(res, 410, "token_expired", "Download link expired", {
        expiresAt: expiresAt.toISOString()
      });
    }

    if (row.license_status !== "active") {
      logDownload("file_license_inactive", {
        tokenPrefix: `${token.slice(0, 8)}…`,
        status: row.license_status
      });
      return jsonError(res, 403, "license_inactive", "License inactive");
    }

    const packageId = row.package_id || row.token_package_id;
    const storageKey = await resolvePackageStorageKey(packageId, row.storage_key);

    logDownload("file_storage_key_resolved", {
      packageId,
      storageKey: storageKey || null,
      fromToken: Boolean(row.storage_key)
    });

    if (!storageKey) {
      return jsonError(res, 404, "package_missing", "No source package is registered for this product");
    }

    const pkg = await getPackageById(packageId);
    if (!pkg) {
      logDownload("file_package_catalog_missing", { packageId });
      return jsonError(res, 404, "package_missing", "Package not found in catalog");
    }

    let source;
    try {
      const readResult = await readSourceBufferByKey(storageKey, {
        packageId,
        phase: "file",
        tokenPrefix: `${token.slice(0, 8)}…`
      });
      source = readResult.buffer;

      if (!readResult.exists || !source) {
        logDownload("file_storage_missing", { packageId, storageKey });
        return jsonError(res, 404, "package_missing", "Package source file is not available in storage", {
          storageKey
        });
      }
    } catch (err) {
      logDownload("file_storage_error", { packageId, storageKey, error: err.message });
      return jsonError(res, 503, "storage_unavailable", "Could not read package from storage");
    }

    const licenseRow = {
      license_key: row.license_key,
      package_id: packageId,
      customer_email: row.customer_email
    };

    const protectedZip = buildProtectedPackage(source, pkg, licenseRow);
    const filename = `${packageId}-${row.license_key.slice(0, 8)}-protected.zip`;

    logDownload("file_stream_start", {
      packageId,
      storageKey,
      filename,
      byteSize: protectedZip.length,
      expiresAt: expiresAt.toISOString()
    });

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.send(protectedZip);
  } catch (err) {
    logDownload("file_error", { error: err.message, stack: err.stack });
    console.error("[downloads/file]", err);
    return jsonError(res, 500, "download_failed", "Download failed");
  }
});
