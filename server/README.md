# Slimee Store API (Render)

Core flow: **Buy → Webhook → License → Validate → Download**

| Step | Endpoint |
|------|----------|
| Buy | `POST /api/checkout` with **`{ "packageIds": ["id-a","id-b"] }`** (cart) or **`{ "packageId": "single-id" }`** → Stripe Checkout URL |
| Webhook | `POST /api/webhooks/stripe` (Stripe → creates license in PostgreSQL) |
| License (success page) | `GET /api/orders/session/:sessionId` |
| Validate (FiveM) | `POST /api/licenses/validate` `{ "licenseKey", "packageId" }` |
| Download | `POST /api/downloads/request` → short-lived `GET /api/downloads/file/:token` |

## Setup

### 1. PostgreSQL

Create a database on Render (or local). Run migration:

```bash
cd server
# Local secrets (not on GitHub):
#   copy ../dont add/server.env.example → ../dont add/server.env
npm install
npm run db:migrate
```

**Existing deployments:** if Postgres was created before multi-package carts, run **`sql/migrate_multi_license_cart.sql`** once (allows several licenses per Stripe checkout session).

### 2. Stripe

1. [Stripe Dashboard](https://dashboard.stripe.com) → Developers → API keys → copy **Secret key**.
2. Developers → Webhooks → Add endpoint:
   - URL: `https://YOUR-API.onrender.com/api/webhooks/stripe`
   - Event: `checkout.session.completed`
   - Copy **Signing secret** → `STRIPE_WEBHOOK_SECRET`
3. For local webhooks use [Stripe CLI](https://stripe.com/docs/stripe-cli):
   ```bash
   stripe listen --forward-to localhost:3001/api/webhooks/stripe
   ```

### 3. Environment (`dont add/server.env` locally, Render env in production)

| Variable | Example |
|----------|---------|
| `DATABASE_URL` | Render Postgres connection string |
| `STRIPE_SECRET_KEY` | `sk_test_...` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` |
| `FRONTEND_URL` | `https://user.github.io/repo` or `http://127.0.0.1:5500` |
| `API_PUBLIC_URL` | `https://your-api.onrender.com` |
| `CORS_ORIGINS` | Same as frontend URL (comma-separated if multiple) |

### 4. Package files

Put sellable zips in **`dont add/downloads/`** (gitignored) named **`{packageId}.zip`**:

```
dont add/downloads/advanced-job-system.zip
```

Catalog prices come from `content/packages.json` at repo root.

### 5. Frontend

In `assets/js/config.js`:

```js
window.STORE_CONFIG = {
  apiBaseUrl: "https://your-api.onrender.com"
};
```

The shop loads packages from `GET /api/packages` when `apiBaseUrl` is set (PostgreSQL).  
`content/packages.json` is only used as a fallback until the DB is seeded.

### 6. Admin panel (Render-secured)

**URL:** `https://your-domain.com/admin/` (not linked from the public store).

1. Run migrations (includes `migrate_admin_packages.sql`):
   ```bash
   npm run db:migrate
   npm run db:seed
   ```
2. Generate password hashes locally (never commit passwords):
   ```bash
   npm run hash-password -- YourStrongPassword
   ```
3. In **Render → Environment**, set:
   - `JWT_SECRET` (long random string)
   - `MAIN_ADMIN_USERNAME` + `MAIN_ADMIN_PASSWORD_HASH` (you — **main** role, sees activity logs)
   - `ADMIN2_USERNAME` + `ADMIN2_PASSWORD_HASH` (and `ADMIN3_`, `ADMIN4_` for two more admins)
4. Redeploy. On startup the API seeds admins from env and imports packages from JSON if the DB catalog is empty.

| Endpoint | Who |
|----------|-----|
| `POST /api/admin/login` | Public (rate-limited) |
| `GET/POST/PUT/DELETE /api/admin/packages` | Any admin (Bearer token) |
| `GET /api/admin/logs` | **Main admin only** |

Credentials and `JWT_SECRET` stay on Render only — nothing sensitive is stored in the GitHub frontend.

### Admin login troubleshooting (Render Logs)

After deploy, open **Render → your API service → Logs** and filter for `[admin-auth]`.

| Log reason | Fix |
|------------|-----|
| `startup_no_admin_users` / `user_not_found` + count 0 | Set `JWT_SECRET`, `MAIN_ADMIN_USERNAME`, `MAIN_ADMIN_PASSWORD_HASH`, redeploy |
| `startup_main_admin_hash_invalid` / `wrapped_in_quotes` | Remove `"` quotes around the hash in Render env |
| `bad_password` | Re-run `npm run hash-password` and update `MAIN_ADMIN_PASSWORD_HASH` |
| `jwt_secret_missing` | Add `JWT_SECRET` on Render |
| `[cors] blocked origin=...` | Add your GitHub Pages URL to `CORS_ORIGINS` |

Quick check in browser: `https://YOUR-API.onrender.com/api/admin/setup-status`

### 7. Deploy on Render

- **New Web Service** → connect repo → **Root directory:** `server`
- **Build:** `npm install`
- **Start:** `npm start`
- Add env vars from `.env.example`
- Attach **PostgreSQL** and set `DATABASE_URL`

## FiveM validation

See `examples/fivem-license-validate/` — call validate from **server-side** Lua only (never ship your API secrets in client scripts).

## Not included (by design)

- HWID / hardware binding  
- Custom launcher  
- Encryption / R2 (use local `downloads/` for now; add R2 presigned URLs later)  
