# FiveM license validation (example)

Call your Render API from a **server** script only.

1. Set `SLIMEE_API` in `server.cfg`:
   ```
   set slimee_api "https://your-api.onrender.com"
   set slimee_package_id "advanced-job-system"
   ```

2. Add `ensure slimee_license` after copying this folder into your resource.

3. Set the license in `server.cfg` (or load from convar / database):
   ```
   set slimee_license_key "SLIMEE-XXXX-XXXX-XXXX"
   ```

On start, the resource POSTs to `/api/licenses/validate`. If invalid, the resource stops.
