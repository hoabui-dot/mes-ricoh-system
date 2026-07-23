import { Pool, type PoolClient } from 'pg';
import { SEED_LOCALIZED_TEXT } from '../../services/mes-master-data-service/src/infrastructure/db/seed-i18n.js';

const DATABASE_URL =
  process.env['DATABASE_URL'] ??
  'postgresql://mes_master_data_user:mes_master_data_pass@localhost:15434/mes_master_data_db';

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';
const REQUIRED_LOCALES = ['vi', 'en', 'ja', 'ko'] as const;

async function ensureFlagTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS i18n_data_quality_flag (
      flag_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      table_name VARCHAR(100) NOT NULL,
      column_name VARCHAR(100) NOT NULL,
      row_id UUID NOT NULL,
      flagged_locale VARCHAR(5) NOT NULL DEFAULT 'vi',
      current_value TEXT NOT NULL,
      detected_language_guess VARCHAR(10),
      confidence DECIMAL(4,3),
      status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RESOLVED','DISMISSED')),
      flagged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at TIMESTAMPTZ,
      resolved_by UUID
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_i18n_dq_open_flag
      ON i18n_data_quality_flag(table_name, column_name, row_id, flagged_locale)
      WHERE status = 'OPEN';
    CREATE INDEX IF NOT EXISTS ix_i18n_dq_status_table
      ON i18n_data_quality_flag(status, table_name, flagged_at DESC);
  `);
}

async function columnExistsAsJsonb(client: PoolClient, tableName: string, columnName: string): Promise<boolean> {
  const { rows } = await client.query(
    `SELECT udt_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [tableName, columnName],
  );
  return rows[0]?.udt_name === 'jsonb';
}

async function enrichColumn(
  client: PoolClient,
  tableName: string,
  code: string,
  columnName: string,
  value: Record<(typeof REQUIRED_LOCALES)[number], string>,
): Promise<{ updated: number; resolved: number }> {
  if (!(await columnExistsAsJsonb(client, tableName, columnName))) return { updated: 0, resolved: 0 };

  const triggerName = `trg_protect_released_${tableName}`;
  let triggerDisabled = false;
  await client.query('BEGIN');
  try {
    const triggerCheck = await client.query(
      `SELECT 1
       FROM pg_trigger
       WHERE tgrelid = to_regclass($1)
         AND tgname = $2`,
      [tableName, triggerName],
    );
    if (triggerCheck.rowCount) {
      await client.query(`ALTER TABLE ${tableName} DISABLE TRIGGER ${triggerName}`);
      triggerDisabled = true;
    }

    const update = await client.query(
      `UPDATE ${tableName}
       SET ${columnName} = $1::jsonb
       WHERE code = $2
         AND (
           NOT (${columnName} ?& $3::text[])
           OR ${columnName}->>'vi' = $4
         )`,
      [JSON.stringify(value), code, REQUIRED_LOCALES, value.en],
    );

    const resolved = await client.query(
      `UPDATE i18n_data_quality_flag flag
       SET status = 'RESOLVED',
           resolved_at = NOW(),
           resolved_by = $1::uuid
       FROM ${tableName} target
       WHERE flag.status = 'OPEN'
         AND flag.table_name = $2
         AND flag.column_name = $3
         AND flag.row_id = target.master_id
         AND target.code = $4`,
      [SYSTEM_USER_ID, tableName, columnName, code],
    );

    if (triggerDisabled) {
      await client.query(`ALTER TABLE ${tableName} ENABLE TRIGGER ${triggerName}`);
    }
    await client.query('COMMIT');
    return { updated: update.rowCount ?? 0, resolved: resolved.rowCount ?? 0 };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const client = await pool.connect();
  let updated = 0;
  let resolved = 0;
  try {
    await ensureFlagTable(client);

    for (const [tableName, recordsByCode] of Object.entries(SEED_LOCALIZED_TEXT)) {
      for (const [code, columnsByName] of Object.entries(recordsByCode)) {
        for (const [columnName, value] of Object.entries(columnsByName)) {
          const result = await enrichColumn(client, tableName, code, columnName, value);
          updated += result.updated;
          resolved += result.resolved;
        }
      }
    }

    console.info(`[i18n-seed-enrich] localized seed rows updated: ${updated}`);
    console.info(`[i18n-seed-enrich] quality flags resolved: ${resolved}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[i18n-seed-enrich] failed', err);
  process.exit(1);
});
