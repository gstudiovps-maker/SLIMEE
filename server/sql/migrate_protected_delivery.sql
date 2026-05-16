-- Protected Package Delivery + license binding

ALTER TABLE licenses ADD COLUMN IF NOT EXISTS bound_server_ip VARCHAR(64);
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS bound_fivem_license VARCHAR(128);
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS bound_resource_name VARCHAR(128);
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS bound_at TIMESTAMPTZ;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses (status);
CREATE INDEX IF NOT EXISTS idx_licenses_email ON licenses (customer_email);

-- Internal source ZIP (never public URL)
CREATE TABLE IF NOT EXISTS package_source_files (
  package_id VARCHAR(128) PRIMARY KEY REFERENCES packages(id) ON DELETE CASCADE,
  storage_key VARCHAR(255) NOT NULL UNIQUE,
  original_filename VARCHAR(255),
  byte_size BIGINT NOT NULL DEFAULT 0,
  uploaded_by VARCHAR(64),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_package_source_storage ON package_source_files (storage_key);

-- FiveM validation audit
CREATE TABLE IF NOT EXISTS license_validation_events (
  id SERIAL PRIMARY KEY,
  license_id INTEGER REFERENCES licenses(id) ON DELETE SET NULL,
  license_key VARCHAR(64),
  package_id VARCHAR(128),
  resource_name VARCHAR(128),
  server_ip VARCHAR(64),
  fivem_license_id VARCHAR(128),
  success BOOLEAN NOT NULL,
  reason VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_validation_events_created ON license_validation_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_validation_events_license ON license_validation_events (license_id);
