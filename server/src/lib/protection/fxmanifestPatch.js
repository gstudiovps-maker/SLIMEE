import { SLIMEE_RUNTIME_PATHS } from "./vaultPath.js";

/**
 * Patch fxmanifest: slimee loaders in slimee_vault first, then protected stubs.
 */
export function patchFxManifestContent(content, options = {}) {
  const protectedServer = options.protectedServerScripts || [];
  const protectedClient = options.protectedClientScripts || [];
  const protectedShared = options.protectedSharedScripts || [];
  let text = String(content).replace(/^\uFEFF/, "");

  for (const script of protectedShared) {
    text = removeScriptFromBlock(text, "shared_scripts", script);
    text = removeScriptFromBlock(text, "shared_script", script);
  }

  for (const legacy of ["slimee_license.lua", "slimee_loader.lua", "slimee_client.lua"]) {
    text = removeScriptFromBlock(text, "server_scripts", legacy);
    text = removeScriptFromBlock(text, "client_scripts", legacy);
  }

  text = ensureServerScriptListed(text, SLIMEE_RUNTIME_PATHS.license, true);
  text = ensureServerScriptListed(text, SLIMEE_RUNTIME_PATHS.loader, true);

  for (const script of protectedServer) {
    text = ensureServerScriptListed(text, script, false);
  }

  if (options.includeClientLoader) {
    text = ensureClientScriptListed(text, SLIMEE_RUNTIME_PATHS.client, true);
  }

  for (const script of protectedClient) {
    text = ensureClientScriptListed(text, script, false);
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
    return prepend ? moveScriptFirst(text, script, "server") : text;
  }

  if (/server_scripts\s*\{/.test(text)) {
    if (prepend) {
      return text.replace(/server_scripts\s*\{/, (m) => `${m}\n  '${script}',`);
    }
    return text.replace(/server_scripts\s*\{([^}]*)\}/, (m, inner) => {
      const sep = inner.trim().length > 0 && !inner.trim().endsWith(",") ? "," : "";
      return `server_scripts {${inner}${sep}\n  '${script}',\n}`;
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

function ensureClientScriptListed(text, script, prepend) {
  if (isScriptListed(text, script)) {
    return prepend ? moveScriptFirst(text, script, "client") : text;
  }

  if (/client_scripts\s*\{/.test(text)) {
    if (prepend) {
      return text.replace(/client_scripts\s*\{/, (m) => `${m}\n  '${script}',`);
    }
    return text.replace(/client_scripts\s*\{([^}]*)\}/, (m, inner) => {
      const sep = inner.trim().length > 0 && !inner.trim().endsWith(",") ? "," : "";
      return `client_scripts {${inner}${sep}\n  '${script}',\n}`;
    });
  }

  if (/client_script\s+['"]/.test(text)) {
    if (prepend) {
      return text.replace(/(client_script\s+['"][^'"]+['"])/, `client_script '${script}'\n$1`);
    }
    return `${text.trim()}\nclient_script '${script}'\n`;
  }

  const header = /fx_version/i.test(text) ? "" : "fx_version 'cerulean'\ngame 'gta5'\n\n";
  return `${header}${text.trim()}\nclient_script '${script}'\n`;
}

function moveScriptFirst(text, script, side) {
  const e = escapeRe(script);
  const lineRe = new RegExp(`\\s*['"]${e}['"]\\s*,?\\n?`, "g");
  const cleaned = text.replace(lineRe, "");
  if (side === "client") {
    return ensureClientScriptListed(cleaned, script, true);
  }
  return ensureServerScriptListed(cleaned, script, true);
}

function removeScriptFromBlock(text, blockName, script) {
  const e = escapeRe(script);
  const lineRe = new RegExp(`\\s*['"]${e}['"]\\s*,?\\n?`, "gi");
  const blockRe = new RegExp(`${blockName}\\s*\\{([^}]*)\\}`, "gis");
  return text.replace(blockRe, (m, inner) => `${blockName} {${inner.replace(lineRe, "")}}`);
}
