-- Cart / multi-license upgrade for existing databases.
-- Idempotent: safe to run on every deploy.

-- Old installs: unique on stripe_session_id only (one license per checkout)
ALTER TABLE licenses DROP CONSTRAINT IF EXISTS licenses_stripe_session_id_key;

-- Cannot DROP INDEX when this name is a table constraint (schema.sql / Postgres 2BP01)
ALTER TABLE licenses DROP CONSTRAINT IF EXISTS licenses_session_package_unique;

-- Re-add composite unique if missing (fresh DB after drop, or legacy DB without it)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.licenses'::regclass
      AND conname = 'licenses_session_package_unique'
  ) THEN
    ALTER TABLE licenses
      ADD CONSTRAINT licenses_session_package_unique
      UNIQUE (stripe_session_id, package_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_licenses_session ON licenses (stripe_session_id);
