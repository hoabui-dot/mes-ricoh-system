import { Pool } from 'pg';
import { OUTBOX_TABLE_SQL } from '@mom-platform/shared-kernel';

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';
const localized = (column: string) => `jsonb_typeof(${column}) = 'object' AND ${column} ? 'vi' AND btrim(${column}->>'vi') <> ''`;

const SQL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
${OUTBOX_TABLE_SQL}
CREATE TABLE IF NOT EXISTS qms_ncr_numbering_rule (rule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), entity_type VARCHAR(10) NOT NULL CHECK (entity_type IN ('NCR','CAPA')), site_id UUID NOT NULL, prefix VARCHAR(12) NOT NULL, date_format VARCHAR(20) NOT NULL DEFAULT 'YYYYMMDD', sequence_length INTEGER NOT NULL DEFAULT 5, UNIQUE(entity_type, site_id));
CREATE TABLE IF NOT EXISTS qms_ncr_numbering_sequence (rule_id UUID NOT NULL REFERENCES qms_ncr_numbering_rule(rule_id), sequence_key VARCHAR(50) NOT NULL, current_value INTEGER NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(rule_id, sequence_key));
CREATE TABLE IF NOT EXISTS qms_ncr (ncr_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), ncr_code VARCHAR(80) NOT NULL UNIQUE, source VARCHAR(30) NOT NULL CHECK (source IN ('InspectionFailure','Manual')), source_result_id UUID, source_event_id UUID UNIQUE, item_revision_id UUID, work_order_id UUID, work_center_id UUID, lot_or_label_ref VARCHAR(120), site_id UUID NOT NULL, severity VARCHAR(20) NOT NULL CHECK (severity IN ('Critical','Major','Minor')), description JSONB NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','UnderReview','Dispositioned','CAPARequired','Closed')), raised_by_user_id UUID NOT NULL, raised_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), row_version INTEGER NOT NULL DEFAULT 1, CONSTRAINT ck_qms_ncr_description_localized CHECK (${localized('description')}));
CREATE TABLE IF NOT EXISTS qms_ncr_disposition (disposition_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), ncr_id UUID NOT NULL REFERENCES qms_ncr(ncr_id), disposition_type VARCHAR(30) NOT NULL CHECK (disposition_type IN ('UseAsIs','Rework','Scrap','ReturnToSupplier')), reason JSONB NOT NULL, decided_by_user_id UUID NOT NULL, decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), requires_capa BOOLEAN NOT NULL DEFAULT FALSE, active_flag BOOLEAN NOT NULL DEFAULT TRUE, superseded_at TIMESTAMPTZ, CONSTRAINT ck_qms_disposition_reason_localized CHECK (${localized('reason')}));
CREATE UNIQUE INDEX IF NOT EXISTS uq_qms_active_disposition ON qms_ncr_disposition(ncr_id) WHERE active_flag = TRUE;
CREATE TABLE IF NOT EXISTS qms_capa (capa_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), capa_code VARCHAR(80) NOT NULL UNIQUE, root_cause JSONB NOT NULL, action_plan JSONB NOT NULL, owner_user_id UUID NOT NULL, due_date DATE NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','InProgress','Verified','Closed')), verified_by_user_id UUID, verified_at TIMESTAMPTZ, same_person_verification_flag BOOLEAN NOT NULL DEFAULT FALSE, created_by_user_id UUID NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), row_version INTEGER NOT NULL DEFAULT 1, CONSTRAINT ck_qms_capa_root_cause_localized CHECK (${localized('root_cause')}), CONSTRAINT ck_qms_capa_action_plan_localized CHECK (${localized('action_plan')}));
CREATE TABLE IF NOT EXISTS qms_capa_ncr_link (capa_id UUID NOT NULL REFERENCES qms_capa(capa_id), ncr_id UUID NOT NULL REFERENCES qms_ncr(ncr_id), linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), linked_by_user_id UUID NOT NULL, PRIMARY KEY(capa_id,ncr_id));
CREATE INDEX IF NOT EXISTS ix_qms_ncr_status ON qms_ncr(status, raised_at); CREATE INDEX IF NOT EXISTS ix_qms_capa_status ON qms_capa(status, due_date);
REVOKE DELETE ON qms_ncr_numbering_rule, qms_ncr_numbering_sequence, qms_ncr, qms_ncr_disposition, qms_capa, qms_capa_ncr_link FROM PUBLIC;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'qms_nonconformance_user') THEN GRANT USAGE ON SCHEMA public TO qms_nonconformance_user; GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO qms_nonconformance_user; REVOKE DELETE ON qms_ncr_numbering_rule, qms_ncr_numbering_sequence, qms_ncr, qms_ncr_disposition, qms_capa, qms_capa_ncr_link FROM qms_nonconformance_user; END IF; END $$;
`;

export async function runMigrations(pool: Pool): Promise<void> {
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
  if ((await pool.query('SELECT 1 FROM schema_migrations WHERE name=$1', ['0001_qms_nonconformance_schema'])).rows.length) return;
  const client = await pool.connect(); try { await client.query('BEGIN'); await client.query(SQL); await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', ['0001_qms_nonconformance_schema']); await client.query('COMMIT'); } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}
