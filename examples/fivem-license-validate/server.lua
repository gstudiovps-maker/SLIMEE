-- Slimee IP Lock — included automatically in protected downloads as slimee_protect/init.lua
-- This example matches what customers receive.

local API_BASE = GetConvar('slimee_api', '')
local PACKAGE_ID = GetConvar('slimee_package_id', '')
local LICENSE_KEY = GetConvar('slimee_license_key', '')
local SERVER_IP = GetConvar('slimee_server_ip', '')
local FIVEM_LICENSE = GetConvar('slimee_fivem_license', '')

local function stopWithReason(msg)
  print(('^1[Slimee IP Lock] %s^0'):format(msg))
  StopResource(GetCurrentResourceName())
end

if LICENSE_KEY == '' then
  return stopWithReason('Add to server.cfg: setr slimee_license_key "YOUR-KEY"')
end

if API_BASE == '' then
  return stopWithReason('Add to server.cfg: setr slimee_api "https://your-api.onrender.com"')
end

CreateThread(function()
  print('^3[Slimee IP Lock] Validating license and server IP...^0')
  local url = ('%s/api/licenses/validate'):format(API_BASE:gsub('/+$', ''))
  local body = json.encode({
    licenseKey = LICENSE_KEY,
    packageId = PACKAGE_ID,
    resourceName = GetCurrentResourceName(),
    serverIp = SERVER_IP,
    fivemLicenseId = FIVEM_LICENSE ~= '' and FIVEM_LICENSE or nil
  })

  local done, httpStatus, responseBody = false, 0, ''
  PerformHttpRequest(url, function(status, response)
    httpStatus = status
    responseBody = response or ''
    done = true
  end, 'POST', body, { ['Content-Type'] = 'application/json' })

  local deadline = GetGameTimer() + 30000
  while not done do
    Wait(50)
    if GetGameTimer() > deadline then
      return stopWithReason('API timeout (30s)')
    end
  end

  if httpStatus ~= 200 then
    return stopWithReason(('API HTTP %s'):format(tostring(httpStatus)))
  end

  local data = json.decode(responseBody)
  if not data or not data.valid then
    return stopWithReason(('License rejected: %s'):format(data and data.reason or 'unknown'))
  end

  print(('^2[Slimee IP Lock] Active (%s).^0'):format(data.reason or 'ok'))
end)
