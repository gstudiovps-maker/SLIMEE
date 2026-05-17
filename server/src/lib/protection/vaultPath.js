/** Map original lua path → vault path inside resource (same folder tree). */
export function vaultPathForLua(luaPath) {
  const normalized = String(luaPath).replace(/\\/g, "/").replace(/^\/+/, "");
  return `slimee_vault/${normalized}`;
}
