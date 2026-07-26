import { Pool } from 'pg';

/**
 * Normalizes old MES seed/import rows into the current master-data contract.
 *
 * The current UI/API contract is `master_id`, `code`, `name` (LocalizedText),
 * and explicit relationship IDs. Older imports sometimes used aliases such as
 * item_code, item_name, version_code, or item_id. This script only backfills
 * unambiguous canonical fields and never adds UI-only duplicate columns.
 *
 * Default mode is a report/dry-run. Use `--apply` to write changes.
 */

const DATABASE_URL = process.env['DATABASE_URL'] ??
  'postgresql://mes_master_data_user:mes_master_data_pass@localhost:15434/mes_master_data_db';
const APPLY = process.argv.includes('--apply');
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';
const TABLES = ['md_item', 'md_item_revision', 'md_production_version'] as const;

type Row = Record<string, unknown>;

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function localizedValue(value: unknown): Record<string, string> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const object = value as Record<string, unknown>;
    const result = Object.fromEntries(Object.entries(object).filter(([, item]) => typeof item === 'string' && item.trim()));
    return Object.keys(result).length ? result as Record<string, string> : null;
  }
  const text = stringValue(value);
  return text ? { vi: text } : null;
}

function jsonEquals(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function columnsFor(pool: Pool, table: string): Promise<Set<string>> {
  const result = await pool.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`,
    [table],
  );
  return new Set(result.rows.map((row) => row.column_name));
}

function candidates(table: string, row: Row): { code?: string; name?: Record<string, string>; itemId?: string } {
  const code = table === 'md_production_version'
    ? stringValue(row['code']) ?? stringValue(row['version_code'])
    : table === 'md_item_revision'
      ? stringValue(row['code']) ?? (stringValue(row['item_code']) && stringValue(row['revision_code'])
        ? `${stringValue(row['item_code'])}-${stringValue(row['revision_code'])}`
        : stringValue(row['revision_code']))
      : stringValue(row['code']) ?? stringValue(row['item_code']);
  const name = localizedValue(row['name']) ?? localizedValue(row['item_name']) ?? localizedValue(row['version_name']);
  const itemId = table === 'md_item_revision' ? stringValue(row['item_id']) : undefined;
  return { code: code ?? undefined, name: name ?? undefined, itemId: itemId ?? undefined };
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const summary = { scanned: 0, changed: 0, unresolved: 0 };
  const unresolved: string[] = [];

  try {
    await pool.query('BEGIN');
    for (const table of TABLES) {
      const columns = await columnsFor(pool, table);
      const legacyColumns = ['item_code', 'item_name', 'version_code', 'version_name', 'production_version_id']
        .filter((column) => columns.has(column));
      const result = await pool.query<Row>(`SELECT * FROM ${quoteIdentifier(table)}`);

      console.log(`\n${table}: ${result.rows.length} rows; legacy aliases found: ${legacyColumns.join(', ') || 'none'}`);
      for (const row of result.rows) {
        summary.scanned += 1;
        const id = stringValue(row['master_id']);
        if (!id) {
          summary.unresolved += 1;
          unresolved.push(`${table}: row without master_id`);
          continue;
        }

        const patch: Record<string, unknown> = {};
        const values = candidates(table, row);
        if (columns.has('code') && !stringValue(row['code']) && values.code) patch['code'] = values.code;
        if (columns.has('name') && !localizedValue(row['name']) && values.name) patch['name'] = values.name;
        if (table === 'md_item_revision' && columns.has('item_id') && !stringValue(row['item_id']) && values.itemId) {
          patch['item_id'] = values.itemId;
        }

        if (table === 'md_production_version' && columns.has('item_revision_id') && !stringValue(row['item_revision_id']) && stringValue(row['item_id'])) {
          unresolved.push(`${table}:${id}: item_id exists but cannot be treated as item_revision_id without a verified revision match`);
        }
        if (!stringValue(row['code']) && !values.code) unresolved.push(`${table}:${id}: missing canonical code and no safe legacy code`);
        if (!localizedValue(row['name']) && !values.name) unresolved.push(`${table}:${id}: missing canonical name and no safe legacy name`);
        if (columns.has('production_version_id') && stringValue(row['production_version_id']) && row['production_version_id'] !== id) {
          unresolved.push(`${table}:${id}: production_version_id differs from master_id; not overwritten`);
        }

        if (!Object.keys(patch).length) continue;
        summary.changed += 1;
        console.log(`  ${APPLY ? 'UPDATE' : 'WOULD UPDATE'} ${id}: ${Object.keys(patch).join(', ')}`);
        if (!APPLY) continue;

        const assignments = Object.keys(patch).map((column, index) => `${quoteIdentifier(column)}=$${index + 1}`);
        const updateValues = Object.entries(patch).map(([column, value]) => column === 'name' ? JSON.stringify(value) : value);
        updateValues.push(SYSTEM_USER_ID, id);
        await pool.query(
          `UPDATE ${quoteIdentifier(table)} SET ${assignments.join(', ')}, updated_by=$${updateValues.length - 1}, updated_at=NOW(), row_version=row_version+1 WHERE master_id=$${updateValues.length}`,
          updateValues,
        );
      }
    }

    if (APPLY) await pool.query('COMMIT');
    else await pool.query('ROLLBACK');

    console.log(`\nMode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
    console.log(`Scanned: ${summary.scanned}; rows to update: ${summary.changed}; unresolved warnings: ${unresolved.length}`);
    if (unresolved.length) {
      console.log('\nUnresolved items (review manually; no unsafe relationship inference was performed):');
      for (const item of unresolved) console.log(`- ${item}`);
    }
    if (!APPLY && summary.changed) console.log('\nRun again with --apply to persist the safe canonical backfills.');
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
