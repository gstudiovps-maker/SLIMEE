import { minimatch } from "minimatch";

export const DEFAULT_ESCROW_IGNORE = [
  "fxmanifest.lua",
  "**/fxmanifest.lua",
  "config/**",
  "config/*.lua",
  "shared/**",
  "shared/utils/**",
  "bridge/client/**",
  "bridge/server/**",
  "client/modules/**",
  "server/modules/**"
];

export const PROTECTION_MODES = ["open", "partial", "full"];

export function normalizeProtectionMode(mode) {
  const m = String(mode || "partial").toLowerCase();
  if (m === "open" || m === "open_source" || m === "opensource") {
    return "open";
  }
  if (m === "full" || m === "fully_protected" || m === "protected") {
    return "full";
  }
  return "partial";
}

export function normalizeEscrowIgnore(patterns) {
  const list = Array.isArray(patterns) ? patterns : [];
  const merged = [...DEFAULT_ESCROW_IGNORE, ...list.map((p) => String(p).trim()).filter(Boolean)];
  return [...new Set(merged)];
}

export function isEscrowIgnored(entryName, patterns) {
  const normalized = entryName.replace(/\\/g, "/").replace(/^\.\//, "");
  return patterns.some((pattern) => minimatch(normalized, pattern, { dot: true, nocase: true }));
}

export function isLuaFile(entryName) {
  return /\.lua$/i.test(entryName);
}

export function isManifestFile(entryName) {
  const n = entryName.replace(/\\/g, "/").toLowerCase();
  return n.endsWith("fxmanifest.lua") || n.endsWith("__resource.lua");
}
