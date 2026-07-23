import { Pool } from 'pg';

const DATABASE_URL =
  process.env['DATABASE_URL'] ??
  'postgresql://mes_master_data_user:mes_master_data_pass@localhost:15434/mes_master_data_db';

const VIETNAMESE_DIACRITIC_RE = /[ăâđêôơưáàảãạắằẳẵặấầẩẫậéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵĂÂĐÊÔƠƯÁÀẢÃẠẮẰẲẴẶẤẦẨẪẬÉÈẺẼẸẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌỐỒỔỖỘỚỜỞỠỢÚÙỦŨỤỨỪỬỮỰÝỲỶỸỴ]/;
const CODE_LIKE_RE = /^[A-Z0-9_.:/# -]{1,32}$/;
const ENGLISH_TERMS = [
  'rubber',
  'cutting',
  'work',
  'center',
  'machine',
  'molding',
  'mixing',
  'inspection',
  'quality',
  'shift',
  'operator',
  'manager',
  'production',
  'standard',
  'equipment',
  'reason',
  'skill',
  'material',
  'assembly',
  'line',
  'station',
  'calendar',
  'schedule',
];

const LOCALIZED_COLUMNS = [
  ['md_item', 'name'],
  ['md_item_revision', 'name'],
  ['md_work_center', 'name'],
  ['md_equipment', 'name'],
  ['md_skill', 'name'],
  ['md_reason_code', 'name'],
  ['md_operation', 'name'],
  ['md_work_instruction', 'instruction_text'],
] as const;

function detectEnglishConfidence(value: string): number {
  const normalized = value.toLowerCase();
  const words = normalized.match(/[a-z]+/g) ?? [];
  if (words.length < 2 || CODE_LIKE_RE.test(value.trim())) return 0;
  const hits = words.filter((word) => ENGLISH_TERMS.includes(word)).length;
  const asciiRatio = (value.match(/[ -~]/g)?.length ?? 0) / Math.max(value.length, 1);
  const score = Math.min(0.99, hits / Math.max(words.length, 1) + (asciiRatio > 0.95 ? 0.35 : 0));
  return score >= 0.55 ? Number(score.toFixed(3)) : 0;
}

async function columnExistsAsJsonb(pool: Pool, tableName: string, columnName: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT udt_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [tableName, columnName],
  );
  return rows[0]?.udt_name === 'jsonb';
}

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  let flagged = 0;
  try {
    await pool.query(`
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
    `);

    for (const [tableName, columnName] of LOCALIZED_COLUMNS) {
      if (!(await columnExistsAsJsonb(pool, tableName, columnName))) continue;
      const { rows } = await pool.query(
        `SELECT master_id, ${columnName}->>'vi' AS vi_value
         FROM ${tableName}
         WHERE ${columnName} ? 'vi' AND btrim(${columnName}->>'vi') <> ''`,
      );
      for (const row of rows) {
        const value = String(row.vi_value ?? '').trim();
        if (!value || VIETNAMESE_DIACRITIC_RE.test(value)) continue;
        const confidence = detectEnglishConfidence(value);
        if (confidence <= 0) continue;
        await pool.query(
          `INSERT INTO i18n_data_quality_flag
             (table_name, column_name, row_id, flagged_locale, current_value, detected_language_guess, confidence)
           VALUES ($1, $2, $3, 'vi', $4, 'eng', $5)
           ON CONFLICT (table_name, column_name, row_id, flagged_locale)
             WHERE status = 'OPEN'
             DO UPDATE SET current_value = EXCLUDED.current_value,
                           detected_language_guess = EXCLUDED.detected_language_guess,
                           confidence = EXCLUDED.confidence,
                           flagged_at = NOW()`,
          [tableName, columnName, row.master_id, value, confidence],
        );
        flagged += 1;
      }
    }
    console.info(`[i18n-audit] SUSPECT_NOT_VI flags opened/refreshed: ${flagged}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[i18n-audit] failed', err);
  process.exit(1);
});
