/**
 * Server loader — no decrypt keys in slimee_license.lua.
 * Decrypts via Slimee API (ChaCha20 SLME vault blobs).
 */
export function buildSlimeeLoaderLua(fileManifest) {
  const listJson = JSON.stringify(fileManifest).replace(/\\/g, "\\\\").replace(/'/g, "\\'");

  return `-- Slimee loader (server)
local FILES = json.decode('${listJson}')

local b64chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
local function b64encode(data)
  return ((data:gsub(".", function(x)
    local r, b = "", x:byte()
    for i = 8, 1, -1 do r = r .. (b % 2^i - b % 2^(i-1) > 0 and "1" or "0") end
    return r
  end) .. "0000"):gsub("%d%d%d?%d?%d?%d?", function(x)
    if #x < 6 then return "" end
    local c = 0
    for i = 1, 6 do c = c + (x:sub(i,i) == "1" and 2^(6-i) or 0) end
    return b64chars:sub(c+1,c+1)
  end) .. ({ "", "==", "=" })[#data % 3 + 1])
end

local function stop(msg)
  print(("^1[slimee_loader] %s^0"):format(msg))
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

local function unlockScript(entry)
  local raw = LoadResourceFile(GetCurrentResourceName(), entry.vault)
  if not raw or #raw < 1 then
    return nil, "vault read failed"
  end
  local done, result = false, nil
  httpJson("POST", "/api/licenses/unlock-script", {
    licenseKey = SLIMEE.LICENSE_KEY,
    packageId = SLIMEE.PACKAGE_ID,
    buildId = SLIMEE.BUILD_ID,
    resourceName = GetCurrentResourceName(),
    vaultPath = entry.vault,
    luaPath = entry.lua,
    blobB64 = b64encode(raw)
  }, function(status, data)
    result = { status = status, data = data }
    done = true
  end)
  local deadline = GetGameTimer() + 60000
  while not done do
    Wait(50)
    if GetGameTimer() > deadline then
      return nil, "unlock timeout"
    end
  end
  if result.status ~= 200 or not result.data or not result.data.source then
    return nil, result.data and (result.data.error or result.data.reason) or "unlock failed"
  end
  return result.data.source, nil
end

local function runEntry(entry)
  if SlimeeLock and SlimeeLock.WaitReady then
    SlimeeLock.WaitReady()
  end
  local src, err = unlockScript(entry)
  if not src then
    error(("[slimee] %s: %s"):format(entry.lua, err), 2)
  end
  local fn, loadErr = load(src, ("@%s"):format(entry.lua), "t")
  if not fn then
    error(("[slimee] load %s: %s"):format(entry.lua, loadErr), 2)
  end
  return fn()
end

function SlimeeLoad(luaPath)
  for _, entry in ipairs(FILES) do
    if entry.lua == luaPath then
      return runEntry(entry)
    end
  end
  error(("[slimee] unknown %s"):format(luaPath), 2)
end
`;
}

export function buildLuaStub(luaPath) {
  const safe = luaPath.replace(/\\/g, "/").replace(/"/g, '\\"');
  return `-- Slimee protected — executed via slimee_loader.lua
if SlimeeLoad then return SlimeeLoad("${safe}") end
error("[slimee] start resource with slimee_license + slimee_loader first", 0)
`;
}
