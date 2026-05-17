/**
 * Patch fxmanifest so slimee_license + slimee_loader run first, then protected server .lua stubs.
 */
export function patchFxManifestContent(content, options = {}) {
  const protectedScripts = options.protectedServerScripts || [];
  let text = String(content).replace(/^\uFEFF/, "");

  const slimeeScripts = ["slimee_license.lua", "slimee_loader.lua"];
  for (const script of slimeeScripts) {
    text = ensureServerScriptListed(text, script, true);
  }

  for (const script of protectedScripts) {
    text = ensureServerScriptListed(text, script, false);
  }

  return text.trim() + "\n";
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isScriptListed(text, script) {
  const e = escapeRe(script);
  return new RegExp(`['"]${e}['"]`).test(text);
}

function ensureServerScriptListed(text, script, prepend) {
  if (isScriptListed(text, script)) {
    if (!prepend) {
      return text;
    }
    return moveScriptFirst(text, script);
  }

  if (/server_scripts\s*\{/.test(text)) {
    if (prepend) {
      return text.replace(/server_scripts\s*\{/, (m) => `${m}\n  '${script}',`);
    }
    return text.replace(/server_scripts\s*\{([^}]*)\}/, (m, inner) => {
      if (inner.trim().endsWith(",")) {
        return `server_scripts {${inner}\n  '${script}',\n}`;
      }
      return `server_scripts {${inner}\n  '${script}'\n}`;
    });
  }

  if (/server_script\s+['"]/.test(text)) {
    if (prepend) {
      return text.replace(/(server_script\s+['"][^'"]+['"])/, `server_script '${script}'\n$1`);
    }
    return `${text.trim()}\nserver_script '${script}'\n`;
  }

  const header = /fx_version/i.test(text) ? "" : "fx_version 'cerulean'\ngame 'gta5'\n\n";
  return `${header}${text.trim()}\nserver_script '${script}'\n`;
}

function moveScriptFirst(text, script) {
  const e = escapeRe(script);
  const lineRe = new RegExp(`\\s*['"]${e}['"]\\s*,?\\n?`, "g");
  let cleaned = text.replace(lineRe, "");
  return ensureServerScriptListed(cleaned, script, true);
}
