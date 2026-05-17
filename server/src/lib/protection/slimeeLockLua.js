import { config } from "../../config.js";

/**
 * FiveM server-side IP lock (replaces CFX Keymaster for Slimee deliveries).
 * Must be first server_script — sets SlimeeLock.ok after API validates server IP.
 */
export function buildSlimeeInitLua(meta) {
  const apiBase = (config.apiPublicUrl || "").replace(/\/+$/, "");
  const packageId = String(meta.packageId || "").replace(/"/g, '\\"');
  const preLockedIp = meta.boundServerIp
    ? String(meta.boundServerIp).replace(/"/g, '\\"')
    : "";

  return `-- Slimee IP Lock (server-side) — do not remove
SlimeeLock = SlimeeLock or { ok = false, packageId = "${packageId}" }

local API_BASE = GetConvar("slimee_api", "${apiBase}")
local PACKAGE_ID = GetConvar("slimee_package_id", "${packageId}")
local LICENSE_KEY = GetConvar("slimee_license_key", "")
local SERVER_IP = GetConvar("slimee_server_ip", "${preLockedIp}")
local FIVEM_LICENSE = GetConvar("slimee_fivem_license", "")

local function stopWithReason(msg)
  print(("^1[Slimee IP Lock] %s^0"):format(msg))
  StopResource(GetCurrentResourceName())
end

if LICENSE_KEY == "" then
  return stopWithReason("Add to server.cfg: setr slimee_license_key \\"YOUR-KEY\\"")
end

if API_BASE == "" then
  return stopWithReason("Add to server.cfg: setr slimee_api \\"https://your-api.onrender.com\\"")
end

local function validateNow()
  local url = ("%s/api/licenses/validate"):format(API_BASE:gsub("/+$", ""))
  local body = json.encode({
    licenseKey = LICENSE_KEY,
    packageId = PACKAGE_ID,
    resourceName = GetCurrentResourceName(),
    serverIp = SERVER_IP,
    fivemLicenseId = FIVEM_LICENSE ~= "" and FIVEM_LICENSE or nil
  })

  local done, httpStatus, responseBody = false, 0, ""
  PerformHttpRequest(url, function(status, body)
    httpStatus = status
    responseBody = body or ""
    done = true
  end, "POST", body, { ["Content-Type"] = "application/json" })

  local deadline = GetGameTimer() + 30000
  while not done do
    Wait(50)
    if GetGameTimer() > deadline then
      return false, "API timeout (30s)"
    end
  end

  if httpStatus ~= 200 then
    return false, ("API HTTP %s"):format(tostring(httpStatus))
  end

  local data = json.decode(responseBody)
  if not data or not data.valid then
    return false, ("License rejected: %s"):format(data and data.reason or "unknown")
  end

  return true, data.reason or "ok"
end

CreateThread(function()
  print("^3[Slimee IP Lock] Validating license and server IP...^0")
  local ok, reason = validateNow()
  if not ok then
    return stopWithReason(reason)
  end
  SlimeeLock.ok = true
  print(("^2[Slimee IP Lock] Active (%s). Scripts unlocked.^0"):format(reason))
end)

function SlimeeLock.WaitReady()
  local deadline = GetGameTimer() + 35000
  while not SlimeeLock.ok do
    Wait(50)
    if GetGameTimer() > deadline then
      error("[Slimee IP Lock] Timed out waiting for license validation", 0)
    end
  end
end
`;
}

export function buildSlimeeGuardPrefix() {
  return `if SlimeeLock and SlimeeLock.WaitReady then SlimeeLock.WaitReady() end\n\n`;
}

export function buildSlimeeServerCfgSnippet(meta) {
  const apiBase = (config.apiPublicUrl || "").replace(/\/+$/, "");
  return [
    "# Slimee IP Lock — add to server.cfg",
    `setr slimee_api "${apiBase}"`,
    `setr slimee_package_id "${meta.packageId}"`,
    'setr slimee_license_key "PASTE-YOUR-LICENSE-KEY"',
    '# Optional (auto-detected on first start if empty):',
    '# setr slimee_server_ip "1.2.3.4"',
    ""
  ].join("\n");
}
