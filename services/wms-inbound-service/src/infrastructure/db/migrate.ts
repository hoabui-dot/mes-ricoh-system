import { Pool } from 'pg';

const SQL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS schema_migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inbound_receipt (
  receipt_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_code varchar(50) UNIQUE NOT NULL,
  warehouse_location_id uuid NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Confirmed', 'Cancelled')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz
);

CREATE TABLE IF NOT EXISTS inbound_receipt_line (
  line_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL REFERENCES inbound_receipt(receipt_id),
  item_revision_id uuid NOT NULL,
  lot_code varchar(50) NOT NULL,
  qty numeric(18,3) NOT NULL CHECK (qty > 0),
  uom_code varchar(20) NOT NULL,
  expiry_date date,
  UNIQUE (receipt_id, lot_code)
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wms_inbound_user') THEN
    GRANT USAGE ON SCHEMA public TO wms_inbound_user;
    GRANT SELECT, INSERT, UPDATE ON TABLE inbound_receipt TO wms_inbound_user;
    GRANT SELECT, INSERT, UPDATE ON TABLE inbound_receipt_line TO wms_inbound_user;
    REVOKE DELETE ON TABLE inbound_receipt FROM wms_inbound_user;
    REVOKE DELETE ON TABLE inbound_receipt_line FROM wms_inbound_user;
  END IF;
END $$;
`;

export async function runMigrations(pool: Pool): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const name = '0001_initial_inbound_schema';
  const existing = await pool.query('SELECT name FROM schema_migrations WHERE name = $1', [name]);
  if (existing.rows.length > 0) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(SQL);
    await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
