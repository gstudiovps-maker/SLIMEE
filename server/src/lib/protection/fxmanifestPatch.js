/**
 * Keep client/server layout; server uses slimee_license + slimee_loader first.
 * Encrypted server scripts remain as .lua stubs in server_scripts (original order).
 */
export function patchFxManifestContent(content) {
  let text = String(content).replace(/^\uFEFF/, "");

  const slimeeScripts = ["slimee_license.lua", "slimee_loader.lua"];

  for (const script of slimeeScripts) {
    if (text.includes(`'${script}'`) || text.includes(`"${script}"`)) {
      continue;
    }
    if (/server_scripts\s*\{/.test(text)) {
      text = text.replace(/server_scripts\s*\{/, (m) => `${m}\n  '${script}',`);
    } else if (/server_script\s+['"]/.test(text)) {
      text = text.replace(/(server_script\s+['"][^'"]+['"])/, `server_script '${script}'\n$1`);
    } else {
      const header = /fx_version/i.test(text) ? "" : "fx_version 'cerulean'\ngame 'gta5'\n\n";
      text = `${header}${text.trim()}\nserver_script '${script}'\n`;
    }
  }

  return text.trim() + "\n";
}
