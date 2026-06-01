export const SLIMEE_VAULT_DIR = "slimee_vault";

/** Slimee runtime (license / loader / client bootstrap) — kept inside the vault folder. */
export const SLIMEE_RUNTIME_PATHS = {
  license: `${SLIMEE_VAULT_DIR}/slimee_license.lua`,
  loader: `${SLIMEE_VAULT_DIR}/slimee_loader.lua`,
  client: `${SLIMEE_VAULT_DIR}/slimee_client.lua`
};

/** Map original lua path → vault path inside resource (same folder tree). */
export function vaultPathForLua(luaPath) {
  const normalized = String(luaPath).replace(/\\/g, "/").replace(/^\/+/, "");
  return `${SLIMEE_VAULT_DIR}/${normalized}`;
}

export function vaultRuntimePath(filename) {
  const base = String(filename || "").replace(/\\/g, "/").replace(/^\/+/, "");
  return `${SLIMEE_VAULT_DIR}/${base}`;
}
