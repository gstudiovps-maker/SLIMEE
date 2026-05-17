import crypto from "node:crypto";
import AdmZip from "adm-zip";
import {
  isEscrowIgnored,
  isLuaFile,
  isManifestFile,
  normalizeEscrowIgnore,
  normalizeProtectionMode
} from "./escrow.js";
import {
  buildSlimeeInitLua,
  buildSlimeeGuardPrefix,
  buildSlimeeServerCfgSnippet
} from "./slimeeLockLua.js";
import { patchFxManifestContent } from "./fxmanifestPatch.js";

const REDISTRIBUTE_NOTICE =
  "-- Do not redistribute. Unauthorized sharing may revoke your license.\n\n";

/**
 * Pick a long-string delimiter level so the payload can be embedded safely.
 * [=[ ... ]=] style — preserves original source (no comment stripping).
 */
function pickLongStringDelimiter(source) {
  for (let level = 0; level < 8; level += 1) {
    const eq = "=".repeat(level);
    const close = `]${eq}]`;
    if (!source.includes(close)) {
      return { open: `[${eq}[`, close: `]${eq}]` };
    }
  }
  throw new Error("Lua source cannot be embedded (no safe long-string delimiter)");
}

function luaChunkName(entryName) {
  const path = String(entryName || "script.lua").replace(/\\/g, "/").replace(/^\//, "");
  return `"@${path.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * FiveM-safe protection: embed exact original Lua, run with load() in global env.
 * - No comment stripping (that breaks valid scripts)
 * - No base64 loader (fragile in FiveM)
 * - No return from chunk (fxmanifest scripts must run for side effects)
 * - Chunk name matches file path for usable stack traces
 */
function protectLuaContent(content, entryName, { ipLock = false } = {}) {
  let body = String(content).replace(/^\uFEFF/, "");

  const { open, close } = pickLongStringDelimiter(body);
  const chunk = luaChunkName(entryName);
  const guard = ipLock ? buildSlimeeGuardPrefix() : "";

  return (
    `${REDISTRIBUTE_NOTICE}` +
    guard +
    `local __SLIMEE_SRC = ${open}${body}${close}\n` +
    `local __fn, __err = load(__SLIMEE_SRC, ${chunk}, "t")\n` +
    `if not __fn then\n` +
    `  error(("Slimee protected load failed [%s]: %s"):format(${chunk}, __err or "unknown"), 2)\n` +
    `end\n` +
    `return __fn()\n`
  );
}

function buildLicenseManifest(meta) {
  return JSON.stringify(
    {
      product: "Protected Package Delivery",
      packageId: meta.packageId,
      licenseKey: meta.licenseKey,
      customerEmail: meta.customerEmail || null,
      buildId: meta.buildId,
      generatedAt: meta.generatedAt,
      protectionMode: meta.protectionMode,
      note: "License Locking — validate your server with the Slimee API."
    },
    null,
    2
  );
}

/**
 * Build customer-specific protected ZIP in memory.
 */
export function buildProtectedPackage(sourceBuffer, pkg, license) {
  const protectionMode = normalizeProtectionMode(pkg.protectionMode || pkg.protection_mode);
  const escrowIgnore = normalizeEscrowIgnore(pkg.escrowIgnore || pkg.escrow_ignore);
  const buildId = crypto.randomUUID();
  const generatedAt = new Date().toISOString();

  const meta = {
    packageId: pkg.id,
    licenseKey: license.license_key,
    customerEmail: license.customer_email,
    boundServerIp: license.bound_server_ip || null,
    buildId,
    generatedAt,
    protectionMode
  };

  const sourceZip = new AdmZip(sourceBuffer);
  const outZip = new AdmZip();
  const useIpLock = protectionMode !== "open";
  let manifestPath = null;
  let manifestPatched = false;

  for (const entry of sourceZip.getEntries()) {
    if (entry.isDirectory) {
      continue;
    }

    const name = entry.entryName.replace(/\\/g, "/");
    let content = entry.getData();

    if (isManifestFile(name)) {
      manifestPath = name;
      if (useIpLock) {
        continue;
      }
    }

    if (protectionMode === "open") {
      outZip.addFile(name, content);
      continue;
    }

    const ignored = isEscrowIgnored(name, escrowIgnore) || isManifestFile(name);
    if (!isLuaFile(name) || ignored) {
      outZip.addFile(name, content);
      continue;
    }

    if (protectionMode === "full" || protectionMode === "partial") {
      const text = content.toString("utf8");
      const isClient = /^client/i.test(name) || /\/client\//i.test(name);
      content = Buffer.from(
        protectLuaContent(text, name, { ipLock: useIpLock && !isClient }),
        "utf8"
      );
    }

    outZip.addFile(name, content);
  }

  if (useIpLock) {
    outZip.addFile("slimee_protect/init.lua", Buffer.from(buildSlimeeInitLua(meta), "utf8"));
    outZip.addFile(
      "slimee_protect/server.cfg.example",
      Buffer.from(buildSlimeeServerCfgSnippet(meta), "utf8")
    );

    if (!manifestPath) {
      manifestPath = "fxmanifest.lua";
      outZip.addFile(
        manifestPath,
        Buffer.from(
          patchFxManifestContent("fx_version 'cerulean'\ngame 'gta5'\n", meta.packageId),
          "utf8"
        )
      );
      manifestPatched = true;
    }
  }

  if (useIpLock && manifestPath && !manifestPatched) {
    const manifestEntry = sourceZip.getEntry(manifestPath);
    if (manifestEntry) {
      const patched = patchFxManifestContent(manifestEntry.getData().toString("utf8"), meta.packageId);
      outZip.addFile(manifestPath, Buffer.from(patched, "utf8"));
      manifestPatched = true;
    }
  }

  outZip.addFile(
    "SLIMEE_PROTECTED/README.txt",
    Buffer.from(
      [
        "Protected Package Delivery",
        "========================",
        `Package: ${meta.packageId}`,
        `License: ${meta.licenseKey}`,
        `Build: ${buildId}`,
        "",
        "Files outside escrow_ignore were processed with License Locking.",
        "Configure editable paths in your admin panel (escrow_ignore).",
        "",
        "IP LOCK (not CFX FXAP):",
        "- This package uses Slimee IP Lock via slimee_protect/init.lua",
        "- Official Tebex/CFX .fxap escrow requires selling on Cfx Keymaster.",
        "- Add slimee_protect/server.cfg.example lines to server.cfg",
        meta.boundServerIp ? `- Admin pre-locked IP: ${meta.boundServerIp}` : "- IP binds on first server start"
      ].join("\n"),
      "utf8"
    )
  );

  outZip.addFile("SLIMEE_PROTECTED/license.json", Buffer.from(buildLicenseManifest(meta), "utf8"));
  outZip.addFile(
    "SLIMEE_PROTECTED/NOT_FXAP.txt",
    Buffer.from(
      [
        "This is NOT a Cfx/Tebex FXAP asset.",
        "Slimee IP Lock uses your Render API + license key in server.cfg.",
        "Real .fxap files only work when published through Cfx.re Keymaster.",
        "Your tool at E:/TOOL/WORKING/CFX decrypts third-party FXAP — it cannot create",
        "official escrow for your own store. Slimee IP Lock is the supported alternative."
      ].join("\n"),
      "utf8"
    )
  );

  return outZip.toBuffer();
}
