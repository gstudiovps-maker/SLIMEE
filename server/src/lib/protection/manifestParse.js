/**
 * Parse fxmanifest / __resource.lua script lists (order preserved).
 */

function normalizeScriptPath(raw) {
  let s = String(raw || "").trim();
  if (!s) return null;
  s = s.replace(/^@.*?\/+/, "");
  s = s.replace(/\\/g, "/").replace(/^\.\/+/, "");
  if (!s.toLowerCase().endsWith(".lua")) {
    return null;
  }
  return s;
}

function extractQuotedPaths(block) {
  const paths = [];
  const re = /['"]([^'"]+\.lua)['"]/gi;
  let m;
  while ((m = re.exec(block)) !== null) {
    const p = normalizeScriptPath(m[1]);
    if (p) paths.push(p);
  }
  return paths;
}

function extractBlocks(text, blockNames) {
  const out = [];
  for (const name of blockNames) {
    const re = new RegExp(`${name}\\s*\\{([^}]*)\\}`, "gis");
    let m;
    while ((m = re.exec(text)) !== null) {
      out.push(m[1]);
    }
  }
  return out;
}

function extractSingles(text, directive) {
  const paths = [];
  const re = new RegExp(`${directive}\\s+['"]([^'"]+)['"]`, "gi");
  let m;
  while ((m = re.exec(text)) !== null) {
    const p = normalizeScriptPath(m[1]);
    if (p) paths.push(p);
  }
  return paths;
}

/**
 * @returns {{ client: string[], server: string[], shared: string[] }}
 */
export function parseManifestScripts(manifestContent) {
  const text = String(manifestContent || "").replace(/^\uFEFF/, "");
  const client = [];
  const server = [];
  const shared = [];

  for (const block of extractBlocks(text, ["client_scripts"])) {
    client.push(...extractQuotedPaths(block));
  }
  for (const p of extractSingles(text, "client_script")) {
    client.push(p);
  }

  for (const block of extractBlocks(text, ["server_scripts"])) {
    server.push(...extractQuotedPaths(block));
  }
  for (const p of extractSingles(text, "server_script")) {
    server.push(p);
  }

  for (const block of extractBlocks(text, ["shared_scripts"])) {
    shared.push(...extractQuotedPaths(block));
  }
  for (const p of extractSingles(text, "shared_script")) {
    shared.push(p);
  }

  const dedupe = (arr) => {
    const seen = new Set();
    return arr.filter((p) => {
      const k = p.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };

  return {
    client: dedupe(client),
    server: dedupe(server),
    shared: dedupe(shared)
  };
}

/** Manifest list wins over folder heuristics when the path is listed. */
export function scriptSideFromManifest(relPath, manifestLists) {
  const n = String(relPath).replace(/\\/g, "/");
  const lower = n.toLowerCase();
  const inList = (list) =>
    list.some((p) => p.replace(/\\/g, "/").toLowerCase() === lower);

  if (manifestLists) {
    if (inList(manifestLists.client)) return "client";
    if (inList(manifestLists.server)) return "server";
    if (inList(manifestLists.shared)) return "shared";
  }
  return null;
}
