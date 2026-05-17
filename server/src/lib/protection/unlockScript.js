import { deriveResourceKey, decryptLuaChaCha } from "./slimeeChaCha.js";
import { validateLicenseForServer, getRequestClientIp } from "../licenseValidation.js";

/**
 * Decrypt one SLME vault blob after license + IP check (keys never shipped to customer).
 */
export async function unlockScriptForRequest(req, body) {
  const { licenseKey, packageId, buildId, resourceName, vaultPath, luaPath, blobB64 } = body || {};

  if (!licenseKey || !packageId || !buildId || !blobB64) {
    return { ok: false, status: 400, error: "licenseKey, packageId, buildId, and blobB64 are required" };
  }

  const serverIp = getRequestClientIp(req);
  const validation = await validateLicenseForServer({
    licenseKey,
    packageId,
    resourceName: resourceName || "",
    serverIp
  });

  if (!validation.valid) {
    return {
      ok: false,
      status: validation.reason === "ip_mismatch" ? 403 : 401,
      error: validation.reason || "license_invalid"
    };
  }

  let encrypted;
  try {
    encrypted = Buffer.from(String(blobB64), "base64");
  } catch {
    return { ok: false, status: 400, error: "invalid_blob" };
  }

  if (encrypted.length < 0x56 || encrypted.subarray(0, 4).toString() !== "SLME") {
    return { ok: false, status: 400, error: "not_slme_blob" };
  }

  const resourceKey = deriveResourceKey({
    licenseKey,
    packageId,
    buildId
  });

  let plaintext;
  try {
    plaintext = decryptLuaChaCha(encrypted, resourceKey);
  } catch (err) {
    console.error("[unlock-script] decrypt", vaultPath || luaPath, err.message);
    return { ok: false, status: 400, error: "decrypt_failed" };
  }

  return {
    ok: true,
    status: 200,
    source: plaintext.toString("utf8"),
    vaultPath: vaultPath || null,
    luaPath: luaPath || null
  };
}
