CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  discord_id VARCHAR(32) NOT NULL UNIQUE,
  discord_username VARCHAR(255),
  discord_global_name VARCHAR(255),
  discord_avatar VARCHAR(128),
  discord_email VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_discord ON customers (discord_id);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers (LOWER(discord_email));

ALTER TABLE licenses ADD COLUMN IF NOT EXISTS discord_id VARCHAR(32);
CREATE INDEX IF NOT EXISTS idx_licenses_discord ON licenses (discord_id);
