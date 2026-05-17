-- Download tokens (PostgreSQL — survives restarts, multi-instance safe)

CREATE TABLE IF NOT EXISTS download_tokens (
  id SERIAL PRIMARY KEY,
  license_id INTEGER NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
  package_id VARCHAR(128),
  storage_key VARCHAR(255),
  token VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE download_tokens ADD COLUMN IF NOT EXISTS package_id VARCHAR(128);
ALTER TABLE download_tokens ADD COLUMN IF NOT EXISTS storage_key VARCHAR(255);
ALTER TABLE download_tokens ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_download_tokens_token ON download_tokens (token);
CREATE INDEX IF NOT EXISTS idx_download_tokens_expires ON download_tokens (expires_at);
CREATE INDEX IF NOT EXISTS idx_download_tokens_package ON download_tokens (package_id);
