import crypto from "node:crypto";
import AdmZip from "adm-zip";
import {
  isEscrowIgnored,
  isLuaFile,
  isManifestFile,
  normalizeEscrowIgnore,
  normalizeProtectionMode
} from "./escrow.js";
import { deriveSlimeeKey, encryptSlimeefxap, luaPathToSlimeefxap } from "./slimeefxap.js";
import { buildSlimeeLicenseLua } from "./slimeeLicenseLua.js";
import { buildSlimeeLoaderLua } from "./slimeeLoaderLua.js";
import { patchFxManifestContent } from "./fxmanifestPatch.js";

function buildLicenseManifest(meta) {
  return JSON.stringify(
    {
      product: "Slimee Protected Delivery",
      format: "slimeefxap",
      packageId: meta.packageId,
      licenseKey: meta.licenseKey,
      buildId: meta.buildId,
      generatedAt: meta.generatedAt,
      protectionMode: meta.protectionMode,
      note: "Each customer copy is unique. IP locks on first start. No server.cfg required."
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

  const decryptKey = deriveSlimeeKey(meta);
  const decryptKeyHex = decryptKey.toString("hex");
  const useProtection = protectionMode !== "open";

  const sourceZip = new AdmZip(sourceBuffer);
  const outZip = new AdmZip();
  const encryptedManifest = [];
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
      if (useProtection) {
        continue;
      }
    }

    if (!useProtection) {
      outZip.addFile(name, content);
      continue;
    }

    const ignored = isEscrowIgnored(name, escrowIgnore) || isManifestFile(name);
    const isClient = /^client/i.test(name) || /\/client\//i.test(name);

    if (!isLuaFile(name) || ignored || isClient) {
      outZip.addFile(name, content);
      continue;
    }

    const slimeePath = luaPathToSlimeefxap(name);
    const encrypted = encryptSlimeefxap(content, decryptKey);
    encryptedManifest.push({ path: slimeePath, original: name });
    outZip.addFile(slimeePath, encrypted);
  }

  if (useProtection) {
    outZip.addFile("slimee_license.lua", Buffer.from(buildSlimeeLicenseLua(meta, decryptKeyHex), "utf8"));
    outZip.addFile("slimee_protect/loader.lua", Buffer.from(buildSlimeeLoaderLua(encryptedManifest), "utf8"));

    if (!manifestPath) {
      manifestPath = "fxmanifest.lua";
      outZip.addFile(
        manifestPath,
        Buffer.from(patchFxManifestContent("fx_version 'cerulean'\ngame 'gta5'\n", encryptedManifest), "utf8")
      );
      manifestPatched = true;
    } else {
      const manifestEntry = sourceZip.getEntry(manifestPath);
      if (manifestEntry) {
        outZip.addFile(
          manifestPath,
          Buffer.from(
            patchFxManifestContent(manifestEntry.getData().toString("utf8"), encryptedManifest),
            "utf8"
          )
        );
        manifestPatched = true;
      }
    }
  }

  outZip.addFile(
    "SLIMEE_PROTECTED/README.txt",
    Buffer.from(
      [
        "Slimee Protected Delivery",
        "========================",
        `Package: ${meta.packageId}`,
        `License: ${meta.licenseKey}`,
        `Build: ${buildId}`,
        "",
        "NO SERVER.CFG NEEDED",
        "- Drag this resource into your server and start it.",
        "- slimee_license.lua calls the Slimee API and locks to your server public IP.",
        "- Sharing this folder will NOT work on another server (IP mismatch).",
        "",
        "FORMAT: .slimeefxap (Slimee escrow — not Cfx FXAP)",
        `Encrypted scripts: ${encryptedManifest.length}`,
        meta.boundServerIp ? `Admin pre-locked IP: ${meta.boundServerIp}` : "IP locks automatically on first start."
      ].join("\n"),
      "utf8"
    )
  );

  outZip.addFile("SLIMEE_PROTECTED/license.json", Buffer.from(buildLicenseManifest(meta), "utf8"));

  return outZip.toBuffer();
}
