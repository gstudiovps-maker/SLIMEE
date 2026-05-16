local API_BASE = GetConvar('slimee_api', '')
local PACKAGE_ID = GetConvar('slimee_package_id', '')
local LICENSE_KEY = GetConvar('slimee_license_key', '')
local SERVER_IP = GetConvar('slimee_server_ip', '')
local FIVEM_LICENSE = GetConvar('slimee_fivem_license', '')

local function stopWithReason(msg)
  print(('^1[slimee_license] %s^0'):format(msg))
  StopResource(GetCurrentResourceName())
end

CreateThread(function()
  if API_BASE == '' or PACKAGE_ID == '' or LICENSE_KEY == '' then
    stopWithReason('Set slimee_api, slimee_package_id, and slimee_license_key in server.cfg')
    return
  end

  local url = ('%s/api/licenses/validate'):format(API_BASE:gsub('/+$', ''))
  local body = json.encode({
    licenseKey = LICENSE_KEY,
    packageId = PACKAGE_ID,
    resourceName = GetCurrentResourceName(),
    serverIp = SERVER_IP,
    fivemLicenseId = FIVEM_LICENSE ~= '' and FIVEM_LICENSE or nil
  })

  PerformHttpRequest(url, function(status, response)
    if status ~= 200 then
      stopWithReason(('API HTTP %s'):format(tostring(status)))
      return
    end

    local data = json.decode(response or '')
    if not data or not data.valid then
      stopWithReason(('License invalid: %s'):format(data and data.reason or 'unknown'))
      return
    end

    print(('^2[slimee_license] License valid (%s).^0'):format(data.reason or 'ok'))
  end, 'POST', body, { ['Content-Type'] = 'application/json' })
end)
