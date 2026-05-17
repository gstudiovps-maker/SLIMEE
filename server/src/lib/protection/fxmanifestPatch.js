const MANIFEST_NAMES = ["fxmanifest.lua", "__resource.lua"];

export function findManifestEntry(entries) {
  for (const name of MANIFEST_NAMES) {
    const hit = entries.find((e) => !e.isDirectory && e.entryName.replace(/\\/g, "/").toLowerCase().endsWith(name));
    if (hit) return hit.entryName.replace(/\\/g, "/");
  }
  return null;
}

/**
 * Insert slimee_protect/init.lua as the first server_script.
 */
export function patchFxManifestContent(content, resourceName) {
  const initPath = "slimee_protect/init.lua";
  let text = String(content).replace(/^\uFEFF/, "");

  if (text.includes("slimee_protect/init.lua")) {
    return text;
  }

  const scriptLine = `server_script '${initPath}'`;

  if (/server_script\s+['"]@?slimee_protect\/init\.lua['"]/i.test(text)) {
    return text;
  }

  if (/server_scripts\s*\{/.test(text)) {
    return text.replace(/server_scripts\s*\{/, (match) => `${match}\n  '${initPath}',`);
  }

  if (/server_script\s+['"]/.test(text)) {
    return text.replace(/(server_script\s+['"][^'"]+['"])/, `${scriptLine}\n$1`);
  }

  const header = `fx_version 'cerulean'\ngame 'gta5'\n\n`;
  const hasFxVersion = /fx_version/i.test(text);
  const body = hasFxVersion ? text : `${header}${text}`;

  return `${body.trim()}\n\n${scriptLine}\n`;
}
