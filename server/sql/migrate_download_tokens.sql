-- Enrich download tokens for protected delivery (storage snapshot + package id)

ALTER TABLE download_tokens ADD COLUMN IF NOT EXISTS package_id VARCHAR(128);
ALTER TABLE download_tokens ADD COLUMN IF NOT EXISTS storage_key VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_download_tokens_expires ON download_tokens (expires_at);
CREATE INDEX IF NOT EXISTS idx_download_tokens_package ON download_tokens (package_id);
