import crypto from "node:crypto";
import AdmZip from "adm-zip";
import {
  isEscrowIgnored,
  isLuaFile,
  isManifestFile,
  normalizeEscrowIgnore,
  normalizeProtectionMode
} from "./escrow.js";

function protectLuaContent(content, meta) {
  const header = [
    "-- [[ Protected Package Delivery | License Locking ]]",
    `-- Package: ${meta.packageId}`,
    `-- License: ${meta.licenseKey}`,
    `-- Build: ${meta.buildId}`,
    `-- Generated: ${meta.generatedAt}`,
    "-- Do not redistribute. Unauthorized sharing may revoke your license.",
    ""
  ].join("\n");

  let body = String(content);
  body = body.replace(/--\[\[[\s\S]*?\]\]/g, "");
  body = body.replace(/--[^\n]*/g, "");
  body = body.replace(/\n{3,}/g, "\n\n");

  const encoded = Buffer.from(body, "utf8").toString("base64");
  const chunks = encoded.match(/.{1, 72}/g) || [];

  return `${header}local __SLIMEE_B64 = {\n${chunks.map((c) => `  "${c}",`).join("\n")}\n}\nlocal __SLIMEE_SRC = {}\nfor _,p in ipairs(__SLIMEE_B64) do __SLIMEE_SRC[#__SLIMEE_SRC+1]=p end\nlocal __fn, __err = load(table.concat(__SLIMEE_SRC), "@slimee_protected", "t", _ENV or _G)\nif not __fn then error(__err) end\nreturn __fn()\n`;
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
    buildId,
    generatedAt,
    protectionMode
  };

  const sourceZip = new AdmZip(sourceBuffer);
  const outZip = new AdmZip();

  for (const entry of sourceZip.getEntries()) {
    if (entry.isDirectory) {
      continue;
    }

    const name = entry.entryName.replace(/\\/g, "/");
    let content = entry.getData();

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
      content = Buffer.from(protectLuaContent(text, meta), "utf8");
    }

    outZip.addFile(name, content);
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
        "Configure editable paths in your admin panel (escrow_ignore)."
      ].join("\n"),
      "utf8"
    )
  );

  outZip.addFile("SLIMEE_PROTECTED/license.json", Buffer.from(buildLicenseManifest(meta), "utf8"));

  return outZip.toBuffer();
}
