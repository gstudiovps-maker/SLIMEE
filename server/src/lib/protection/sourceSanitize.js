import AdmZip from "adm-zip";
import { isSlimeeRuntimeFile } from "./scriptSides.js";

const STUB_MARKERS = [
  /^--\s*Slimee protected \(client\)/m,
  /^--\s*Slimee protected \(server\)/m,
  /^if SlimeeLoad then return SlimeeLoad/m
];

function isSlimeeArtifactPath(rel) {
  const n = String(rel).replace(/\\/g, "/").toLowerCase();
  if (n === "license.json") return true;
  if (n.startsWith("slimee_vault/")) return true;
  if (n.startsWith("slimee_protected/")) return true;
  return isSlimeeRuntimeFile(rel);
}

function isLoaderStub(content) {
  if (!content?.length) return false;
  const head = content.subarray(0, 400).toString("utf8");
  return STUB_MARKERS.some((re) => re.test(head));
}

/**
 * If an old protected build was uploaded as the admin source, strip Slimee
 * runtime artifacts so we re-package from the remaining plain files only.
 * Returns { buffer, stripped, warning }.
 */
export function sanitizeSourceZip(sourceBuffer) {
  const zip = new AdmZip(sourceBuffer);
  const entries = zip.getEntries();
  let hadSlimeeRuntime = false;
  let hadVault = false;
  let stubCount = 0;
  let keptLua = 0;

  const out = new AdmZip();

  for (const entry of entries) {
    if (entry.isDirectory) continue;

    const name = entry.entryName.replace(/\\/g, "/");
    const base = name.split("/").pop()?.toLowerCase() || "";

    if (base === "slimee_loader.lua" || base === "slimee_license.lua" || base === "slimee_client.lua") {
      hadSlimeeRuntime = true;
      continue;
    }

    if (isSlimeeArtifactPath(name)) {
      if (name.toLowerCase().startsWith("slimee_vault/")) hadVault = true;
      continue;
    }

    const content = entry.getData();

    if (name.toLowerCase().endsWith(".lua") && isLoaderStub(content)) {
      stubCount += 1;
      continue;
    }

    if (name.toLowerCase().endsWith(".lua")) {
      keptLua += 1;
    }

    out.addFile(name, content);
  }

  const stripped = hadSlimeeRuntime || hadVault || stubCount > 0;

  if (stripped && keptLua < 1) {
    const err = new Error(
      "Package source looks like an old Slimee protected download. Re-upload the original unprotected development ZIP in admin."
    );
    err.code = "source_is_protected_build";
    throw err;
  }

  return {
    buffer: stripped ? out.toBuffer() : sourceBuffer,
    stripped,
    warning: stripped
      ? "Removed previous Slimee protection artifacts from source; rebuilt with latest packager."
      : null
  };
}
