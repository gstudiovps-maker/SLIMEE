const SLIMEE_INTERNAL = new Set([
  "slimee_license.lua",
  "slimee_loader.lua",
  "slimee_client.lua",
  "fxmanifest.lua",
  "__resource.lua"
]);

function norm(relPath) {
  return String(relPath || "").replace(/\\/g, "/").toLowerCase();
}

export function isSlimeeRuntimeFile(relPath) {
  const base = norm(relPath).split("/").pop();
  return SLIMEE_INTERNAL.has(base);
}

export function isServerLuaPath(relPath) {
  const n = norm(relPath);
  const base = n.split("/").pop();
  if (SLIMEE_INTERNAL.has(base)) {
    return false;
  }
  if (isClientLuaPath(relPath)) {
    return false;
  }
  if (n.startsWith("shared/") || n.includes("/shared/")) {
    return false;
  }
  return n.endsWith(".lua");
}

export function isClientLuaPath(relPath) {
  const n = norm(relPath);
  const base = n.split("/").pop();
  if (SLIMEE_INTERNAL.has(base)) {
    return false;
  }
  if (n.startsWith("server/") || n.startsWith("server_")) {
    return false;
  }
  if (/\/server\//.test(n)) {
    return false;
  }
  if (base === "server.lua") {
    return false;
  }
  if (n.startsWith("shared/") || n.includes("/shared/")) {
    return false;
  }
  if (n.startsWith("client/") || n.startsWith("client_")) {
    return true;
  }
  if (/\/client\//.test(n)) {
    return true;
  }
  if (base === "client.lua" || n.endsWith("/client.lua")) {
    return true;
  }
  return false;
}
