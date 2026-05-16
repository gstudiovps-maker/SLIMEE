CREATE TABLE IF NOT EXISTS licenses (
  id SERIAL PRIMARY KEY,
  license_key VARCHAR(64) NOT NULL UNIQUE,
  package_id VARCHAR(128) NOT NULL,
  customer_email VARCHAR(255),
  stripe_session_id VARCHAR(255),
  stripe_payment_intent VARCHAR(255),
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT licenses_session_package_unique UNIQUE (stripe_session_id, package_id)
);

CREATE INDEX IF NOT EXISTS idx_licenses_key ON licenses (license_key);
CREATE INDEX IF NOT EXISTS idx_licenses_package ON licenses (package_id);
CREATE INDEX IF NOT EXISTS idx_licenses_email ON licenses (customer_email);
CREATE INDEX IF NOT EXISTS idx_licenses_session ON licenses (stripe_session_id);

CREATE TABLE IF NOT EXISTS download_tokens (
  id SERIAL PRIMARY KEY,
  license_id INTEGER NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
  token VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_download_tokens_token ON download_tokens (token);
