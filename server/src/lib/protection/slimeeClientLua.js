/**
 * Client bootstrap — waits for server-decrypted scripts (no API calls on client).
 */
export function buildSlimeeClientLua(buildId) {
  const token = String(buildId || "x")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 12);
  const evtScript = `slimee_cs_${token}`;
  const evtReady = `slimee_cr_${token}`;
  const evtRequest = `slimee_cq_${token}`;

  return `-- Slimee client loader
local EVT_SCRIPT = "${evtScript}"
local EVT_READY = "${evtReady}"
local EVT_REQUEST = "${evtRequest}"

SlimeeClientCache = SlimeeClientCache or {}
SlimeeClientReady = false

RegisterNetEvent(EVT_SCRIPT, function(luaPath, source)
  if type(luaPath) ~= "string" or type(source) ~= "string" then return end
  SlimeeClientCache[luaPath] = source
end)

RegisterNetEvent(EVT_READY, function()
  SlimeeClientReady = true
end)

function SlimeeClientLoad(luaPath)
  local deadline = GetGameTimer() + 120000
  while not SlimeeClientCache[luaPath] do
    Wait(50)
    if SlimeeClientReady and not SlimeeClientCache[luaPath] then
      error(("[slimee] client script missing: %s"):format(luaPath), 0)
    end
    if GetGameTimer() > deadline then
      error(("[slimee] client load timeout: %s"):format(luaPath), 0)
    end
  end
  local fn, err = load(SlimeeClientCache[luaPath], ("@%s"):format(luaPath), "t")
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
CreateThread(function()
  while not SlimeeClientLoad do
    Wait(0)
  end
  return SlimeeClientLoad("${safe}")
end)
`;
}
