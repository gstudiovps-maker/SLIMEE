import { isManifestFile } from "./escrow.js";

function norm(p) {
  return String(p || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

/**
 * Find the FiveM resource folder inside an upload (e.g. Gstudio_flipcar/).
 * Uses the fxmanifest that contains the most package files.
 */
export function detectResourceRoot(zipEntries) {
  const files = zipEntries.filter((e) => !e.isDirectory).map((e) => norm(e.entryName));
  const manifests = files.filter(isManifestFile);
  if (!manifests.length) {
    return "";
  }

  let bestRoot = "";
  let bestScore = -1;

  for (const manifestPath of manifests) {
    const slash = manifestPath.lastIndexOf("/");
    const root = slash >= 0 ? manifestPath.slice(0, slash + 1) : "";
    const score = files.filter((f) => f.startsWith(root) && !isManifestFile(f)).length;
    if (score > bestScore) {
      bestScore = score;
      bestRoot = root;
    }
  }

  return bestRoot;
}

/** Path inside the resource, or null if the file is outside the resource folder. */
export function toResourceRelative(entryName, resourceRoot) {
  const n = norm(entryName);
  const root = norm(resourceRoot);
  if (!root) {
    return n;
  }
  if (n.startsWith(root)) {
    return n.slice(root.length);
  }
  return null;
}

/** Full path in the output ZIP. */
export function toZipPath(resourceRelative, resourceRoot) {
  const rel = norm(resourceRelative);
  const root = norm(resourceRoot);
  if (!root) {
    return rel;
  }
  return root + rel;
}
