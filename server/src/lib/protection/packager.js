import crypto from "node:crypto";
import AdmZip from "adm-zip";
import {
  isEscrowIgnored,
  isLuaFile,
  isManifestFile,
  normalizeEscrowIgnore,
  normalizeProtectionMode
} from "./escrow.js";
import { deriveResourceKey, encryptLuaChaCha } from "./slimeeChaCha.js";
import { buildSlimeeLicenseLua } from "./slimeeLicenseLua.js";
import { buildSlimeeLoaderLua, buildLuaStub } from "./slimeeLoaderLua.js";
import { patchFxManifestContent } from "./fxmanifestPatch.js";
import { vaultPathForLua } from "./vaultPath.js";

const SLIMEE_SERVER_FILES = new Set([
  "slimee_license.lua",
  "slimee_loader.lua",
  "fxmanifest.lua",
  "__resource.lua"
]);

function isSlimeeInternal(name) {
  const n = name.replace(/\\/g, "/").toLowerCase();
  return n.startsWith("slimee_vault/") || n.startsWith("slimee_protected/");
}

function isServerLuaPath(name) {
  const n = name.replace(/\\/g, "/").toLowerCase();
  if (SLIMEE_SERVER_FILES.has(n.split("/").pop())) return false;
  if (n.startsWith("client/") || n.startsWith("client_")) return false;
  if (/\/client\//.test(n)) return false;
  if (n.includes("client.lua")) return false;
  return n.endsWith(".lua");
}

function buildLicenseManifest(meta) {
  return JSON.stringify(
    {
      product: "Slimee Protected Delivery",
      encryption: "chacha20-slme-cfx-family",
      packageId: meta.packageId,
      licenseKey: meta.licenseKey,
      buildId: meta.buildId,
      generatedAt: meta.generatedAt,
      protectionMode: meta.protectionMode
    },
    null,
    2
  );
}

/**
 * Build customer ZIP — preserves folder layout; server .lua stubs + vault; client stays plain .lua.
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

  const resourceKey = deriveResourceKey(meta);
  const useProtection = protectionMode !== "open";

  const sourceZip = new AdmZip(sourceBuffer);
  const outZip = new AdmZip();
  const serverManifest = [];
  let manifestPath = null;

  for (const entry of sourceZip.getEntries()) {
    if (entry.isDirectory) {
      continue;
    }

    const name = entry.entryName.replace(/\\/g, "/");
    const content = entry.getData();

    if (isManifestFile(name)) {
      manifestPath = name;
      continue;
    }

    if (isSlimeeInternal(name)) {
      continue;
    }

    if (!useProtection) {
      outZip.addFile(name, content);
      continue;
    }

    const ignored = isEscrowIgnored(name, escrowIgnore) || isManifestFile(name);
    const encryptServer = isServerLuaPath(name) && isLuaFile(name) && !ignored;

    if (encryptServer) {
      const vault = vaultPathForLua(name);
      const encrypted = encryptLuaChaCha(content, resourceKey);
      serverManifest.push({ lua: name, vault });
      outZip.addFile(vault, encrypted);
      outZip.addFile(name, Buffer.from(buildLuaStub(name), "utf8"));
      continue;
    }

    outZip.addFile(name, content);
  }

  if (useProtection) {
    outZip.addFile("slimee_license.lua", Buffer.from(buildSlimeeLicenseLua(meta), "utf8"));
    outZip.addFile("slimee_loader.lua", Buffer.from(buildSlimeeLoaderLua(serverManifest), "utf8"));

    const manifestEntry = manifestPath ? sourceZip.getEntry(manifestPath) : null;
    const baseManifest = manifestEntry
      ? manifestEntry.getData().toString("utf8")
      : "fx_version 'cerulean'\ngame 'gta5'\n";

    outZip.addFile(
      manifestPath || "fxmanifest.lua",
      Buffer.from(patchFxManifestContent(baseManifest), "utf8")
    );
  } else if (manifestPath) {
    outZip.addFile(manifestPath, sourceZip.getEntry(manifestPath).getData());
  }

  outZip.addFile(
    "SLIMEE_PROTECTED/README.txt",
    Buffer.from(
      [
        "Slimee Protected Delivery",
        "========================",
        `Package: ${meta.packageId}`,
        `Build: ${buildId}`,
        "",
        "Structure preserved (client/, server/, stream/, etc.)",
        "Server scripts: ChaCha20 encrypted (CFX FXAP-style) in slimee_vault/",
        "Matching paths still end in .lua (loader stubs).",
        "Client scripts: plain .lua (unchanged paths).",
        "",
        "Start order: slimee_license.lua → slimee_loader.lua",
        "No server.cfg — IP locks on first start via slimee_license.lua"
      ].join("\n"),
      "utf8"
    )
  );

  outZip.addFile("SLIMEE_PROTECTED/license.json", Buffer.from(buildLicenseManifest(meta), "utf8"));

  return outZip.toBuffer();
}
