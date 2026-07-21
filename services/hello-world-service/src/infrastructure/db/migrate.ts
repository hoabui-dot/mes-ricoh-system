import { Pool } from 'pg';
import { OUTBOX_TABLE_SQL } from '@mom-platform/shared-kernel';

// Inline audit trigger SQL (must be declared before MIGRATIONS array uses it)
const AUDIT_TRIGGER_SQL = `
CREATE OR REPLACE FUNCTION fn_set_audit_timestamps()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_user_id TEXT;
BEGIN
  BEGIN v_user_id := current_setting('app.current_user_id', true);
  EXCEPTION WHEN OTHERS THEN v_user_id := 'system'; END;
  IF v_user_id IS NULL OR v_user_id = '' THEN v_user_id := 'system'; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := NOW(); NEW.updated_at := NOW();
    NEW.created_by := v_user_id; NEW.updated_by := v_user_id;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.created_at := OLD.created_at; NEW.created_by := OLD.created_by;
    NEW.updated_at := NOW(); NEW.updated_by := v_user_id;
  END IF;
  RETURN NEW;
END; $$;
`;

const MIGRATIONS: Array<{ name: string; sql: string }> = [
  {
    name: '0001_initial',
    sql: `
      -- Enable pgcrypto for gen_random_uuid()
      CREATE EXTENSION IF NOT EXISTS pgcrypto;

      -- Audit trigger function (from shared-kernel)
      ${AUDIT_TRIGGER_SQL}

      -- Outbox events table (from shared-kernel)
      ${OUTBOX_TABLE_SQL}

      -- Service-specific tables
      CREATE TABLE IF NOT EXISTS greetings (
        id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        message     TEXT        NOT NULL,
        user_id     TEXT        NOT NULL,
        role_code   TEXT        NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_by  TEXT,
        updated_by  TEXT
      );

      -- Migration tracking
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name        TEXT        PRIMARY KEY,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `,
  },
];

export async function runMigrations(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    // Bootstrap migration tracking table
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name       TEXT        PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    for (const migration of MIGRATIONS) {
      const { rows } = await client.query<{ name: string }>(
        'SELECT name FROM schema_migrations WHERE name = $1',
        [migration.name],
      );

      if (rows.length > 0) {
        console.info(`[Migration] Skipping already-applied: ${migration.name}`);
        continue;
      }

      console.info(`[Migration] Applying: ${migration.name}`);
      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [migration.name]);
        await client.query('COMMIT');
        console.info(`[Migration] Applied: ${migration.name}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${migration.name} failed: ${String(err)}`);
      }
    }
    console.info('[Migration] All migrations applied successfully');
  } finally {
    client.release();
  }
}
