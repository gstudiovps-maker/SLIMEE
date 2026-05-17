export function buildSlimeeLoaderLua(encryptedFiles) {
  const manifestJson = JSON.stringify(encryptedFiles).replace(/\\/g, "\\\\").replace(/'/g, "\\'");

  return `-- Slimee .slimeefxap loader (runs after slimee_license.lua)
local FILES = json.decode('${manifestJson}')

local function hexToKey(hex)
  hex = hex:gsub("%s+", ""):lower()
  if #hex ~= 64 then
    error("invalid decrypt key", 2)
  end
  local key = {}
  for i = 1, 64, 2 do
    key[#key + 1] = string.char(tonumber(hex:sub(i, i + 1), 16))
  end
  return table.concat(key)
end

local function xorDecrypt(data, key)
  local out = {}
  for i = 1, #data do
    local ki = ((i - 1) % 32) + 1
    out[i] = string.char(string.byte(data, i) ~ string.byte(key, ki))
  end
  return table.concat(out)
end

local function readSlimeefxap(relPath)
  local raw = LoadResourceFile(GetCurrentResourceName(), relPath)
  if not raw or #raw < 37 then
    return nil, "missing .slimeefxap"
  end
  if raw:sub(1, 4) ~= "SLFX" then
    return nil, "invalid header"
  end
  local enc = raw:sub(6, #raw - 32)
  local key = hexToKey(SLIMEE.DECRYPT_KEY_HEX)
  return xorDecrypt(enc, key)
end

local function runEncrypted(entry)
  if SlimeeLock and SlimeeLock.WaitReady then
    SlimeeLock.WaitReady()
  end
  local src, err = readSlimeefxap(entry.path)
  if not src then
    error(("[slimee] %s: %s"):format(entry.path, err), 2)
  end
  local chunk = ("@%s"):format(entry.path:gsub("%.slimeefxap$", ".lua"))
  local fn, loadErr = load(src, chunk, "t")
  if not fn then
    error(("[slimee] load %s: %s"):format(entry.path, loadErr), 2)
  end
  return fn()
end

CreateThread(function()
  if SlimeeLock and SlimeeLock.WaitReady then
    SlimeeLock.WaitReady()
  end
  for _, entry in ipairs(FILES) do
    runEncrypted(entry)
  end
end)
`;
}
