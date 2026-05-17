import { config } from "../config.js";

/**
 * Public API base URL for links returned to clients.
 * Prefer the incoming request host so POST and GET hit the same deployment + database.
 */
export function resolvePublicApiBase(req) {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const proto = forwardedProto ? String(forwardedProto).split(",")[0].trim() : req.protocol;
  const host = req.headers["x-forwarded-host"] || req.get("host");

  if (host && !host.includes("localhost") && !host.startsWith("127.0.0.1")) {
    return `${proto}://${host}`.replace(/\/+$/, "").replace(/\/api$/i, "");
  }

  return config.apiPublicUrl;
}

export function buildDownloadUrls(req, token) {
  const apiBase = resolvePublicApiBase(req);
  return {
    apiBase,
    downloadUrl: `${apiBase}/api/downloads/file/${token}`,
    statusUrl: `${apiBase}/api/downloads/file/${token}/status`
  };
}
