import { Pool } from 'pg';

const DATABASE_URL = process.env['DATABASE_URL'] ?? 'postgresql://mes_master_data_user:mes_master_data_pass@localhost:15434/mes_master_data_db';
const QMS_CONSOLE_RESOURCE_ID = '00000000-0000-0000-0000-000000000131';
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: DATABASE_URL });
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS i18n_data_quality_flag (flag_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), table_name VARCHAR(100) NOT NULL, column_name VARCHAR(100) NOT NULL, row_id UUID NOT NULL, flagged_locale VARCHAR(5) NOT NULL DEFAULT 'vi', current_value TEXT NOT NULL, detected_language_guess VARCHAR(10), confidence DECIMAL(4,3), status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RESOLVED','DISMISSED')), flagged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), resolved_at TIMESTAMPTZ, resolved_by UUID); CREATE UNIQUE INDEX IF NOT EXISTS uq_i18n_dq_open_flag ON i18n_data_quality_flag(table_name, column_name, row_id, flagged_locale) WHERE status = 'OPEN';`);
    const result = await pool.query(`INSERT INTO i18n_data_quality_flag (table_name, column_name, row_id, flagged_locale, current_value, detected_language_guess, confidence) VALUES ('qms_console_i18n_resource', 'dictionary', $1, $2, 'Shared English fallback dictionary', 'en', 1.000), ('qms_console_i18n_resource', 'dictionary', $1, $3, 'Shared English fallback dictionary', 'en', 1.000) ON CONFLICT (table_name, column_name, row_id, flagged_locale) WHERE status = 'OPEN' DO NOTHING RETURNING flag_id`, [QMS_CONSOLE_RESOURCE_ID, 'ja', 'ko']);
    console.info(`[i18n-qms-console] registered ${result.rowCount ?? 0} OPEN fallback flags; reviewer: ${SYSTEM_USER_ID}`);
  } finally { await pool.end(); }
}
main().catch((error) => { console.error('[i18n-qms-console] failed', error); process.exit(1); });
