import express from "express";
import { config } from "../config.js";
import { findByLicenseKey } from "../lib/licenses.js";
import { getPackageById } from "../lib/packages.js";
import { getPackageSourceFile } from "../lib/packageFiles.js";
import { buildProtectedPackage } from "../lib/protection/packager.js";
import { logDownload, logDownloadFile } from "../lib/downloadLog.js";
import {
  createDownloadToken,
  DOWNLOAD_TOKEN_TTL_MS,
  DOWNLOAD_TOKEN_STORAGE,
  markDownloadTokenUsed
} from "../lib/downloadTokens.js";
import { readSourceBufferByKey } from "../lib/packageStorage.js";
import { resolveDownloadContext } from "../lib/downloadResolve.js";
import { INVALID_DOWNLOAD_TOKEN_MESSAGE } from "../lib/downloadConstants.js";
import { buildDownloadUrls } from "../lib/apiUrl.js";

export { INVALID_DOWNLOAD_TOKEN_MESSAGE };

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

/** GET /api/downloads/file/:token/status */
export async function downloadFileStatusHandler(req, res) {
  const rawToken = req.params.token;
  const normalizedToken = String(rawToken || "").trim().toLowerCase();
  logDownload("file_status_start", {
    tokenReceivedRaw: rawToken || null,
    tokenReceivedNormalized: normalizedToken,
    tokenLength: normalizedToken.length,
    tokenStorage: DOWNLOAD_TOKEN_STORAGE
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
    code: ctx.code || null
  });

  if (!ctx.ok) {
    const error =
      ctx.code === "token_not_found" || ctx.code === "token_expired"
        ? INVALID_DOWNLOAD_TOKEN_MESSAGE
        : ctx.error;
    return res.status(statusCode).json({
      ok: false,
      error,
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
}

/** POST /api/downloads/request */
export async function downloadRequestHandler(req, res) {
  try {
    const { licenseKey, packageId } = req.body || {};
    logDownload("request_start", { packageId, hasLicenseKey: Boolean(licenseKey) });

    if (!licenseKey || !packageId) {
      return jsonError(res, 400, "missing_fields", "licenseKey and packageId are required");
    }

    const check = await assertActiveLicense(licenseKey, packageId);
    if (!check.ok) {
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

    if (!storageKey) {
      return jsonError(res, 404, "package_missing", "Protected source package not uploaded yet");
    }

    const { buffer: source, exists, getObjectSuccess } = await readSourceBufferByKey(storageKey, {
      packageId,
      phase: "request"
    });

    if (!exists || !source || !getObjectSuccess) {
      return jsonError(res, 503, "storage_unavailable", "Package source file is missing from storage");
    }

    const tokenRow = await createDownloadToken({
      licenseId: check.license.id,
      packageId,
      storageKey
    });

    const expiresAt = new Date(tokenRow.expires_at);
    const { apiBase, downloadUrl, statusUrl } = buildDownloadUrls(req, tokenRow.token);

    logDownload("request_token_created", {
      packageId,
      licenseId: check.license.id,
      storageKey,
      token: tokenRow.token,
      tokenStorage: DOWNLOAD_TOKEN_STORAGE,
      downloadTokenId: tokenRow.id,
      downloadUrl,
      statusUrl,
      apiBaseResolved: apiBase,
      configApiPublicUrl: config.apiPublicUrl,
      expiresAt: expiresAt.toISOString()
    });

    return res.json({
      token: tokenRow.token,
      downloadUrl,
      statusUrl,
      expiresAt: expiresAt.toISOString(),
      expiresInSeconds: Math.floor(DOWNLOAD_TOKEN_TTL_MS / 1000),
      packageId,
      tokenStorage: DOWNLOAD_TOKEN_STORAGE,
      delivery: "stream",
      clientDownloadMode: "navigate"
    });
  } catch (err) {
    logDownload("request_error", { error: err.message });
    console.error("[downloads/request]", err);
    return jsonError(res, 500, "request_failed", "Could not create download link");
  }
}

/** GET /api/downloads/file/:token */
export async function downloadFileHandler(req, res) {
  const rawToken = req.params.token;
  const normalizedToken = String(rawToken || "").trim().toLowerCase();
  const tokenPrefix = rawToken ? `${String(rawToken).slice(0, 8)}…` : null;

  logDownload("file_start", {
    tokenReceivedRaw: rawToken || null,
    tokenReceivedNormalized: normalizedToken,
    tokenLength: normalizedToken.length,
    tokenPrefix,
    path: req.originalUrl || req.url,
    tokenStorage: DOWNLOAD_TOKEN_STORAGE
  });

  const respondError = (status, code, message, fields = {}) => {
    const error =
      code === "token_not_found" || code === "token_expired"
        ? INVALID_DOWNLOAD_TOKEN_MESSAGE
        : message;
    logDownloadFile("file_response", status, { tokenPrefix, code, ...fields });
    return jsonError(res, status, code, error, fields);
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
      buildStorageKey: ctx.buildStorageKey || null
    });

    if (!ctx.ok) {
      logDownload("file_token_mismatch", {
        tokenReceivedRaw: rawToken,
        tokenReceivedNormalized: normalizedToken,
        tokenFound: ctx.tokenFound,
        storedToken: ctx.token || null,
        tokensMatch: ctx.token ? ctx.token === normalizedToken : false,
        code: ctx.code
      });
      return respondError(ctx.status, ctx.code, ctx.error, {
        tokenFound: ctx.tokenFound,
        tokenValid: ctx.tokenValid,
        packageId: ctx.packageId,
        licenseId: ctx.licenseId,
        sourceStorageKey: ctx.sourceStorageKey,
        buildStorageKey: ctx.buildStorageKey
      });
    }

    const { packageId, licenseId, sourceStorageKey, buildStorageKey, row, pkg } = ctx;

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
      return respondError(503, "storage_unavailable", `Could not read package from storage: ${err.message}`, {
        r2GetObjectSuccess: false
      });
    }

    const licenseRow = {
      license_key: row.license_key,
      package_id: packageId,
      customer_email: row.customer_email
    };

    const protectedZip = buildProtectedPackage(source, pkg, licenseRow);
    const filename = `${packageId}-${row.license_key.slice(0, 8)}-protected.zip`;

    await markDownloadTokenUsed(rawToken);

    logDownloadFile("file_response", 200, {
      tokenReceivedRaw: rawToken,
      tokenReceivedNormalized: normalizedToken,
      storedToken: ctx.token,
      tokensMatch: ctx.token === normalizedToken,
      packageId,
      licenseId,
      sourceStorageKey,
      buildStorageKey,
      r2GetObjectSuccess,
      protectedByteSize: protectedZip.length
    });

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "no-store");
    return res.send(protectedZip);
  } catch (err) {
    logDownloadFile("file_response", 500, { tokenPrefix, error: err.message });
    console.error("[downloads/file]", err);
    return jsonError(res, 500, "download_failed", `Download failed: ${err.message}`);
  }
}

function downloadsNotFoundHandler(req, res) {
  logDownload("route_not_found", { method: req.method, path: req.path, originalUrl: req.originalUrl });
  return res.status(404).json({
    error: `Downloads route not found: ${req.method} ${req.path}`,
    code: "downloads_route_not_found",
    hint: "Use GET /api/downloads/file/:token"
  });
}

/**
 * Mount download routes on the Express app (call once from index.js).
 */
export function registerDownloadsRoutes(app) {
  const router = express.Router();

  router.get("/file/:token/status", downloadFileStatusHandler);
  router.post("/request", downloadRequestHandler);
  router.get("/file/:token", downloadFileHandler);
  router.use(downloadsNotFoundHandler);

  app.use("/api/downloads", router);

  console.log("[downloads] routes mounted at /api/downloads");
  console.log("[downloads] GET /api/downloads/file/:token enabled");
  console.log("[downloads] GET /api/downloads/file/:token/status enabled");
  console.log("[downloads] POST /api/downloads/request enabled");

  for (const layer of router.stack) {
    if (!layer.route) continue;
    const methods = Object.keys(layer.route.methods)
      .map((m) => m.toUpperCase())
      .join(",");
    console.log(`[downloads]   ${methods} /api/downloads${layer.route.path}`);
  }

  return router;
}

// Legacy export: pre-wired router (same handlers as registerDownloadsRoutes)
downloadsRouter.get("/file/:token/status", downloadFileStatusHandler);
downloadsRouter.post("/request", downloadRequestHandler);
downloadsRouter.get("/file/:token", downloadFileHandler);
downloadsRouter.use(downloadsNotFoundHandler);
