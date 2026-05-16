import express from "express";
import { config } from "../config.js";
import { findByLicenseKey } from "../lib/licenses.js";
import { getPackageSourceFile } from "../lib/packageFiles.js";
import { buildProtectedPackage } from "../lib/protection/packager.js";
import { logDownload, logDownloadFile } from "../lib/downloadLog.js";
import {
  createDownloadToken,
  countDownloadTokensForLicense,
  DOWNLOAD_TOKEN_TTL_MS
} from "../lib/downloadTokens.js";
import { checkPackageStorage, readSourceBufferByKey } from "../lib/packageStorage.js";
import { resolveDownloadContext } from "../lib/downloadResolve.js";
import { getPackageById } from "../lib/packages.js";

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
 * GET /api/downloads/file/:token/status — lightweight JSON check (no ZIP build).
 */
downloadsRouter.get("/file/:token/status", async (req, res) => {
  const rawToken = req.params.token;
  logDownload("file_status_start", {
    tokenReceived: Boolean(rawToken),
    tokenPrefix: rawToken ? `${String(rawToken).slice(0, 8)}…` : null
  });

  const ctx = await resolveDownloadContext(rawToken);
  const statusCode = ctx.ok ? 200 : ctx.status;

  logDownloadFile("file_status_result", statusCode, {
    tokenFound: ctx.tokenFound ?? false,
    tokenValid: ctx.tokenValid ?? false,
    packageId: ctx.packageId || null,
    licenseId: ctx.licenseId || null,
    sourceStorageKey: ctx.sourceStorageKey || null,
    buildStorageKey: ctx.buildStorageKey || null,
    storageObjectExists: ctx.storageObjectExists ?? null,
    code: ctx.code || null
  });

  if (!ctx.ok) {
    return res.status(statusCode).json({
      ok: false,
      error: ctx.error,
      code: ctx.code,
      tokenFound: ctx.tokenFound,
      tokenValid: ctx.tokenValid,
      packageId: ctx.packageId,
      licenseId: ctx.licenseId,
      sourceStorageKey: ctx.sourceStorageKey,
      buildStorageKey: ctx.buildStorageKey,
      expiresAt: ctx.expiresAt
    });
  }

  return res.status(200).json({
    ok: true,
    code: "ready",
    delivery: "stream",
    packageId: ctx.packageId,
    licenseId: ctx.licenseId,
    sourceStorageKey: ctx.sourceStorageKey,
    buildStorageKey: ctx.buildStorageKey,
    storageObjectExists: ctx.storageObjectExists,
    storageProvider: ctx.storageProvider,
    expiresAt: ctx.expiresAt
  });
});

/**
 * POST /api/downloads/request
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
      return jsonError(res, 404, "package_missing", "Package not found");
    }

    const sourceRow = await getPackageSourceFile(packageId);
    const storageKey = sourceRow?.storage_key || null;
    logDownload("request_storage_key", { packageId, storageKey, hasDbRow: Boolean(sourceRow) });

    if (!storageKey) {
      return jsonError(res, 404, "package_missing", "Protected source package not uploaded yet", {
        hint: "Admin must upload development ZIP via the product manager"
      });
    }

    const { buffer: source, exists, getObjectSuccess } = await readSourceBufferByKey(storageKey, {
      packageId,
      phase: "request"
    });

    if (!exists || !source || !getObjectSuccess) {
      logDownload("request_storage_missing", { packageId, storageKey, getObjectSuccess });
      return jsonError(res, 503, "storage_unavailable", "Package source file is missing from storage");
    }

    const tokenRow = await createDownloadToken({
      licenseId: check.license.id,
      packageId,
      storageKey
    });

    const expiresAt = new Date(tokenRow.expires_at);
    const downloadUrl = `${config.apiPublicUrl}/api/downloads/file/${tokenRow.token}`;
    const statusUrl = `${config.apiPublicUrl}/api/downloads/file/${tokenRow.token}/status`;

    logDownload("request_token_created", {
      packageId,
      licenseId: check.license.id,
      storageKey,
      tokenPrefix: `${tokenRow.token.slice(0, 8)}…`,
      expiresAt: expiresAt.toISOString()
    });

    return res.json({
      downloadUrl,
      statusUrl,
      expiresAt: expiresAt.toISOString(),
      expiresInSeconds: Math.floor(DOWNLOAD_TOKEN_TTL_MS / 1000),
      packageId,
      delivery: "stream",
      clientDownloadMode: "navigate"
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
  const tokenPrefix = rawToken ? `${String(rawToken).slice(0, 8)}…` : null;

  logDownload("file_start", {
    tokenReceived: Boolean(rawToken),
    tokenPrefix,
    origin: req.headers.origin || null,
    accept: req.headers.accept || null
  });

  const respondError = (status, code, message, fields = {}) => {
    logDownloadFile("file_response", status, {
      tokenPrefix,
      tokenFound: fields.tokenFound ?? null,
      tokenValid: fields.tokenValid ?? null,
      packageId: fields.packageId ?? null,
      licenseId: fields.licenseId ?? null,
      sourceStorageKey: fields.sourceStorageKey ?? null,
      buildStorageKey: fields.buildStorageKey ?? null,
      r2GetObjectSuccess: fields.r2GetObjectSuccess ?? null,
      code
    });
    return jsonError(res, status, code, message, fields);
  };

  try {
    const ctx = await resolveDownloadContext(rawToken);

    logDownload("file_token_lookup", {
      tokenPrefix,
      tokenFound: ctx.tokenFound ?? false,
      tokenValid: ctx.tokenValid ?? false,
      packageId: ctx.packageId || null,
      licenseId: ctx.licenseId || null,
      sourceStorageKey: ctx.sourceStorageKey || null,
      buildStorageKey: ctx.buildStorageKey || null,
      expiresAt: ctx.expiresAt || null
    });

    if (!ctx.ok) {
      return respondError(ctx.status, ctx.code, ctx.error, {
        tokenFound: ctx.tokenFound,
        tokenValid: ctx.tokenValid,
        packageId: ctx.packageId,
        licenseId: ctx.licenseId,
        sourceStorageKey: ctx.sourceStorageKey,
        buildStorageKey: ctx.buildStorageKey
      });
    }

    const { token, packageId, licenseId, sourceStorageKey, buildStorageKey, row, pkg } = ctx;

    let source;
    let r2GetObjectSuccess = false;
    try {
      const readResult = await readSourceBufferByKey(sourceStorageKey, {
        packageId,
        phase: "file",
        tokenPrefix,
        buildStorageKey
      });
      source = readResult.buffer;
      r2GetObjectSuccess = readResult.getObjectSuccess;

      logDownload("file_r2_read", {
        tokenPrefix,
        sourceStorageKey,
        buildStorageKey,
        r2GetObjectSuccess,
        byteSize: source?.length ?? 0
      });

      if (!readResult.exists || !source || !r2GetObjectSuccess) {
        return respondError(404, "package_missing", "Package source file is not available in storage", {
          tokenFound: true,
          tokenValid: true,
          packageId,
          licenseId,
          sourceStorageKey,
          buildStorageKey,
          r2GetObjectSuccess: false
        });
      }
    } catch (err) {
      logDownload("file_storage_error", {
        tokenPrefix,
        sourceStorageKey,
        error: err.message,
        r2GetObjectSuccess: false
      });
      return respondError(503, "storage_unavailable", `Could not read package from storage: ${err.message}`, {
        tokenFound: true,
        tokenValid: true,
        packageId,
        licenseId,
        sourceStorageKey,
        buildStorageKey,
        r2GetObjectSuccess: false
      });
    }

    const licenseRow = {
      license_key: row.license_key,
      package_id: packageId,
      customer_email: row.customer_email
    };

    let protectedZip;
    try {
      protectedZip = buildProtectedPackage(source, pkg, licenseRow);
    } catch (err) {
      logDownload("file_build_error", { tokenPrefix, error: err.message });
      return respondError(500, "build_failed", `Protected build failed: ${err.message}`, {
        tokenFound: true,
        tokenValid: true,
        packageId,
        licenseId,
        sourceStorageKey,
        buildStorageKey,
        r2GetObjectSuccess
      });
    }

    const filename = `${packageId}-${row.license_key.slice(0, 8)}-protected.zip`;

    logDownloadFile("file_response", 200, {
      tokenPrefix,
      tokenFound: true,
      tokenValid: true,
      packageId,
      licenseId,
      sourceStorageKey,
      buildStorageKey,
      r2GetObjectSuccess,
      protectedByteSize: protectedZip.length,
      filename
    });

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition, Content-Type");
    return res.send(protectedZip);
  } catch (err) {
    logDownloadFile("file_response", 500, {
      tokenPrefix,
      error: err.message,
      code: "download_failed"
    });
    console.error("[downloads/file]", err);
    return jsonError(res, 500, "download_failed", `Download failed: ${err.message}`);
  }
});
