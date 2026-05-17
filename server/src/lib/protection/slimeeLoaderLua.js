/**
 * Server loader — decrypts server + client vault via API; pushes client scripts over net events.
 */
export function buildSlimeeLoaderLua(serverManifest, clientManifest, buildId) {
  const serverJson = JSON.stringify(serverManifest).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const clientJson = JSON.stringify(clientManifest).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const token = String(buildId || "x")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 12);
  const evtScript = `slimee_cs_${token}`;
  const evtReady = `slimee_cr_${token}`;
  const evtRequest = `slimee_cq_${token}`;

  return `-- Slimee loader (server)
local SERVER_FILES = json.decode('${serverJson}')
local CLIENT_FILES = json.decode('${clientJson}')
local EVT_SCRIPT = "${evtScript}"
local EVT_READY = "${evtReady}"
local EVT_REQUEST = "${evtRequest}"
local ClientCache = {}

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

local function runServerEntry(entry)
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
  for _, entry in ipairs(SERVER_FILES) do
    if entry.lua == luaPath then
      return runServerEntry(entry)
    end
  end
  error(("[slimee] unknown server script %s"):format(luaPath), 2)
end

local function pushClientScripts(target)
  for luaPath, source in pairs(ClientCache) do
    TriggerClientEvent(EVT_SCRIPT, target, luaPath, source)
  end
  TriggerClientEvent(EVT_READY, target)
end

local function unlockAllClient()
  if SlimeeLock and SlimeeLock.WaitReady then
    SlimeeLock.WaitReady()
  end
  for _, entry in ipairs(CLIENT_FILES) do
    local src, err = unlockScript(entry)
    if not src then
      return false, ("%s: %s"):format(entry.lua, err)
    end
    ClientCache[entry.lua] = src
  end
  return true
end

CreateThread(function()
  if #CLIENT_FILES < 1 then
    return
  end
  local ok, err = unlockAllClient()
  if not ok then
    return stop(("Client unlock failed: %s"):format(err))
  end
  pushClientScripts(-1)
  print(("^2[slimee_loader] %d client script(s) ready^0"):format(#CLIENT_FILES))
end)

RegisterNetEvent(EVT_REQUEST, function()
  local playerId = source
  if not playerId or #CLIENT_FILES < 1 or next(ClientCache) == nil then return end
  pushClientScripts(playerId)
end)
`;
}

export function buildLuaStub(luaPath) {
  const safe = luaPath.replace(/\\/g, "/").replace(/"/g, '\\"');
  return `-- Slimee protected (server)
if SlimeeLoad then return SlimeeLoad("${safe}") end
error("[slimee] start slimee_license + slimee_loader first", 0)
`;
}
