/**
 * Client bootstrap — waits for server-decrypted scripts (no API calls on client).
 * Preserves fxmanifest load order via synchronous stubs (no CreateThread).
 */
export function buildSlimeeClientLua(buildId, clientOrder = []) {
  const token = String(buildId || "x")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 12);
  const evtScript = `slimee_cs_${token}`;
  const evtReady = `slimee_cr_${token}`;
  const evtRequest = `slimee_cq_${token}`;
  const expectedJson = JSON.stringify(clientOrder).replace(/\\/g, "\\\\").replace(/'/g, "\\'");

  return `-- Slimee client loader
local EVT_SCRIPT = "${evtScript}"
local EVT_READY = "${evtReady}"
local EVT_REQUEST = "${evtRequest}"
local EXPECTED = json.decode('${expectedJson}')

SlimeeClientCache = SlimeeClientCache or {}
SlimeeClientReady = false

local function normPath(p)
  return (p or ""):gsub("\\\\", "/")
end

local function allCached()
  if #EXPECTED < 1 then return true end
  for _, p in ipairs(EXPECTED) do
    if not SlimeeClientCache[normPath(p)] then
      return false
    end
  end
  return true
end

local function trySetReady()
  if allCached() then
    SlimeeClientReady = true
  end
end

RegisterNetEvent(EVT_SCRIPT, function(luaPath, source)
  if type(luaPath) ~= "string" or type(source) ~= "string" then return end
  SlimeeClientCache[normPath(luaPath)] = source
  trySetReady()
end)

RegisterNetEvent(EVT_READY, function()
  trySetReady()
end)

function SlimeeClientLoad(luaPath)
  local key = normPath(luaPath)
  local deadline = GetGameTimer() + 120000
  while not SlimeeClientCache[key] do
    Wait(0)
    if SlimeeClientReady and not SlimeeClientCache[key] then
      error(("[slimee] client script missing: %s"):format(luaPath), 0)
    end
    if GetGameTimer() > deadline then
      error(("[slimee] client load timeout: %s"):format(luaPath), 0)
    end
  end
  local fn, err = load(SlimeeClientCache[key], ("@%s"):format(luaPath), "t")
  if not fn then
    error(("[slimee] client compile %s: %s"):format(luaPath, err), 0)
  end
  return fn()
end

CreateThread(function()
  Wait(500)
  TriggerServerEvent(EVT_REQUEST)
end)
`;
}

export function buildClientLuaStub(luaPath) {
  const safe = luaPath.replace(/\\/g, "/").replace(/"/g, '\\"');
  return `-- Slimee protected (client)
while not SlimeeClientLoad do
  Wait(0)
end
return SlimeeClientLoad("${safe}")
`;
}

/** Shared scripts run on server and client — load after Slimee loaders are defined. */
export function buildSharedLuaStub(luaPath) {
  const safe = luaPath.replace(/\\/g, "/").replace(/"/g, '\\"');
  return `-- Slimee protected (shared)
if IsDuplicityVersion() then
  while not SlimeeLoad do Wait(0) end
  return SlimeeLoad("${safe}")
else
  while not SlimeeClientLoad do Wait(0) end
  return SlimeeClientLoad("${safe}")
end
`;
}
