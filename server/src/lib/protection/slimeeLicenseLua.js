import { config } from "../../config.js";

/**
 * Server-only license activation — no decrypt keys in this file.
 */
export function buildSlimeeLicenseLua(meta) {
  const api = (config.apiPublicUrl || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const licenseKey = String(meta.licenseKey || "").replace(/"/g, '\\"');
  const packageId = String(meta.packageId || "").replace(/"/g, '\\"');
  const buildId = String(meta.buildId || "").replace(/"/g, '\\"');

  return `-- Slimee license (server) — unique copy, do not share
SLIMEE = {
  API = "${api}",
  LICENSE_KEY = "${licenseKey}",
  PACKAGE_ID = "${packageId}",
  BUILD_ID = "${buildId}",
  LOCKED_IP = "",
  READY = false
}

SlimeeLock = SlimeeLock or { ok = false }

local function stop(msg)
  print(("^1[slimee_license] %s^0"):format(msg))
  StopResource(GetCurrentResourceName())
end

local function httpJson(method, path, body, cb)
  local url = ("%s%s"):format(SLIMEE.API:gsub("/+$", ""), path)
  PerformHttpRequest(url, function(status, response)
    local data = {}
    if response and response ~= "" then
      data = json.decode(response) or {}
    end
    cb(status, data)
  end, method, body and json.encode(body) or "", { ["Content-Type"] = "application/json" })
end

local function activateLicense()
  print("^3[slimee_license] Locking to this server's IP...^0")
  local done, result = false, nil
  httpJson("POST", "/api/licenses/activate", {
    licenseKey = SLIMEE.LICENSE_KEY,
    packageId = SLIMEE.PACKAGE_ID,
    resourceName = GetCurrentResourceName(),
    buildId = SLIMEE.BUILD_ID
  }, function(status, data)
    result = { status = status, data = data }
    done = true
  end)

  local deadline = GetGameTimer() + 45000
  while not done do
    Wait(50)
    if GetGameTimer() > deadline then
      return false, "activation timeout"
    end
  end

  if result.status ~= 200 or not result.data or not result.data.valid then
    local reason = result.data and (result.data.reason or result.data.error) or ("HTTP " .. tostring(result.status))
    return false, reason
  end

  SLIMEE.LOCKED_IP = result.data.boundServerIp or result.data.serverIp or ""
  SLIMEE.READY = true
  SlimeeLock.ok = true
  print(("^2[slimee_license] OK package=%s locked IP=%s^0"):format(SLIMEE.PACKAGE_ID, SLIMEE.LOCKED_IP))
  return true
end

CreateThread(function()
  if SLIMEE.LICENSE_KEY == "" or SLIMEE.PACKAGE_ID == "" then
    return stop("Invalid build — re-download from Slimee Store.")
  end
  local ok, err = activateLicense()
  if not ok then
    return stop(("License failed: %s"):format(tostring(err)))
  end
end)

function SlimeeLock.WaitReady()
  local deadline = GetGameTimer() + 50000
  while not SLIMEE.READY do
    Wait(50)
    if GetGameTimer() > deadline then
      error("[slimee_license] timed out", 0)
    end
  end
end
`;
}
