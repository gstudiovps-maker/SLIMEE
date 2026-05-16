export function assertValidStorageKey(storageKey) {
  const normalized = String(storageKey).replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("..")) {
    throw new Error("Invalid storage key");
  }
  return normalized;
}
