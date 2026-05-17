const MANIFEST_NAMES = ["fxmanifest.lua", "__resource.lua"];

export function findManifestEntry(entries) {
  for (const name of MANIFEST_NAMES) {
    const hit = entries.find((e) => !e.isDirectory && e.entryName.replace(/\\/g, "/").toLowerCase().endsWith(name));
    if (hit) return hit.entryName.replace(/\\/g, "/");
  }
  return null;
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Remove server_script entries for files that were replaced by .slimeefxap + loader.
 */
function stripReplacedServerScripts(text, encryptedManifest) {
  let out = text;
  for (const entry of encryptedManifest) {
    const paths = [entry.original, entry.path];
    for (const p of paths) {
      const e = escapeRe(p);
      out = out.replace(new RegExp(`\\s*['"]${e}['"]\\s*,?`, "g"), "\n");
      out = out.replace(new RegExp(`,\\s*['"]${e}['"]`, "g"), "");
    }
  }
  return out.replace(/server_scripts\s*\{\s*,/g, "server_scripts {\n").replace(/,\s*\}/g, "\n}");
}

/**
 * Slimee: slimee_license.lua → loader.lua (decrypts all .slimeefxap)
 */
export function patchFxManifestContent(content, encryptedManifest = []) {
  let text = stripReplacedServerScripts(String(content).replace(/^\uFEFF/, ""), encryptedManifest);

  const slimeeScripts = ["slimee_license.lua", "slimee_protect/loader.lua"];

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
