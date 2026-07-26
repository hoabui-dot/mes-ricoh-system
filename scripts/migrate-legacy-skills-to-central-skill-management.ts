import { Pool, type PoolClient } from 'pg';

/**
 * Migrates pre-centralized md_skill rows into scoped Skill Groups/Definitions.
 * Dry-run is the default. Destructive cleanup requires --apply.
 */

const DATABASE_URL = process.env['DATABASE_URL'] ?? 'postgresql://mes_master_data_user:mes_master_data_pass@localhost:15434/mes_master_data_db';
const APPLY = process.argv.includes('--apply');
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';
const SCOPE_PREFIX: Record<string, string> = { Machine: 'MC', Workstation: 'WS', WorkCenter: 'WC', Employee: 'EMP' };
type Row = Record<string, any>;

function localized(value: unknown): Record<string, string> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, string>;
  return { vi: String(value || 'Migrated skill') };
}

function normalizedName(value: unknown): string {
  const names = localized(value);
  return String(names.vi || names.en || names.ja || names.ko || '').trim().toLocaleLowerCase();
}

function slug(value: string): string {
  return value.normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toUpperCase().slice(0, 42) || 'SKILL';
}

async function ensureMappingTable(client: PoolClient): Promise<void> {
  await client.query(`CREATE TABLE IF NOT EXISTS md_legacy_skill_migration_map (
    mapping_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), legacy_skill_id UUID NOT NULL,
    target_scope VARCHAR(20) NOT NULL, new_skill_id UUID NOT NULL REFERENCES md_skill(master_id),
    migrated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE (legacy_skill_id, target_scope)
  )`);
}

async function scopesForSkill(client: PoolClient, skillId: string): Promise<string[]> {
  const { rows } = await client.query<{ scope: string }>(`
    SELECT DISTINCT resource_type AS scope FROM md_resource_skill_assignment WHERE skill_id = $1 AND active_flag = TRUE
    UNION SELECT 'Employee' FROM md_employee_skill WHERE skill_id = $1
    UNION SELECT 'WorkCenter' FROM md_production_standard WHERE skill_id = $1
    UNION SELECT 'WorkCenter' FROM md_operation_skill_requirement osr
      JOIN md_routing_operation ro ON ro.master_id = osr.routing_operation_id WHERE osr.skill_id = $1
  `, [skillId]);
  return rows.map((row) => row.scope).filter((scope) => scope in SCOPE_PREFIX);
}

async function findOrCreateGroup(client: PoolClient, scope: string, name: Record<string, string>, category: string, apply: boolean): Promise<string> {
  const categoryCode = category.toLowerCase().includes('quality') || category.toLowerCase().includes('inspection') ? 'QUALITY' : category.toLowerCase().includes('production') || category.toLowerCase().includes('process') ? 'PROCESS' : 'MIGRATED';
  const code = `SKG-${SCOPE_PREFIX[scope]}-${categoryCode}`;
  const existing = await client.query<{ skill_group_id: string }>(`SELECT skill_group_id FROM md_skill_group WHERE code = $1`, [code]);
  if (existing.rows[0]) return existing.rows[0].skill_group_id;
  if (!apply) return `dry-run-${scope}`;
  const result = await client.query<{ skill_group_id: string }>(`
    INSERT INTO md_skill_group (code, name, description, scope, legacy_flag, lifecycle_status, created_by)
    VALUES ($1, $2::jsonb, $3::jsonb, $4, FALSE, 'Released', $5) RETURNING skill_group_id
  `, [code, JSON.stringify({ vi: `${name.vi || name.en || 'Kỹ năng'} đã di chuyển`, en: `${name.en || name.vi || 'Migrated'} Skills`, ja: `${name.ja || name.en || '移行'}スキル`, ko: `${name.ko || name.en || '마이그레이션'} 기술` }), JSON.stringify({ vi: 'Nhóm được chuyển từ dữ liệu kỹ năng cũ.', en: 'Group migrated from legacy skill data.', ja: '旧スキルデータから移行したグループ。', ko: '기존 기술 데이터에서 마이그레이션된 그룹입니다.' }), scope, SYSTEM_USER_ID]);
  return result.rows[0].skill_group_id;
}

async function findOrCreateDefinition(client: PoolClient, legacy: Row, scope: string, groupId: string, apply: boolean): Promise<string> {
  const legacyName = localized(legacy.name);
  if (!apply && groupId.startsWith('dry-run-')) return `dry-run-${scope}-${legacy.master_id}`;
  const existing = await client.query<{ master_id: string }>(`SELECT master_id FROM md_skill WHERE skill_group_id = $1 AND scope = $2 AND legacy_flag = FALSE AND lower(COALESCE(name->>'vi', name->>'en', name->>'ja', name->>'ko')) = lower(COALESCE($3::jsonb->>'vi', $3::jsonb->>'en', $3::jsonb->>'ja', $3::jsonb->>'ko')) LIMIT 1`, [groupId, scope, JSON.stringify(legacyName)]);
  if (existing.rows[0]) return existing.rows[0].master_id;
  if (!apply) return `dry-run-${scope}-${legacy.master_id}`;
  const code = `SK-${SCOPE_PREFIX[scope]}-${slug(String(legacy.code || legacy.master_id))}`;
  const result = await client.query<{ master_id: string }>(`
    INSERT INTO md_skill (code, name, skill_group, minimum_level, skill_group_id, scope, legacy_flag, lifecycle_status, effective_from, created_by)
    VALUES ($1, $2::jsonb, $3, $4, $5, $6, FALSE, 'Released', NOW(), $7)
    ON CONFLICT (code, version_no) DO UPDATE SET skill_group_id = EXCLUDED.skill_group_id, scope = EXCLUDED.scope, legacy_flag = FALSE
    RETURNING master_id
  `, [code, JSON.stringify(legacyName), String(legacy.skill_group || `${scope} Skills`), legacy.minimum_level || 'Basic', groupId, scope, SYSTEM_USER_ID]);
  return result.rows[0].master_id;
}

async function migrateReferences(client: PoolClient, legacyId: string, targetId: string, scope: string, apply: boolean): Promise<number> {
  if (!apply) {
    const result = await client.query<{ count: string }>(`SELECT (
      (SELECT COUNT(*) FROM md_resource_skill_assignment WHERE skill_id = $1 AND resource_type = $2) +
      (SELECT COUNT(*) FROM md_employee_skill WHERE skill_id = $1 AND $2 = 'Employee') +
      (SELECT COUNT(*) FROM md_operation_skill_requirement WHERE skill_id = $1 AND $2 = 'WorkCenter') +
      (SELECT COUNT(*) FROM md_production_standard WHERE skill_id = $1 AND $2 = 'WorkCenter'))::text AS count`, [legacyId, scope]);
    return Number(result.rows[0]?.count || 0);
  }
  let moved = 0;
  if (scope === 'Employee') {
    const result = await client.query(`UPDATE md_employee_skill SET skill_id = $1, updated_by = $3, updated_at = NOW() WHERE skill_id = $2`, [targetId, legacyId, SYSTEM_USER_ID]); moved += result.rowCount || 0;
  }
  if (scope === 'WorkCenter') {
    const op = await client.query(`UPDATE md_operation_skill_requirement SET skill_id = $1 WHERE skill_id = $2 AND lifecycle_status <> 'Released'`, [targetId, legacyId]); moved += op.rowCount || 0;
    const standards = await client.query(`UPDATE md_production_standard SET skill_id = $1 WHERE skill_id = $2 AND lifecycle_status <> 'Released'`, [targetId, legacyId]); moved += standards.rowCount || 0;
  }
  const resource = await client.query(`UPDATE md_resource_skill_assignment SET skill_id = $1, updated_by = $3, updated_at = NOW() WHERE skill_id = $2 AND resource_type = $4`, [targetId, legacyId, SYSTEM_USER_ID, scope]); moved += resource.rowCount || 0;
  return moved;
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const summary = { found: 0, groups: 0, definitions: 0, reused: 0, assignments: 0, ambiguous: 0, archived: 0, deletedGroups: 0 };
  const ambiguous: Row[] = [];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await ensureMappingTable(client);
    const { rows: legacyRows } = await client.query<Row>(`SELECT * FROM md_skill WHERE legacy_flag = TRUE OR skill_group_id IS NULL ORDER BY code`);
    summary.found = legacyRows.length;
    for (const legacy of legacyRows) {
      const scopes = [...new Set(await scopesForSkill(client, legacy.master_id))];
      if (!scopes.length) { summary.ambiguous += 1; ambiguous.push({ id: legacy.master_id, code: legacy.code, name: legacy.name, reason: 'No resource, employee, production-standard, or operation requirement reference' }); continue; }
      for (const scope of scopes) {
        const mapped = await client.query<{ new_skill_id: string }>(`SELECT new_skill_id FROM md_legacy_skill_migration_map WHERE legacy_skill_id = $1 AND target_scope = $2`, [legacy.master_id, scope]);
        if (mapped.rows[0]) { summary.reused += 1; continue; }
        const groupId = await findOrCreateGroup(client, scope, localized(legacy.name), String(legacy.skill_group || ''), APPLY);
        const groupWasNew = APPLY && groupId && !(await client.query(`SELECT 1 FROM md_skill_group WHERE skill_group_id = $1 AND code <> $2`, [groupId, `SKG-${SCOPE_PREFIX[scope]}-MIGRATED`])).rows[0];
        if (groupWasNew) summary.groups += 1;
        const targetId = await findOrCreateDefinition(client, legacy, scope, groupId, APPLY);
        summary.definitions += 1;
        summary.assignments += await migrateReferences(client, legacy.master_id, targetId, scope, APPLY);
        if (APPLY) await client.query(`INSERT INTO md_legacy_skill_migration_map (legacy_skill_id, target_scope, new_skill_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [legacy.master_id, scope, targetId]);
      }
      if (APPLY) {
        const remaining = await client.query(`SELECT 1 FROM md_employee_skill WHERE skill_id = $1 UNION SELECT 1 FROM md_operation_skill_requirement WHERE skill_id = $1 UNION SELECT 1 FROM md_production_standard WHERE skill_id = $1 UNION SELECT 1 FROM md_resource_skill_assignment WHERE skill_id = $1`, [legacy.master_id]);
        if (!remaining.rows.length) { await client.query(`UPDATE md_skill SET legacy_flag = TRUE, lifecycle_status = 'Obsolete' WHERE master_id = $1`, [legacy.master_id]); summary.archived += 1; }
      }
    }
    if (APPLY) {
      const deleted = await client.query(`DELETE FROM md_skill_group WHERE code = 'LEGACY' AND NOT EXISTS (SELECT 1 FROM md_skill WHERE skill_group_id = md_skill_group.skill_group_id) RETURNING code`);
      summary.deletedGroups = deleted.rowCount || 0;
      await client.query('COMMIT');
    } else await client.query('ROLLBACK');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); await pool.end(); }
  console.log(`\nLegacy Skill Migration Summary (${APPLY ? 'APPLY' : 'DRY-RUN'})`);
  console.log(`Legacy Skills found: ${summary.found}`);
  console.log(`Migrated Skill Groups: ${summary.groups}`);
  console.log(`Migrated Skill Definitions: ${summary.definitions}`);
  console.log(`Reused Skill Definitions: ${summary.reused}`);
  console.log(`Migrated Resource Assignments: ${summary.assignments}`);
  console.log(`Ambiguous Skills: ${summary.ambiguous}`);
  console.log(`Archived legacy Skills: ${summary.archived}`);
  console.log(`Deleted LEGACY group: ${summary.deletedGroups}`);
  for (const row of ambiguous) console.log(`Ambiguous: ${row.id} ${row.code} ${JSON.stringify(row.name)} - ${row.reason}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
