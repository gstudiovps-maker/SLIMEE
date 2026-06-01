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
import { buildSlimeeClientLua, buildClientLuaStub } from "./slimeeClientLua.js";
import { patchFxManifestContent } from "./fxmanifestPatch.js";
import { vaultPathForLua } from "./vaultPath.js";
import { detectResourceRoot, toResourceRelative, toZipPath } from "./resourceRoot.js";
import { isSlimeeRuntimeFile, isServerLuaPath, isClientLuaPath } from "./scriptSides.js";
import { parseManifestScripts, scriptSideFromManifest } from "./manifestParse.js";
import { PACKAGER_VERSION } from "./packagerVersion.js";
import { sanitizeSourceZip } from "./sourceSanitize.js";

export { PACKAGER_VERSION };

function isSlimeeInternal(relPath) {
  const n = relPath.replace(/\\/g, "/").toLowerCase();
  return n.startsWith("slimee_vault/") || n.startsWith("slimee_protected/");
}

function resolveScriptSide(relPath, manifestLists) {
  const fromManifest = scriptSideFromManifest(relPath, manifestLists);
  if (fromManifest === "client") return "client";
  if (fromManifest === "server") return "server";
  if (fromManifest === "shared") return "shared";
  if (isClientLuaPath(relPath)) return "client";
  if (isServerLuaPath(relPath)) return "server";
  return "other";
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
      protectionMode: meta.protectionMode,
      packagerVersion: PACKAGER_VERSION
    },
    null,
    2
  );
}

/**
 * Website-driven protection: partial/full mode + escrow ignore from admin.
 * Encrypted blobs go to slimee_vault/; original paths keep loader stubs.
 */
export function buildProtectedPackage(sourceBuffer, pkg, license) {
  const { buffer: cleanSource, stripped: sourceStripped } = sanitizeSourceZip(sourceBuffer);

  const protectionMode = normalizeProtectionMode(pkg.protectionMode || pkg.protection_mode);
  const escrowIgnore = normalizeEscrowIgnore(
    pkg.escrowIgnore || pkg.escrow_ignore,
    protectionMode
  );
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

  const sourceZip = new AdmZip(cleanSource);
  const entries = sourceZip.getEntries();
  const resourceRoot = detectResourceRoot(entries);
  const outZip = new AdmZip();
  const serverManifest = [];
  const clientManifest = [];
  let manifestRelPath = null;
  let manifestZipPath = null;
  let manifestContent = null;

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const zipName = entry.entryName.replace(/\\/g, "/");
    const rel = toResourceRelative(zipName, resourceRoot);
    if (rel == null || rel === "" || rel.includes("..")) continue;
    if (isManifestFile(rel)) {
      manifestRelPath = rel;
      manifestZipPath = toZipPath(rel, resourceRoot);
      manifestContent = entry.getData().toString("utf8");
      break;
    }
  }

  const manifestLists = manifestContent ? parseManifestScripts(manifestContent) : null;

  for (const entry of entries) {
    if (entry.isDirectory) {
      continue;
    }

    const zipName = entry.entryName.replace(/\\/g, "/");
    const rel = toResourceRelative(zipName, resourceRoot);

    if (rel == null || rel === "" || rel.includes("..")) {
      continue;
    }

    const content = entry.getData();

    if (isManifestFile(rel)) {
      continue;
    }

    if (isSlimeeInternal(rel) || isSlimeeRuntimeFile(rel)) {
      continue;
    }

    const outPath = toZipPath(rel, resourceRoot);

    if (!useProtection) {
      outZip.addFile(outPath, content);
      continue;
    }

    const ignored = isEscrowIgnored(rel, escrowIgnore);
    const side = resolveScriptSide(rel, manifestLists);
    const encryptServer = side === "server" && isLuaFile(rel) && !ignored;
    const encryptClient = side === "client" && isLuaFile(rel) && !ignored;

    if (encryptServer || encryptClient) {
      const vaultRel = vaultPathForLua(rel);
      const encrypted = encryptLuaChaCha(content, resourceKey);
      const manifestEntry = { lua: rel, vault: vaultRel };

      if (encryptServer) {
        serverManifest.push(manifestEntry);
        outZip.addFile(outPath, Buffer.from(buildLuaStub(rel), "utf8"));
      } else {
        clientManifest.push(manifestEntry);
        outZip.addFile(outPath, Buffer.from(buildClientLuaStub(rel), "utf8"));
      }

      outZip.addFile(toZipPath(vaultRel, resourceRoot), encrypted);
      continue;
    }

    outZip.addFile(outPath, content);
  }

  if (useProtection) {
    const clientOrder = (manifestLists?.client || []).filter((p) =>
      clientManifest.some((e) => e.lua.replace(/\\/g, "/") === p.replace(/\\/g, "/"))
    );
    for (const entry of clientManifest) {
      const norm = entry.lua.replace(/\\/g, "/");
      if (!clientOrder.some((p) => p.replace(/\\/g, "/") === norm)) {
        clientOrder.push(entry.lua);
      }
    }

    outZip.addFile(
      toZipPath("slimee_license.lua", resourceRoot),
      Buffer.from(buildSlimeeLicenseLua(meta), "utf8")
    );
    const clientManifestOrdered = clientOrder.map((lua) => {
      const found = clientManifest.find(
        (e) => e.lua.replace(/\\/g, "/") === lua.replace(/\\/g, "/")
      );
      return found || { lua, vault: vaultPathForLua(lua) };
    });

    outZip.addFile(
      toZipPath("slimee_loader.lua", resourceRoot),
      Buffer.from(buildSlimeeLoaderLua(serverManifest, clientManifestOrdered, buildId), "utf8")
    );
    if (clientManifest.length > 0) {
      outZip.addFile(
        toZipPath("slimee_client.lua", resourceRoot),
        Buffer.from(buildSlimeeClientLua(buildId, clientOrder), "utf8")
      );
    }

    const baseManifest = manifestContent || "fx_version 'cerulean'\ngame 'gta5'\n";

    const patched = patchFxManifestContent(baseManifest, {
      protectedServerScripts: serverManifest.map((e) => e.lua),
      protectedClientScripts: clientManifest.map((e) => e.lua),
      includeClientLoader: clientManifest.length > 0
    });

    outZip.addFile(
      toZipPath(manifestRelPath || "fxmanifest.lua", resourceRoot),
      Buffer.from(patched, "utf8")
    );

    outZip.addFile("license.json", Buffer.from(buildLicenseManifest(meta), "utf8"));
  } else if (manifestZipPath) {
    outZip.addFile(manifestZipPath, sourceZip.getEntry(manifestZipPath).getData());
  }

  return {
    buffer: outZip.toBuffer(),
    packagerVersion: PACKAGER_VERSION,
    sourceStripped
  };
}
