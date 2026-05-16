-- Cart / multi-license upgrade for existing databases.
-- Removes unique constraint on stripe_session_id only; adds composite uniqueness.

ALTER TABLE licenses DROP CONSTRAINT IF EXISTS licenses_stripe_session_id_key;

DROP INDEX IF EXISTS licenses_session_package_unique;

CREATE UNIQUE INDEX licenses_session_package_unique ON licenses (stripe_session_id, package_id);

CREATE INDEX IF NOT EXISTS idx_licenses_session ON licenses (stripe_session_id);
