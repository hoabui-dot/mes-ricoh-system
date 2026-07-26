import { Router, type Request, type Response, type NextFunction } from 'express';
import { Pool, type PoolClient } from 'pg';
import { createEventEnvelope, localizedTextSchema, writeToOutbox } from '@mom-platform/shared-kernel';
import { TABLE_BY_RESOURCE, type TableDefinition } from '../../domain/table-registry.js';
import { validateProductionVersion } from '../../application/validation-engine/validation-engine.js';
import { formatRoutingCode } from './routing-numbering.js';

const SERVICE_NAME = 'mes-master-data-service';
const IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';
const WORKER_SKILL_LEVELS = new Set(['Basic', 'L1', 'L2', 'L3', 'L4', 'L5']);

async function allocateRoutingCode(client: PoolClient): Promise<string> {
  const { rows } = await client.query<{ number_date: string; current_value: string }>(`
    INSERT INTO md_routing_numbering_daily (number_date, current_value)
    VALUES (CURRENT_DATE, 1)
    ON CONFLICT (number_date) DO UPDATE
      SET current_value = md_routing_numbering_daily.current_value + 1,
          updated_at = NOW()
    RETURNING number_date::text, current_value::text
  `);
  const row = rows[0];
  if (!row) throw new Error('Routing number allocation returned no counter row');
  return formatRoutingCode(row.number_date, Number(row.current_value));
}

async function allocateItemRevisionCode(client: PoolClient, itemId: string, itemCode: string): Promise<{ revisionNo: number; revisionCode: string }> {
  const { rows } = await client.query<{ current_value: number }>(`
    INSERT INTO md_item_revision_numbering (item_id, current_value)
    VALUES ($1, 1)
    ON CONFLICT (item_id) DO UPDATE
      SET current_value = md_item_revision_numbering.current_value + 1,
          updated_at = NOW()
    RETURNING current_value
  `, [itemId]);
  const revisionNo = Number(rows[0]?.current_value);
  if (!Number.isFinite(revisionNo) || revisionNo < 1) throw new Error('Item revision number allocation returned no counter row');
  return { revisionNo, revisionCode: `${itemCode}-R${revisionNo}` };
}

async function routingCodePreview(pool: Pool): Promise<{ preview_code: string; is_reserved: false }> {
  const { rows } = await pool.query<{ next_value: string; number_date: string }>(`
    SELECT COALESCE((SELECT current_value FROM md_routing_numbering_daily WHERE number_date = CURRENT_DATE), 0) + 1 AS next_value,
           TO_CHAR(CURRENT_DATE, 'YYYYMMDD') AS number_date
  `);
  const row = rows[0];
  if (!row) throw new Error('Routing number preview returned no counter row');
  return { preview_code: formatRoutingCode(row.number_date, Number(row.next_value)), is_reserved: false };
}

function getContext(req: Request) {
  return {
    userId: (req.headers['x-user-id'] as string | undefined) ?? SYSTEM_USER_ID,
    roleCode: (req.headers['x-role-code'] as string | undefined) ?? 'UNKNOWN',
    traceId: (req.headers['x-trace-id'] as string | undefined) ?? 'missing-trace',
  };
}

function requireTable(resource: string): TableDefinition {
  const aliases = new Map([
    ['mboms', 'mbom-headers'],
    ['routings', 'routing-headers'],
    ['factories', 'sites'],
    ['machines', 'equipment'],
  ]);
  const table = TABLE_BY_RESOURCE.get(aliases.get(resource) ?? resource);
  if (!table) throw Object.assign(new Error(`Unsupported master-data resource: ${resource}`), { statusCode: 404 });
  if (!IDENTIFIER.test(table.tableName)) throw new Error(`Unsafe table name: ${table.tableName}`);
  return table;
}

async function allocateResourceCode(client: PoolClient, prefix: string): Promise<string> {
  const result = await client.query<{ current_value: string }>(`
    INSERT INTO md_resource_numbering_daily (prefix, number_date, current_value)
    VALUES ($1, CURRENT_DATE, 1)
    ON CONFLICT (prefix, number_date) DO UPDATE SET current_value = md_resource_numbering_daily.current_value + 1
    RETURNING current_value
  `, [prefix]);
  return `${prefix}-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${String(Number(result.rows[0]?.current_value || 1)).padStart(4, '0')}`;
}

const CODE_PREFIX_BY_ENTITY: Record<string, string> = { Factory: 'FAC', Shopfloor: 'SF', WorkCenter: 'WC', Workstation: 'WS', Machine: 'MC', Operation: 'OP', SkillGroup: 'SKG', 'SkillGroup:Machine': 'SKG-MC', 'SkillGroup:Workstation': 'SKG-WS', 'SkillGroup:WorkCenter': 'SKG-WC', Skill: 'SK', 'Skill:Machine': 'SK-MC', 'Skill:Workstation': 'SK-WS', 'Skill:WorkCenter': 'SK-WC' };

async function reserveBusinessCode(client: PoolClient, entityType: string, context: { userId: string }): Promise<Record<string, any>> {
  const prefix = CODE_PREFIX_BY_ENTITY[entityType];
  if (!prefix) throw Object.assign(new Error('BUSINESS_CODE_ENTITY_UNSUPPORTED'), { statusCode: 422 });
  const code = await allocateResourceCode(client, prefix);
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const { rows } = await client.query(`INSERT INTO md_business_code_reservation (entity_type, prefix, code, expires_at, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING reservation_id, entity_type, code, expires_at`, [entityType, prefix, code, expiresAt.toISOString(), context.userId]);
  return rows[0];
}

async function consumeBusinessCode(client: PoolClient, reservationId: unknown, entityType: string, context: { userId: string }): Promise<string> {
  if (!reservationId) { const prefix = CODE_PREFIX_BY_ENTITY[entityType]; if (!prefix) throw Object.assign(new Error('BUSINESS_CODE_ENTITY_UNSUPPORTED'), { statusCode: 422 }); return allocateResourceCode(client, prefix); }
  const result = await client.query(`UPDATE md_business_code_reservation SET consumed_at = NOW() WHERE reservation_id = $1 AND entity_type = $2 AND consumed_at IS NULL AND expires_at > NOW() AND created_by = $3 RETURNING code`, [reservationId, entityType, context.userId]);
  if (!result.rows[0]) throw Object.assign(new Error('BUSINESS_CODE_RESERVATION_INVALID_OR_EXPIRED'), { statusCode: 409 });
  return String(result.rows[0].code);
}

function machineGroupName(value: unknown): Record<string, string> {
  const parsed = localizedTextSchema.safeParse(value);
  if (!parsed.success) throw Object.assign(new Error('Machine Group name must include a non-empty Vietnamese value'), { statusCode: 422 });
  return parsed.data as Record<string, string>;
}

async function resolveMachineUnit(client: PoolClient, machineId: string, requestedUnitId?: string): Promise<Record<string, any>> {
  const result = requestedUnitId
    ? await client.query(`SELECT mu.*, eq.site_id, eq.active_flag AS machine_active, eq.execution_status AS machine_execution_status FROM md_machine_unit mu JOIN md_equipment eq ON eq.master_id = mu.machine_id WHERE mu.machine_unit_id = $1 AND mu.machine_id = $2 FOR UPDATE`, [requestedUnitId, machineId])
    : await client.query(`SELECT mu.*, eq.site_id, eq.active_flag AS machine_active, eq.execution_status AS machine_execution_status FROM md_machine_unit mu JOIN md_equipment eq ON eq.master_id = mu.machine_id WHERE mu.machine_id = $1 AND mu.active_flag = TRUE AND mu.execution_status = 'Available' AND eq.active_flag = TRUE AND eq.execution_status = 'Available' ORDER BY mu.unit_sequence LIMIT 1 FOR UPDATE`, [machineId]);
  const unit = result.rows[0];
  if (!unit || unit.machine_active !== true || unit.active_flag !== true || unit.execution_status !== 'Available' || unit.machine_execution_status !== 'Available') throw Object.assign(new Error('MACHINE_UNIT_NOT_AVAILABLE'), { statusCode: 422 });
  return unit;
}

async function persistMachineGroups(client: PoolClient, workstationId: string, groups: unknown, context: { userId: string }): Promise<Record<string, any>[]> {
  if (!Array.isArray(groups) || groups.length < 1) throw Object.assign(new Error('AT_LEAST_ONE_MACHINE_GROUP_REQUIRED'), { statusCode: 422 });
  const workstation = await client.query(`SELECT ws.master_id, ws.site_id, ws.shopfloor_id, ws.work_center_id, ws.active_flag FROM md_workstation ws WHERE ws.master_id = $1 FOR UPDATE`, [workstationId]);
  if (!workstation.rows[0] || workstation.rows[0].active_flag !== true) throw Object.assign(new Error('WORKSTATION_NOT_FOUND_OR_INACTIVE'), { statusCode: 422 });
  const ws = workstation.rows[0];
  const output: Record<string, any>[] = [];
  const selectedUnitIds = new Set<string>();
  for (const raw of groups as Record<string, any>[]) {
    const groupName = machineGroupName(raw.name || raw.group_name);
    // Replacing an active workstation configuration must not replay its historical start date.
    // Only future-dated changes retain the requested effective date.
    const now = new Date();
    const requestedEffectiveFrom = new Date(String(raw.effective_from || now.toISOString()));
    const effectiveFrom = (requestedEffectiveFrom > now ? requestedEffectiveFrom : now).toISOString();
    const effectiveTo = raw.effective_to ? new Date(String(raw.effective_to)).toISOString() : null;
    const legacyMembers = [raw.primary_machine_id ? { machine_id: raw.primary_machine_id, machine_unit_id: raw.primary_machine_unit_id, role: 'Primary', requirement_type: 'Required', required_quantity: 1 } : null, ...(Array.isArray(raw.supporting_machines) ? raw.supporting_machines : []).map((member: Record<string, any>) => ({ machine_id: member.machine_id, machine_unit_id: member.machine_unit_id, role: 'Supporting', requirement_type: member.requirement_type === 'Optional' ? 'Optional' : 'Required', required_quantity: 1 }))].filter(Boolean) as Record<string, any>[];
    const lines = (Array.isArray(raw.requirements) ? raw.requirements : legacyMembers) as Record<string, any>[];
    if (!lines.length || !lines.some((line) => line.role === 'Primary')) throw Object.assign(new Error('MACHINE_GROUP_PRIMARY_REQUIREMENT_REQUIRED'), { statusCode: 422 });
    const seenMachines = new Set<string>();
    const resolved: Record<string, any>[] = [];
    for (const member of lines) {
      if (!member.machine_id) throw Object.assign(new Error('MACHINE_GROUP_MACHINE_REQUIRED'), { statusCode: 422 });
      const quantity = Number(member.required_quantity ?? 1);
      if (!Number.isInteger(quantity) || quantity < 1) throw Object.assign(new Error('MACHINE_REQUIREMENT_QUANTITY_INVALID'), { statusCode: 422 });
      const machineKey = `${member.machine_id}:${member.role}`;
      if (seenMachines.has(machineKey)) throw Object.assign(new Error('MACHINE_REQUIREMENT_DUPLICATE'), { statusCode: 422 });
      seenMachines.add(machineKey);
      const machine = await client.query(`SELECT master_id, code, name, site_id, active_flag, execution_status, planning_resource_flag FROM md_equipment WHERE master_id = $1 FOR UPDATE`, [member.machine_id]);
      if (!machine.rows[0] || machine.rows[0].site_id !== ws.site_id || machine.rows[0].active_flag !== true || machine.rows[0].execution_status === 'OutOfService') throw Object.assign(new Error('MACHINE_HIERARCHY_OR_STATUS_INVALID'), { statusCode: 422 });
      const pinned = Array.isArray(member.pinned_machine_unit_ids) ? member.pinned_machine_unit_ids.map(String) : (member.machine_unit_id ? [String(member.machine_unit_id)] : []);
      const units = await client.query(`SELECT mu.*, eq.site_id, eq.active_flag AS machine_active, eq.execution_status AS machine_execution_status FROM md_machine_unit mu JOIN md_equipment eq ON eq.master_id = mu.machine_id WHERE mu.machine_id = $1 AND mu.active_flag = TRUE AND mu.execution_status = 'Available' AND eq.active_flag = TRUE AND eq.execution_status = 'Available' AND NOT (mu.machine_unit_id = ANY($4::uuid[])) AND NOT EXISTS (SELECT 1 FROM md_resource_assignment ra WHERE ra.machine_unit_id = mu.machine_unit_id AND ra.assignment_role = 'Primary' AND ra.workstation_id IS DISTINCT FROM $5::uuid AND ra.effective_from < $3::timestamptz AND $2::timestamptz < COALESCE(ra.effective_to, 'infinity'::timestamptz)) ORDER BY mu.unit_sequence, mu.code FOR UPDATE`, [member.machine_id, effectiveFrom, effectiveTo || 'infinity', [...selectedUnitIds], workstationId]);
      const selected = pinned.length ? units.rows.filter((unit) => pinned.includes(String(unit.machine_unit_id))) : units.rows.slice(0, quantity);
      if (selected.length < quantity) {
        const conflicting = await client.query(`SELECT ra.machine_unit_id, mu.code AS machine_unit_code, ws.code AS workstation_code, ws.name AS workstation_name FROM md_resource_assignment ra JOIN md_machine_unit mu ON mu.machine_unit_id = ra.machine_unit_id JOIN md_workstation ws ON ws.master_id = ra.workstation_id WHERE ra.machine_unit_id IN (SELECT machine_unit_id FROM md_machine_unit WHERE machine_id = $1 AND active_flag = TRUE AND execution_status = 'Available') AND ra.assignment_role = 'Primary' AND ra.workstation_id IS DISTINCT FROM $4::uuid AND ra.effective_from < $3::timestamptz AND $2::timestamptz < COALESCE(ra.effective_to, 'infinity'::timestamptz) ORDER BY mu.unit_sequence`, [member.machine_id, effectiveFrom, effectiveTo || 'infinity', workstationId]);
        if (member.role === 'Primary' && conflicting.rows.length) throw Object.assign(new Error('This physical machine is already assigned as a Primary Machine.'), { statusCode: 409, code: 'MACHINE_UNIT_PRIMARY_CONFLICT', details: { machine_id: member.machine_id, role: member.role, requested_quantity: quantity, available_quantity: selected.length, conflicts: conflicting.rows } });
        throw Object.assign(new Error('Not enough physical machines are available.'), { statusCode: 422, code: 'MACHINE_REQUIREMENT_QUANTITY_UNAVAILABLE', details: { machine_id: member.machine_id, role: member.role, requested_quantity: quantity, available_quantity: selected.length, conflicts: conflicting.rows } });
      }
      selected.forEach((unit) => selectedUnitIds.add(String(unit.machine_unit_id)));
      resolved.push({ ...member, required_quantity: quantity, requirement_type: member.requirement_type === 'Optional' ? 'Optional' : 'Required', machine: machine.rows[0], units: selected });
    }
    const groupCode = await allocateResourceCode(client, 'MG');
    const group = await client.query(`INSERT INTO md_workstation_machine_group (code, name, description, site_id, shopfloor_id, work_center_id, workstation_id, group_type, minimum_required_machines, maximum_concurrent_jobs, lifecycle_status, effective_from, effective_to, created_by) VALUES ($1,$2::jsonb,$3::jsonb,$4,$5,$6,$7,$8,1,1,$9,$10,$11,$12) RETURNING *`, [groupCode, JSON.stringify(groupName), raw.description ? JSON.stringify(machineGroupName(raw.description)) : null, ws.site_id, ws.shopfloor_id, ws.work_center_id, ws.master_id, raw.group_type || null, raw.status || 'Draft', effectiveFrom, effectiveTo, context.userId]);
    for (const [lineIndex, member] of resolved.entries()) {
      await client.query(`INSERT INTO md_workstation_machine_requirement (machine_group_id, machine_id, role, required_quantity, requirement_type, pinned_machine_unit_ids, sequence_no, effective_from, effective_to, created_by) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10)`, [group.rows[0].master_id, member.machine.master_id, member.role, member.required_quantity, member.requirement_type, JSON.stringify(member.units.map((unit: any) => String(unit.machine_unit_id))), lineIndex + 1, group.rows[0].effective_from, group.rows[0].effective_to, context.userId]);
      for (const [unitIndex, unit] of member.units.entries()) await client.query(`INSERT INTO md_resource_assignment (code, name, site_id, work_center_id, workstation_id, equipment_id, machine_group_id, machine_unit_id, assignment_type, assignment_role, requirement_type, sequence_no, scheduling_flag, oee_aggregation_flag, effective_from, effective_to, created_by) VALUES ($1,$2::jsonb,$3,$4,$5,$6,$7,$8,'MachineGroupMember',$9,$10,$11,$12,$13,$14,$15,$16)`, [`RA-${groupCode}-${String(lineIndex + 1).padStart(2, '0')}-${String(unitIndex + 1).padStart(2, '0')}`, JSON.stringify({ vi: 'Đơn vị trong nhóm máy', en: 'Machine group unit', ja: 'マシングループユニット', ko: '머신 그룹 단위' }), ws.site_id, ws.work_center_id, ws.master_id, member.machine.master_id, group.rows[0].master_id, unit.machine_unit_id, member.role, member.requirement_type, lineIndex + 1, true, member.role === 'Primary' || member.requirement_type === 'Required', group.rows[0].effective_from, group.rows[0].effective_to, context.userId]);
    }
    output.push({ ...group.rows[0], requirements: resolved.map((member) => ({ machine_id: member.machine.master_id, machine_code: member.machine.code, machine_name: member.machine.name, required_quantity: member.required_quantity, requirement_type: member.requirement_type, role: member.role, resolved_units: member.units.map((unit: any) => ({ machine_unit_id: unit.machine_unit_id, code: unit.code, execution_status: unit.execution_status })) })) });
  }
  return output;
}

async function syncMachineQuantity(client: PoolClient, machineId: string, requestedQuantity: number): Promise<void> {
  if (!Number.isInteger(requestedQuantity) || requestedQuantity < 1) throw Object.assign(new Error('MACHINE_QUANTITY_BELOW_ONE'), { statusCode: 422 });
  const currentResult = await client.query(`SELECT quantity FROM md_equipment WHERE master_id = $1 FOR UPDATE`, [machineId]);
  const currentQuantity = Number(currentResult.rows[0]?.quantity || 0);
  if (requestedQuantity > currentQuantity) {
    const machine = await client.query(`SELECT code, execution_status, active_flag FROM md_equipment WHERE master_id = $1`, [machineId]);
    for (let sequence = currentQuantity + 1; sequence <= requestedQuantity; sequence += 1) await client.query(`INSERT INTO md_machine_unit (machine_id, code, unit_sequence, execution_status, active_flag) VALUES ($1,$2,$3,$4,$5)`, [machineId, `${machine.rows[0].code}-${String(sequence).padStart(2, '0')}`, sequence, machine.rows[0].execution_status || 'Available', machine.rows[0].active_flag !== false]);
    return;
  }
  if (requestedQuantity === currentQuantity) return;
  const demand = await client.query(`SELECT COALESCE(SUM(required_quantity), 0)::int AS required_quantity FROM md_workstation_machine_requirement WHERE machine_id = $1 AND requirement_type = 'Required' AND active_flag = TRUE AND (effective_to IS NULL OR effective_to > NOW())`, [machineId]);
  if (requestedQuantity < Number(demand.rows[0]?.required_quantity || 0)) throw Object.assign(new Error('MACHINE_QUANTITY_BELOW_ACTIVE_REQUIREMENT_DEMAND'), { statusCode: 409 });
  const units = await client.query(`SELECT mu.machine_unit_id, mu.unit_sequence FROM md_machine_unit mu WHERE mu.machine_id = $1 AND mu.active_flag = TRUE ORDER BY mu.unit_sequence DESC`, [machineId]);
  const retiring = units.rows.slice(requestedQuantity);
  for (const unit of retiring) {
    const reference = await client.query(`SELECT EXISTS (SELECT 1 FROM md_resource_assignment WHERE machine_unit_id = $1 AND (effective_to IS NULL OR effective_to > NOW())) AS active_assignment`, [unit.machine_unit_id]);
    if (reference.rows[0]?.active_assignment) throw Object.assign(new Error('MACHINE_UNIT_ACTIVE_ASSIGNMENT'), { statusCode: 409 });
    await client.query(`UPDATE md_machine_unit SET active_flag = FALSE, updated_at = NOW() WHERE machine_unit_id = $1`, [unit.machine_unit_id]);
  }
}

function normalizeBody(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return {};
  const raw = body as Record<string, unknown>;
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (/^[a-z][a-zA-Z0-9_]*$/.test(key)) {
      normalized[key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)] = value;
    } else if (/^[a-z_][a-z0-9_]*$/.test(key)) {
      normalized[key] = value;
    }
  }
  return normalized;
}

function translatableColumns(tableName: string): string[] {
  const localizedNameTables = new Set([
    'md_site',
    'md_shopfloor',
    'md_production_area',
    'md_item',
    'md_item_revision',
    'md_work_center',
    'md_workstation',
    'md_equipment',
    'md_skill',
    'md_reason_code',
    'md_operation',
    'md_mbom_header',
    'md_routing_header',
    'md_ebom_header',
  ]);
  const columns: string[] = [];
  if (localizedNameTables.has(tableName)) columns.push('name');
  if (['md_production_area', 'md_workstation', 'md_equipment'].includes(tableName)) columns.push('description');
  if (['md_mbom_header', 'md_routing_header', 'md_ebom_header'].includes(tableName)) columns.push('description', 'change_reason', 'engineering_note');
  if (tableName === 'md_routing_header') columns.push('production_purpose');
  if (tableName === 'md_operation') columns.push('description', 'operator_instruction_summary', 'quality_requirement_summary');
  if (tableName === 'md_work_instruction') columns.push('instruction_text');
  return columns;
}

function normalizeLocalizedFields(table: TableDefinition, body: Record<string, unknown>): Record<string, unknown> {
  for (const column of translatableColumns(table.tableName)) {
    const value = body[column];
    if (value === undefined || value === null) continue;
    if (typeof value === 'object' && !Array.isArray(value) && Object.values(value as Record<string, unknown>).every((entry) => !String(entry ?? '').trim())) {
      delete body[column];
      continue;
    }
    if (typeof value === 'string' || value !== undefined) {
      const parsed = localizedTextSchema.safeParse(typeof value === 'string' ? { vi: value } : value);
      if (!parsed.success) {
        throw Object.assign(new Error(`${column} must be LocalizedText with a non-empty vi value`), { statusCode: 400 });
      }
      body[column] = parsed.data;
    }
  }
  return body;
}

function validateEngineeringMetadata(table: TableDefinition, body: Record<string, unknown>, requireName = false): void {
  if (['md_site', 'md_shopfloor', 'md_production_area', 'md_work_center', 'md_workstation', 'md_equipment', 'md_skill'].includes(table.tableName) && (requireName || body['name'] !== undefined)) {
    const name = body['name'];
    if (!name || typeof name !== 'object' || typeof (name as Record<string, unknown>)['vi'] !== 'string' || !String((name as Record<string, unknown>)['vi']).trim()) {
      throw Object.assign(new Error('name must include a non-empty Vietnamese value'), { statusCode: 400 });
    }
  }
  if (!['md_mbom_header', 'md_routing_header'].includes(table.tableName)) return;
  const name = body['name'];
  if ((requireName || name !== undefined) && (!name || typeof name !== 'object' || typeof (name as Record<string, unknown>)['vi'] !== 'string' || !String((name as Record<string, unknown>)['vi']).trim())) {
    throw Object.assign(new Error('name must include a non-empty Vietnamese value'), { statusCode: 400 });
  }
  for (const field of ['description', 'change_reason', 'engineering_note', 'production_purpose']) {
    if (body[field] !== undefined && body[field] !== null && !localizedTextSchema.safeParse(body[field]).success) {
      throw Object.assign(new Error(`${field} must be valid LocalizedText`), { statusCode: 400 });
    }
  }
  if (typeof body['reference_document'] === 'string' && body['reference_document'].length > 500) throw Object.assign(new Error('reference_document must be at most 500 characters'), { statusCode: 400 });
  if (body['effective_from'] && body['effective_to'] && new Date(String(body['effective_to'])) <= new Date(String(body['effective_from']))) throw Object.assign(new Error('effective_to must be after effective_from'), { statusCode: 400 });
  if (table.tableName === 'md_mbom_header' && body['purpose'] !== undefined && !['Standard', 'Alternate', 'Prototype', 'Rework'].includes(String(body['purpose']))) throw Object.assign(new Error('purpose must be Standard, Alternate, Prototype, or Rework'), { statusCode: 400 });
  if (table.tableName === 'md_routing_header' && body['routing_type'] !== undefined && !['Standard', 'Alternate', 'Rework'].includes(String(body['routing_type']))) throw Object.assign(new Error('routing_type must be Standard, Alternate, or Rework'), { statusCode: 400 });
}

  function eventPayloadFor(table: TableDefinition, row: Record<string, unknown>): Record<string, unknown> {
  const base = {
    master_id: row['master_id'],
    code: row['code'],
    name: row['name'],
    version_no: row['version_no'],
    lifecycle_status: row['lifecycle_status'],
  };
  if (table.tableName === 'md_mbom_header') {
    return { ...base, item_revision_id: row['item_revision_id'], site_id: row['site_id'], base_quantity: row['base_quantity'], base_uom_id: row['base_uom_id'], description: row['description'], business_version: row['business_version'], purpose: row['purpose'], change_reason: row['change_reason'], engineering_note: row['engineering_note'], reference_document: row['reference_document'] };
  }
  if (table.tableName === 'md_routing_header') {
    return { ...base, description: row['description'], business_version: row['business_version'], routing_type: row['routing_type'], production_purpose: row['production_purpose'], change_reason: row['change_reason'], engineering_note: row['engineering_note'], reference_document: row['reference_document'] };
  }
  if (table.tableName === 'md_production_version') {
    return { ...base, item_revision_id: row['item_revision_id'], mbom_header_id: row['mbom_header_id'], routing_header_id: row['routing_header_id'], site_id: row['site_id'] };
  }
  if (table.tableName === 'md_employee') {
    return { ...base, site_id: row['site_id'], default_work_center_id: row['default_work_center_id'], employee_status: row['employee_status'], preferred_locale: row['preferred_locale'] };
  }
  if (table.tableName === 'md_shift') {
    return { ...base, site_id: row['site_id'], start_time: row['start_time'], end_time: row['end_time'], crosses_midnight: row['crosses_midnight'] };
  }
  if (table.tableName === 'md_item_revision') {
    return { ...base, revision_code: row['revision_code'], item_id: row['item_id'], item_type: row['item_type'], site_id: row['site_id'], effective_from: row['effective_from'], effective_to: row['effective_to'], base_uom_id: row['base_uom_id'], item_group: row['item_group'], planning_strategy: row['planning_strategy'], procurement_type: row['procurement_type'], tracking_level: row['tracking_level'], default_scrap_rate: row['default_scrap_rate'] };
  }
  return { ...base, site_id: row['site_id'], item_revision_id: row['item_revision_id'], work_center_id: row['work_center_id'], equipment_type: row['equipment_type'] };
}

function creationEventType(tableName: string): string | null {
  if (tableName === 'md_employee') return 'MES.MasterData.EmployeeCreated.v1';
  if (tableName === 'md_shift') return 'MES.MasterData.ShiftCreated.v1';
  return null;
}

function parseDateOnly(value: unknown, fallback = new Date()): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return fallback.toISOString().slice(0, 10);
}

function eachDate(from: string, to: string, daysOfWeek?: number[]): string[] {
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];
  const allowed = new Set(daysOfWeek);
  const dates: string[] = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const dow = cursor.getUTCDay() === 0 ? 7 : cursor.getUTCDay();
    if (!daysOfWeek || allowed.has(dow)) dates.push(cursor.toISOString().slice(0, 10));
  }
  return dates;
}

export function masterDataRouter(pool: Pool): Router {
  const router = Router();

  router.get('/resources', (_req, res) => {
    res.json({ resources: [...TABLE_BY_RESOURCE.keys()] });
  });

  router.get('/i18n-quality-flags', async (req, res, next) => {
    try {
      const status = typeof req.query['status'] === 'string' ? req.query['status'].toUpperCase() : 'OPEN';
      const limit = Math.min(Number(req.query['limit'] ?? 200), 500);
      const { rows } = await pool.query(
        `SELECT flag_id, table_name, column_name, row_id, flagged_locale, current_value,
                detected_language_guess, confidence, status, flagged_at, resolved_at, resolved_by
         FROM i18n_data_quality_flag
         WHERE status = $1
         ORDER BY table_name, flagged_at DESC
         LIMIT $2`,
        [status, limit],
      );
      res.json({ data: rows });
    } catch (err) {
      return next(err);
    }
  });

  router.patch('/i18n-quality-flags/:id', async (req, res, next) => {
    const context = getContext(req);
    const status = typeof req.body?.status === 'string' ? req.body.status.toUpperCase() : '';
    if (!['RESOLVED', 'DISMISSED'].includes(status)) {
      return res.status(400).json({ error: 'status must be RESOLVED or DISMISSED' });
    }
    try {
      const { rows } = await pool.query(
        `UPDATE i18n_data_quality_flag
         SET status = $1, resolved_at = NOW(), resolved_by = $2
         WHERE flag_id = $3
         RETURNING flag_id, table_name, column_name, row_id, flagged_locale, current_value,
                   detected_language_guess, confidence, status, flagged_at, resolved_at, resolved_by`,
        [status, context.userId, req.params['id']],
      );
      if (!rows[0]) return res.status(404).json({ error: 'Not Found' });
      return res.json(rows[0]);
    } catch (err) {
      return next(err);
    }
  });

  router.post('/production-versions/:id/validate', async (req, res, next) => {
    try {
      const result = await validateProductionVersion(pool, req.params['id'] ?? '');
      res.status(result.valid ? 200 : 422).json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post('/ebom-headers/:id/create-mbom-draft', async (req, res, next) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const header = await client.query('SELECT * FROM md_ebom_header WHERE master_id = $1 AND lifecycle_status = \'Released\'', [req.params['id']]);
      if (!header.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Released EBOM not found' }); }
      const ebom = header.rows[0];
      const mbom = await client.query(`INSERT INTO md_mbom_header (code, name, description, item_revision_id, site_id, business_version, purpose, base_quantity, base_uom_id, effective_from, created_by)
        SELECT $1, e.name, e.description, e.item_revision_id, r.site_id, '1', 'Standard', 1, i.base_uom_id, NOW(), $2
        FROM md_ebom_header e JOIN md_item_revision r ON r.master_id = e.item_revision_id JOIN md_item i ON i.master_id = r.item_id
        WHERE e.master_id = $3 RETURNING *`, [`MBOM-FROM-${ebom.code}`, getContext(req).userId, req.params['id']]);
      const mbomRow = mbom.rows[0];
      if (!mbomRow) throw Object.assign(new Error('Unable to create MBOM draft'), { statusCode: 422 });
      await client.query(`INSERT INTO md_mbom_line (code, name, mbom_header_id, seq, component_revision_id, quantity_per, uom_id, source_ebom_line_id)
        SELECT 'EBOM-' || l.code, l.name, $1, l.seq, l.component_revision_id, l.quantity_per, l.uom_id, l.master_id
        FROM md_ebom_line l WHERE l.ebom_header_id = $2 AND l.lifecycle_status NOT IN ('Inactive','Obsolete') AND l.effective_to IS NULL ORDER BY l.seq`, [mbomRow.master_id, req.params['id']]);
      await client.query('COMMIT');
      return res.status(201).json({ data: mbomRow, mbom_id: mbomRow.master_id, source_ebom_id: req.params['id'], target_route: `/master-data/mboms/${mbomRow.master_id}` });
    } catch (err: any) {
      await client.query('ROLLBACK');
      return next(err);
    } finally { client.release(); }
  });

  router.post('/ebom-headers', async (req, res, next) => {
    const context = getContext(req); const body = normalizeLocalizedFields({ resource: 'ebom-headers', tableName: 'md_ebom_header' }, normalizeBody(req.body)); const client = await pool.connect();
    try {
      const name = localizedTextSchema.safeParse(body['name']);
      if (!name.success) return res.status(422).json({ error: 'EBOM_NAME_REQUIRED' });
      if (!body['item_revision_id']) return res.status(422).json({ error: 'EBOM_ITEM_REVISION_REQUIRED' });
      await client.query('BEGIN'); await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [context.userId]);
      const revision = await client.query(`SELECT r.master_id FROM md_item_revision r WHERE r.master_id = $1 AND r.lifecycle_status NOT IN ('Inactive','Obsolete')`, [body['item_revision_id']]);
      if (!revision.rows[0]) throw Object.assign(new Error('EBOM_ITEM_REVISION_INVALID'), { statusCode: 422 });
      const code = await allocateResourceCode(client, 'EBOM');
      const { rows } = await client.query(`INSERT INTO md_ebom_header (code, name, description, item_revision_id, created_by) VALUES ($1,$2::jsonb,$3::jsonb,$4,$5) RETURNING *`, [code, JSON.stringify(name.data), body['description'] ? JSON.stringify(body['description']) : null, body['item_revision_id'], context.userId]);
      await client.query('COMMIT'); return res.status(201).json({ data: rows[0] });
    } catch (err) { await client.query('ROLLBACK'); return next(err); } finally { client.release(); }
  });

  router.get('/ebom-headers', async (_req, res, next) => {
    try {
      const { rows } = await pool.query(`SELECT e.*, r.revision_code, i.code AS item_code, i.name AS item_name,
        (SELECT COUNT(*)::int FROM md_ebom_line l WHERE l.ebom_header_id = e.master_id AND l.lifecycle_status NOT IN ('Inactive','Obsolete') AND l.effective_to IS NULL) AS current_line_count
        FROM md_ebom_header e JOIN md_item_revision r ON r.master_id = e.item_revision_id JOIN md_item i ON i.master_id = r.item_id ORDER BY e.code, e.version_no`);
      return res.json({ data: rows });
    } catch (err) { return next(err); }
  });

  router.get('/ebom-headers/:id', async (req, res, next) => {
    try {
      const header = await pool.query(`SELECT e.*, r.revision_code, i.code AS item_code, i.name AS item_name FROM md_ebom_header e JOIN md_item_revision r ON r.master_id = e.item_revision_id JOIN md_item i ON i.master_id = r.item_id WHERE e.master_id = $1`, [req.params['id']]);
      if (!header.rows[0]) return res.status(404).json({ error: 'EBOM_NOT_FOUND' });
      const lines = await pool.query(`SELECT l.*, r.revision_code AS component_revision_code, i.code AS component_item_code, i.name AS component_item_name, u.code AS uom_code
        FROM md_ebom_line l JOIN md_item_revision r ON r.master_id = l.component_revision_id JOIN md_item i ON i.master_id = r.item_id JOIN md_uom u ON u.master_id = l.uom_id
        WHERE l.ebom_header_id = $1 AND l.lifecycle_status NOT IN ('Inactive','Obsolete') AND l.effective_to IS NULL ORDER BY l.parent_line_id NULLS FIRST, l.seq, l.code`, [req.params['id']]);
      return res.json({ data: { ...header.rows[0], lines: lines.rows, current_line_count: lines.rows.length } });
    } catch (err) { return next(err); }
  });

  router.put('/ebom-headers/:id/design-tree', async (req, res, next) => {
    const context = getContext(req); const submitted = Array.isArray(req.body?.lines) ? req.body.lines as Record<string, any>[] : []; const client = await pool.connect();
    try {
      await client.query('BEGIN'); await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [context.userId]);
      const header = await client.query(`SELECT master_id, lifecycle_status FROM md_ebom_header WHERE master_id = $1 FOR UPDATE`, [req.params['id']]);
      if (!header.rows[0]) throw Object.assign(new Error('EBOM_NOT_FOUND'), { statusCode: 404 });
      if (header.rows[0].lifecycle_status === 'Released') throw Object.assign(new Error('EBOM_RELEASED_IMMUTABLE'), { statusCode: 409 });
      const keys = submitted.map((line, index) => String(line.line_key || line.master_id || `line-${index + 1}`));
      if (new Set(keys).size !== keys.length) throw Object.assign(new Error('EBOM_LINE_DUPLICATE'), { statusCode: 422 });
      const keySet = new Set(keys); const parentByKey = new Map<string, string | null>(); const siblingSeq = new Set<string>(); const componentByParent = new Set<string>();
      for (const [index, line] of submitted.entries()) {
        const key = keys[index]!; const parent = line.parent_line_id ? String(line.parent_line_id) : null; const seq = Number(line.seq);
        if (parent && parent === key) throw Object.assign(new Error('EBOM_LINE_SELF_PARENT'), { statusCode: 422 });
        if (parent && !keySet.has(parent)) throw Object.assign(new Error('EBOM_PARENT_LINE_INVALID'), { statusCode: 422 });
        if (!line.component_revision_id) throw Object.assign(new Error('EBOM_COMPONENT_REVISION_REQUIRED'), { statusCode: 422 });
        if (!line.uom_id) throw Object.assign(new Error('EBOM_UOM_REQUIRED'), { statusCode: 422 });
        if (!Number.isInteger(seq) || seq <= 0) throw Object.assign(new Error('EBOM_SEQUENCE_INVALID'), { statusCode: 422 });
        if (!Number.isFinite(Number(line.quantity_per)) || Number(line.quantity_per) <= 0) throw Object.assign(new Error('EBOM_QUANTITY_INVALID'), { statusCode: 422 });
        const siblingKey = `${parent || '__root__'}:${seq}`; if (siblingSeq.has(siblingKey)) throw Object.assign(new Error('EBOM_SEQUENCE_DUPLICATE'), { statusCode: 422 }); siblingSeq.add(siblingKey);
        const componentKey = `${parent || '__root__'}:${line.component_revision_id}`; if (componentByParent.has(componentKey)) throw Object.assign(new Error('EBOM_COMPONENT_DUPLICATE'), { statusCode: 422 }); componentByParent.add(componentKey); parentByKey.set(key, parent);
      }
      for (const key of keys) { const visited = new Set<string>(); let cursor: string | null = key; while (cursor) { if (visited.has(cursor)) throw Object.assign(new Error('EBOM_HIERARCHY_CYCLE'), { statusCode: 422 }); visited.add(cursor); cursor = parentByKey.get(cursor) || null; } }
      for (const line of submitted) {
        const revision = await client.query(`SELECT master_id FROM md_item_revision WHERE master_id = $1 AND lifecycle_status NOT IN ('Inactive','Obsolete')`, [line.component_revision_id]);
        if (!revision.rows[0]) throw Object.assign(new Error('EBOM_COMPONENT_REVISION_INVALID'), { statusCode: 422 });
        const uom = await client.query(`SELECT master_id FROM md_uom WHERE master_id = $1 AND lifecycle_status NOT IN ('Inactive','Obsolete')`, [line.uom_id]);
        if (!uom.rows[0]) throw Object.assign(new Error('EBOM_UOM_INVALID'), { statusCode: 422 });
      }
      await client.query(`UPDATE md_ebom_line SET lifecycle_status = 'Inactive', effective_to = NOW(), updated_by = $2, updated_at = NOW() WHERE ebom_header_id = $1 AND lifecycle_status NOT IN ('Inactive','Obsolete') AND effective_to IS NULL`, [req.params['id'], context.userId]);
      const lineIds = new Map<string, string>(); for (const key of keys) { const result = await client.query(`SELECT gen_random_uuid() AS id`); lineIds.set(key, result.rows[0].id); }
      const created: any[] = []; const effectiveFrom = new Date().toISOString();
      for (const [index, line] of submitted.entries()) {
        const key = keys[index]!; const result = await client.query(`INSERT INTO md_ebom_line (master_id, code, name, lifecycle_status, effective_from, ebom_header_id, parent_line_id, seq, component_revision_id, quantity_per, uom_id, reference_designator, note, phantom_design_flag, created_by) VALUES ($1,$2,$3,'Draft',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`, [lineIds.get(key), await allocateResourceCode(client, 'EBL'), String(line.name || 'EBOM component'), effectiveFrom, req.params['id'], line.parent_line_id ? lineIds.get(String(line.parent_line_id)) : null, Number(line.seq), line.component_revision_id, Number(line.quantity_per), line.uom_id, line.reference_designator || null, line.note || null, line.phantom_design_flag === true, context.userId]);
        created.push(result.rows[0]);
      }
      await client.query('COMMIT'); return res.json({ data: created });
    } catch (err: any) { await client.query('ROLLBACK'); if (err?.code === '23505') return res.status(409).json({ error: 'EBOM_LINE_DUPLICATE' }); return next(err); } finally { client.release(); }
  });

  // EBOM lines are a complete design tree. Prevent legacy append/update calls
  // from creating an active state that is different from the submitted tree.
  router.post('/ebom-lines', (_req, res) => res.status(409).json({ error: 'EBOM_TREE_REPLACEMENT_REQUIRED' }));
  router.put('/ebom-lines/:id', (_req, res) => res.status(409).json({ error: 'EBOM_TREE_REPLACEMENT_REQUIRED' }));
  router.delete('/ebom-lines/:id', (_req, res) => res.status(409).json({ error: 'EBOM_TREE_REPLACEMENT_REQUIRED' }));

  router.get('/production-ready-item-revisions', async (req, res, next) => {
    try {
      const search = typeof req.query['search'] === 'string' ? req.query['search'].trim() : '';
      const siteId = typeof req.query['site_id'] === 'string' ? req.query['site_id'] : '';
      const plannedDate = typeof req.query['planned_date'] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query['planned_date']) ? req.query['planned_date'] : new Date().toISOString().slice(0, 10);
      const requestedLimit = Number(req.query['limit'] ?? 50);
      const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50;
      const values: unknown[] = [plannedDate];
      const filters = [
        `i.lifecycle_status = 'Released'`,
        `r.lifecycle_status = 'Released'`,
        `r.effective_from <= $1::DATE AND (r.effective_to IS NULL OR r.effective_to > $1::DATE)`,
        `pv.lifecycle_status = 'Released'`,
        `pv.effective_from <= $1::DATE AND (pv.effective_to IS NULL OR pv.effective_to > $1::DATE)`,
        `mb.lifecycle_status = 'Released'`,
        `mb.effective_from <= $1::DATE AND (mb.effective_to IS NULL OR mb.effective_to > $1::DATE)`,
        `rt.lifecycle_status = 'Released'`,
        `rt.effective_from <= $1::DATE AND (rt.effective_to IS NULL OR rt.effective_to > $1::DATE)`,
      ];
      if (siteId) { values.push(siteId); filters.push(`pv.site_id = $${values.length}`); }
      if (search) {
        values.push(`%${search}%`);
        filters.push(`(i.code ILIKE $${values.length} OR r.name::text ILIKE $${values.length} OR r.revision_code ILIKE $${values.length} OR pv.code ILIKE $${values.length})`);
      }
      const candidates = await pool.query(
        `SELECT i.master_id AS item_id, i.code AS item_code, r.name AS item_name,
                r.master_id AS item_revision_id, r.revision_code, r.lifecycle_status AS revision_status,
                r.effective_from AS revision_effective_from, r.effective_to AS revision_effective_to,
                u.code AS base_uom_code, u.master_id AS base_uom_id,
                pv.master_id AS production_version_id, pv.code AS production_version_code,
                pv.mbom_header_id, mb.code AS mbom_code, mb.name AS mbom_name,
                pv.routing_header_id, rt.code AS routing_code, rt.name AS routing_name,
                pv.site_id, s.code AS site_code
         FROM md_item i
         JOIN md_item_revision r ON r.item_id = i.master_id
         JOIN md_uom u ON u.master_id = r.base_uom_id AND u.lifecycle_status = 'Released'
         JOIN md_production_version pv ON pv.item_revision_id = r.master_id AND pv.site_id = r.site_id
         JOIN md_mbom_header mb ON mb.master_id = pv.mbom_header_id
         JOIN md_routing_header rt ON rt.master_id = pv.routing_header_id
         JOIN md_site s ON s.master_id = pv.site_id
         WHERE ${filters.join(' AND ')}
         ORDER BY i.code, r.revision_code, pv.code
         LIMIT $${values.length + 1}`,
        [...values, limit],
      );
      const ready: Array<Record<string, unknown>> = [];
      for (const candidate of candidates.rows) {
        const validation = await validateProductionVersion(pool, candidate['production_version_id'] as string);
        if (!validation.valid) continue;
        ready.push({ ...candidate, display_code: `${candidate['item_code']}-${candidate['revision_code']}`, readiness_status: 'Ready' });
      }
      return res.json({ data: ready, meta: { planned_date: plannedDate, limit, returned: ready.length } });
    } catch (err) {
      return next(err);
    }
  });

  router.get('/work-centers/:id/headcount', async (req, res, next) => {
    try {
      const workCenterId = req.params['id'];
      const today = parseDateOnly(req.query['date']);
      const defaultCount = await pool.query(
        `SELECT COUNT(*)::INT AS count FROM md_employee WHERE default_work_center_id = $1 AND employee_status = 'Active'`,
        [workCenterId],
      );
      const onShift = await pool.query(
        `SELECT COUNT(*)::INT AS count
         FROM md_employee_shift_schedule s
         JOIN md_shift sh ON sh.master_id = s.shift_id
         JOIN md_employee e ON e.master_id = s.employee_id
         WHERE COALESCE(s.work_center_id, e.default_work_center_id) = $1
           AND s.schedule_date = $2::DATE
           AND s.schedule_status = 'Scheduled'
           AND e.employee_status = 'Active'
           AND (
             (sh.crosses_midnight = FALSE AND LOCALTIME >= sh.start_time::TIME AND LOCALTIME <= sh.end_time::TIME)
             OR
             (sh.crosses_midnight = TRUE AND (LOCALTIME >= sh.start_time::TIME OR LOCALTIME <= sh.end_time::TIME))
           )`,
        [workCenterId, today],
      );
      res.json({ default_headcount: defaultCount.rows[0]?.count ?? 0, on_shift_now_count: onShift.rows[0]?.count ?? 0 });
    } catch (err) {
      next(err);
    }
  });

  router.get('/employee-schedules', async (req, res, next) => {
    try {
      const workCenterId = req.query['work_center_id'];
      const date = parseDateOnly(req.query['date']);
      const params: unknown[] = [date];
      let filter = '';
      if (typeof workCenterId === 'string' && workCenterId) {
        params.push(workCenterId);
        filter = `AND COALESCE(s.work_center_id, e.default_work_center_id) = $2`;
      }
      const { rows } = await pool.query(
        `SELECT s.*, e.code AS employee_code, e.name AS employee_name, e.default_work_center_id,
                sh.code AS shift_code, sh.name AS shift_name, sh.start_time, sh.end_time, sh.crosses_midnight,
                (
                  s.schedule_status = 'Scheduled'
                  AND e.employee_status = 'Active'
                  AND (
                    (sh.crosses_midnight = FALSE AND LOCALTIME >= sh.start_time::TIME AND LOCALTIME <= sh.end_time::TIME)
                    OR
                    (sh.crosses_midnight = TRUE AND (LOCALTIME >= sh.start_time::TIME OR LOCALTIME <= sh.end_time::TIME))
                  )
                ) AS is_on_shift_now
         FROM md_employee_shift_schedule s
         JOIN md_employee e ON e.master_id = s.employee_id
         JOIN md_shift sh ON sh.master_id = s.shift_id
         WHERE s.schedule_date = $1::DATE ${filter}
         ORDER BY e.code`,
        params,
      );
      res.json({ data: rows });
    } catch (err) {
      next(err);
    }
  });

  router.post('/employee-schedules/bulk', async (req, res, next) => {
    const context = getContext(req);
    const body = normalizeBody(req.body);
    const employeeIds = Array.isArray(body['employee_ids']) ? body['employee_ids'].filter((id) => typeof id === 'string') as string[] : [];
    const shiftId = typeof body['shift_id'] === 'string' ? body['shift_id'] : '';
    const workCenterId = typeof body['work_center_id'] === 'string' && body['work_center_id'] ? body['work_center_id'] : null;
    const dateRange = body['date_range'] as Record<string, unknown> | undefined;
    const days = Array.isArray(body['days_of_week']) ? body['days_of_week'].map(Number).filter((day) => day >= 1 && day <= 7) : undefined;
    const dates = eachDate(parseDateOnly(dateRange?.['from']), parseDateOnly(dateRange?.['to']), days?.length ? days : undefined);
    if (employeeIds.length === 0 || !shiftId || dates.length === 0) {
      return res.status(400).json({ error: 'employee_ids, shift_id, and a valid date_range are required' });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [context.userId]);
      if (body['workstation_id']) {
        const workstation = await client.query(`SELECT site_id, work_center_id FROM md_workstation WHERE master_id = $1`, [body['workstation_id']]);
        if (!workstation.rows[0]) throw Object.assign(new Error('WORKSTATION_NOT_FOUND'), { statusCode: 422 });
        body['site_id'] = workstation.rows[0].site_id;
        body['work_center_id'] = workstation.rows[0].work_center_id;
      }
      if (body['machine_group_id']) {
        const group = await client.query(`SELECT workstation_id, site_id, work_center_id FROM md_workstation_machine_group WHERE master_id = $1 AND workstation_id = $2`, [body['machine_group_id'], body['workstation_id']]);
        if (!group.rows[0]) throw Object.assign(new Error('MACHINE_GROUP_NOT_FOUND'), { statusCode: 422 });
        body['site_id'] = group.rows[0].site_id;
        body['work_center_id'] = group.rows[0].work_center_id;
      }
      const results: Array<Record<string, unknown>> = [];
      for (const employeeId of employeeIds) {
        for (const scheduleDate of dates) {
          const { rows } = await client.query(
            `INSERT INTO md_employee_shift_schedule (employee_id, shift_id, work_center_id, schedule_date, created_by)
             VALUES ($1, $2, $3, $4::DATE, $5)
             ON CONFLICT (employee_id, schedule_date) DO NOTHING
             RETURNING schedule_id`,
            [employeeId, shiftId, workCenterId, scheduleDate, context.userId],
          );
          results.push({
            employee_id: employeeId,
            schedule_date: scheduleDate,
            status: rows[0] ? 'created' : 'skipped-conflict',
            schedule_id: rows[0]?.['schedule_id'] ?? null,
          });
        }
      }
      const createdIds = results.filter((row) => row['status'] === 'created').map((row) => row['schedule_id']);
      const eventType = 'MES.MasterData.EmployeeScheduleAssigned.v1';
      await writeToOutbox(client, {
        topic: eventType,
        envelope: createEventEnvelope({
          event_type: eventType,
          source_service: SERVICE_NAME,
          trace_id: context.traceId,
          payload: { schedule_ids: createdIds, employee_ids: employeeIds, shift_id: shiftId, work_center_id: workCenterId, date_range: { from: dates[0], to: dates[dates.length - 1] } },
        }),
      });
      await client.query('COMMIT');
      return res.status(201).json({ data: results, created_count: createdIds.length, skipped_count: results.length - createdIds.length });
    } catch (err) {
      await client.query('ROLLBACK');
      return next(err);
    } finally {
      client.release();
    }
  });

  router.get('/employees/:id/skills', async (req, res, next) => {
    try {
      const { rows } = await pool.query(
        `SELECT es.*, s.code AS skill_code, s.name AS skill_name
         FROM md_employee_skill es
         JOIN md_skill s ON s.master_id = es.skill_id
         WHERE es.employee_id = $1 AND es.active_flag = TRUE AND es.effective_to IS NULL
           AND s.scope = 'Employee' AND s.legacy_flag = FALSE
         ORDER BY s.code, es.effective_from DESC`,
        [req.params['id']],
      );
      res.json({ data: rows });
    } catch (err) {
      next(err);
    }
  });

  router.put('/employees/:id/skills', async (req, res, next) => {
    const context = getContext(req);
    const skills = Array.isArray(req.body?.skills) ? req.body.skills : [];
    const normalized: Array<{ skill_id: string; level: string; qualification_status: string; expires_at: string | null }> = skills
      .filter((item: any) => typeof item?.skill_id === 'string' && typeof item?.level === 'string')
      .map((item: any) => ({ skill_id: item.skill_id, level: item.level, qualification_status: item.qualification_status || 'Active', expires_at: item.expires_at || null }));
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [context.userId]);
      const employee = await client.query(`SELECT master_id FROM md_employee WHERE master_id = $1`, [req.params['id']]);
      if (!employee.rows[0]) throw Object.assign(new Error('EMPLOYEE_NOT_FOUND'), { statusCode: 404 });
      const validSkills = await client.query(`SELECT master_id FROM md_skill WHERE scope = 'Employee' AND legacy_flag = FALSE AND lifecycle_status NOT IN ('Inactive','Obsolete') AND master_id = ANY($1::uuid[])`, [normalized.map((item) => item.skill_id)]);
      if (validSkills.rows.length !== normalized.length) throw Object.assign(new Error('WORKER_SKILL_INVALID_OR_INACTIVE'), { statusCode: 422 });
      const current = await client.query(`SELECT skill_id FROM md_employee_skill WHERE employee_id = $1 AND active_flag = TRUE AND effective_to IS NULL`, [req.params['id']]);
      const wanted = new Set(normalized.map((item) => item.skill_id));
      for (const row of current.rows) {
        if (!wanted.has(row.skill_id)) await client.query(`UPDATE md_employee_skill SET active_flag = FALSE, effective_to = NOW(), ended_by = $2, ended_at = NOW(), updated_by = $2, updated_at = NOW() WHERE employee_id = $1 AND skill_id = $3 AND active_flag = TRUE AND effective_to IS NULL`, [req.params['id'], context.userId, row.skill_id]);
      }
      for (const skill of normalized) {
        const existing = await client.query(`SELECT 1 FROM md_employee_skill WHERE employee_id = $1 AND skill_id = $2 AND active_flag = TRUE AND effective_to IS NULL`, [req.params['id'], skill.skill_id]);
        if (existing.rows[0]) await client.query(`UPDATE md_employee_skill SET level = $3, qualification_status = $4, expires_at = $5, updated_by = $6, updated_at = NOW() WHERE employee_id = $1 AND skill_id = $2 AND active_flag = TRUE AND effective_to IS NULL`, [req.params['id'], skill.skill_id, skill.level, skill.qualification_status, skill.expires_at, context.userId]);
        else await client.query(`INSERT INTO md_employee_skill (employee_id, skill_id, level, qualification_status, expires_at, created_by) VALUES ($1, $2, $3, $4, $5, $6)`, [req.params['id'], skill.skill_id, skill.level, skill.qualification_status, skill.expires_at, context.userId]);
      }
      const employeeSkills = await client.query(`SELECT es.skill_id, es.level, es.qualification_status, es.expires_at, s.code, s.name FROM md_employee_skill es JOIN md_skill s ON s.master_id = es.skill_id WHERE es.employee_id = $1 AND es.active_flag = TRUE AND es.effective_to IS NULL`, [req.params['id']]);
      const skillEventType = 'MES.MasterData.EmployeeSkillAssigned.v1';
      await writeToOutbox(client, {
        topic: skillEventType,
        envelope: createEventEnvelope({
          event_type: skillEventType,
          source_service: SERVICE_NAME,
          trace_id: context.traceId,
          payload: { employee_id: req.params['id'], skills: employeeSkills.rows },
        }),
      });
      await client.query('COMMIT');
      return res.json({ data: normalized, count: normalized.length });
    } catch (err) {
      await client.query('ROLLBACK');
      return next(err);
    } finally {
      client.release();
    }
  });

  // Worker skills intentionally use Employee scope and have a separate API from resource skills.
  router.get('/worker-skills', async (_req, res, next) => {
    try {
      const { rows } = await pool.query(`SELECT s.*, sg.code AS skill_group_code, sg.name AS skill_group_name,
        (SELECT COUNT(*)::int FROM md_employee_skill es WHERE es.skill_id = s.master_id AND es.active_flag = TRUE AND es.effective_to IS NULL) AS active_assignment_count
        FROM md_skill s LEFT JOIN md_skill_group sg ON sg.skill_group_id = s.skill_group_id
        WHERE s.scope = 'Employee' AND s.legacy_flag = FALSE
        ORDER BY s.code`);
      return res.json({ data: rows });
    } catch (err) { return next(err); }
  });

  router.post('/worker-skills', async (req, res, next) => {
    const context = getContext(req); const body = normalizeBody(req.body);
    try {
      if (!localizedTextSchema.safeParse(body['name']).success) return res.status(422).json({ error: 'WORKER_SKILL_NAME_REQUIRED' });
      const duplicate = await pool.query(`SELECT 1 FROM md_skill WHERE scope = 'Employee' AND legacy_flag = FALSE AND lifecycle_status NOT IN ('Inactive','Obsolete') AND lower(COALESCE(name->>'vi', name->>'en', name->>'ja', name->>'ko')) = lower(COALESCE($1::jsonb->>'vi', $1::jsonb->>'en', $1::jsonb->>'ja', $1::jsonb->>'ko'))`, [JSON.stringify(body['name'])]);
      if (duplicate.rows[0]) return res.status(409).json({ error: 'SKILL_DUPLICATE' });
      const client = await pool.connect();
      try {
        const code = await allocateResourceCode(client, 'SK-EMP');
        const { rows } = await client.query(`INSERT INTO md_skill (code, name, description, skill_group, minimum_level, skill_group_id, scope, legacy_flag, lifecycle_status, effective_from, created_by) VALUES ($1,$2::jsonb,$3::jsonb,'Employee',$4,NULL,'Employee',FALSE,'Released',NOW(),$5) RETURNING *`, [code, JSON.stringify(body['name']), body['description'] ? JSON.stringify(body['description']) : null, body['minimum_level'] || 'L1', context.userId]);
        return res.status(201).json({ data: rows[0] });
      } finally { client.release(); }
    } catch (err) { return next(err); }
  });

  router.get('/worker-skills/:id/dependencies', async (req, res, next) => {
    try {
      const [assignments, operationRequirements, productionStandards] = await Promise.all([
        pool.query(`SELECT COUNT(*)::int AS count FROM md_employee_skill WHERE skill_id = $1 AND active_flag = TRUE AND effective_to IS NULL`, [req.params['id']]),
        pool.query(`SELECT COUNT(*)::int AS count FROM md_operation_skill_requirement WHERE skill_id = $1 AND active_flag = TRUE AND (effective_to IS NULL OR effective_to > NOW())`, [req.params['id']]),
        pool.query(`SELECT COUNT(*)::int AS count FROM md_production_standard WHERE skill_id = $1 AND active_flag = TRUE`, [req.params['id']]).catch(() => ({ rows: [{ count: 0 }] })),
      ]);
      return res.json({ data: { active_assignments: assignments.rows[0]?.count || 0, operation_skill_requirements: operationRequirements.rows[0]?.count || 0, production_standards: productionStandards.rows[0]?.count || 0 } });
    } catch (err) { return next(err); }
  });

  router.get('/skills/:id/dependencies', async (req, res, next) => {
    try {
      const [resourceAssignments, employeeAssignments, operationRequirements, productionStandards] = await Promise.all([
        pool.query(`SELECT COUNT(*)::int AS count FROM md_resource_skill_assignment WHERE skill_id = $1 AND active_flag = TRUE AND effective_to IS NULL`, [req.params['id']]),
        pool.query(`SELECT COUNT(*)::int AS count FROM md_employee_skill WHERE skill_id = $1 AND active_flag = TRUE AND effective_to IS NULL`, [req.params['id']]),
        pool.query(`SELECT COUNT(*)::int AS count FROM md_operation_skill_requirement WHERE skill_id = $1 AND active_flag = TRUE AND (effective_to IS NULL OR effective_to > NOW())`, [req.params['id']]),
        pool.query(`SELECT COUNT(*)::int AS count FROM md_production_standard WHERE skill_id = $1 AND active_flag = TRUE`, [req.params['id']]).catch(() => ({ rows: [{ count: 0 }] })),
      ]);
      const data = {
        resource_assignments: resourceAssignments.rows[0]?.count || 0,
        employee_assignments: employeeAssignments.rows[0]?.count || 0,
        operation_skill_requirements: operationRequirements.rows[0]?.count || 0,
        production_standards: productionStandards.rows[0]?.count || 0,
      };
      return res.json({ data: { ...data, referenced: Object.values(data).some((count) => count > 0) } });
    } catch (err) { return next(err); }
  });

  router.get('/worker-skills/:id/assignments', async (req, res, next) => {
    try {
      const { rows } = await pool.query(`SELECT es.*, e.code AS employee_code, e.name AS employee_name, s.code AS skill_code, s.name AS skill_name FROM md_employee_skill es JOIN md_employee e ON e.master_id = es.employee_id JOIN md_skill s ON s.master_id = es.skill_id WHERE es.skill_id = $1 ORDER BY es.active_flag DESC, e.code, es.effective_from DESC`, [req.params['id']]);
      return res.json({ data: rows });
    } catch (err) { return next(err); }
  });

  router.post('/worker-skills/:id/assignments', async (req, res, next) => {
    const context = getContext(req); const body = normalizeBody(req.body);
    const client = await pool.connect();
    try {
      if (!body['employee_id'] || !body['level']) return res.status(422).json({ error: 'WORKER_ASSIGNMENT_REQUIRED' });
      await client.query('BEGIN'); await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [context.userId]);
      const skill = await client.query(`SELECT master_id FROM md_skill WHERE master_id = $1 AND scope = 'Employee' AND legacy_flag = FALSE AND lifecycle_status NOT IN ('Inactive','Obsolete')`, [req.params['id']]);
      if (!skill.rows[0]) throw Object.assign(new Error('WORKER_SKILL_INVALID_OR_INACTIVE'), { statusCode: 422 });
      const employee = await client.query(`SELECT master_id FROM md_employee WHERE master_id = $1`, [body['employee_id']]);
      if (!employee.rows[0]) throw Object.assign(new Error('EMPLOYEE_NOT_FOUND'), { statusCode: 404 });
      await client.query(`UPDATE md_employee_skill SET active_flag = FALSE, effective_to = NOW(), ended_by = $3, ended_at = NOW(), updated_by = $3, updated_at = NOW() WHERE employee_id = $1 AND skill_id = $2 AND active_flag = TRUE AND effective_to IS NULL`, [body['employee_id'], req.params['id'], context.userId]);
      const { rows } = await client.query(`INSERT INTO md_employee_skill (employee_id, skill_id, level, qualification_status, certificate_code, certified_at, expires_at, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [body['employee_id'], req.params['id'], body['level'], body['qualification_status'] || 'Active', body['certificate_code'] || null, body['certified_at'] || null, body['expires_at'] || null, context.userId]);
      await client.query('COMMIT'); return res.status(201).json({ data: rows[0] });
    } catch (err: any) {
      await client.query('ROLLBACK');
      return next(err);
    } finally { client.release(); }
  });

  router.post('/worker-skills/:id/assignments/:employeeId/end', async (req, res, next) => {
    const context = getContext(req);
    try {
      const { rows } = await pool.query(`UPDATE md_employee_skill SET active_flag = FALSE, effective_to = NOW(), ended_by = $3, ended_at = NOW(), updated_by = $3, updated_at = NOW() WHERE skill_id = $1 AND employee_id = $2 AND active_flag = TRUE AND effective_to IS NULL RETURNING *`, [req.params['id'], req.params['employeeId'], context.userId]);
      if (!rows[0]) return res.status(404).json({ error: 'ACTIVE_ASSIGNMENT_NOT_FOUND' });
      return res.json({ data: rows[0] });
    } catch (err) { return next(err); }
  });

  router.put('/worker-skills/:id', async (req, res, next) => {
    const body = normalizeBody(req.body);
    try {
      const allowed = ['name', 'description', 'minimum_level', 'lifecycle_status'];
      const columns = allowed.filter((column) => body[column] !== undefined);
      if (body['scope'] || body['skill_group_id']) return res.status(409).json({ error: 'WORKER_SKILL_SCOPE_IMMUTABLE' });
      if (body['name'] !== undefined && !localizedTextSchema.safeParse(body['name']).success) return res.status(422).json({ error: 'WORKER_SKILL_NAME_INVALID' });
      if (!columns.length) return res.status(400).json({ error: 'No update fields provided' });
      if (body['name'] !== undefined) {
        const duplicate = await pool.query(`SELECT 1 FROM md_skill WHERE scope = 'Employee' AND legacy_flag = FALSE AND master_id <> $2 AND lifecycle_status NOT IN ('Inactive','Obsolete') AND lower(COALESCE(name->>'vi', name->>'en', name->>'ja', name->>'ko')) = lower(COALESCE($1::jsonb->>'vi', $1::jsonb->>'en', $1::jsonb->>'ja', $1::jsonb->>'ko'))`, [JSON.stringify(body['name']), req.params['id']]);
        if (duplicate.rows[0]) return res.status(409).json({ error: 'SKILL_DUPLICATE' });
      }
      const values = columns.map((column) => body[column]);
      const { rows } = await pool.query(`UPDATE md_skill SET ${columns.map((column, index) => `${column} = $${index + 1}${['name','description'].includes(column) ? '::jsonb' : ''}`).join(', ')}, updated_at = NOW() WHERE master_id = $${columns.length + 1} AND scope = 'Employee' AND legacy_flag = FALSE RETURNING *`, [...values.map((value, index) => ['name','description'].includes(columns[index] || '') ? JSON.stringify(value) : value), String(req.params['id'])]);
      if (!rows[0]) return res.status(404).json({ error: 'WORKER_SKILL_NOT_FOUND' });
      return res.json({ data: rows[0] });
    } catch (err) { return next(err); }
  });

  router.delete('/worker-skills/:id', async (req, res, next) => {
    try {
      const dependency = await pool.query(`SELECT (EXISTS (SELECT 1 FROM md_employee_skill WHERE skill_id = $1) OR EXISTS (SELECT 1 FROM md_operation_skill_requirement WHERE skill_id = $1) OR EXISTS (SELECT 1 FROM md_production_standard WHERE skill_id = $1)) AS used`, [req.params['id']]);
      if (dependency.rows[0]?.used) return res.status(409).json({ error: 'SKILL_REFERENCED', message: 'Referenced worker skills cannot be deleted; deactivate the skill instead.' });
      const { rows } = await pool.query(`DELETE FROM md_skill WHERE master_id = $1 AND scope = 'Employee' AND legacy_flag = FALSE RETURNING master_id`, [req.params['id']]);
      if (!rows[0]) return res.status(404).json({ error: 'WORKER_SKILL_NOT_FOUND' });
      return res.json({ deleted: true });
    } catch (err) { return next(err); }
  });

  router.post('/items', async (req, res, next) => {
    const context = getContext(req);
    const body = normalizeBody(req.body);
    const code = String(body['code'] || '').trim();
    const name = body['name'];
    if (!code || !localizedTextSchema.safeParse(name).success) return res.status(400).json({ error: 'code and a localized name with a non-empty vi value are required' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [context.userId]);
      const siteResult = await client.query(`SELECT master_id FROM md_site WHERE lifecycle_status = 'Released' ORDER BY code LIMIT 1`);
      const siteId = String(body['site_id'] || siteResult.rows[0]?.master_id || '');
      if (!siteId) throw Object.assign(new Error('A released site is required to create an Item Revision'), { statusCode: 422 });
      const itemResult = await client.query(`
        INSERT INTO md_item (code, name, item_group, item_type, base_uom_id, effective_from, created_by)
        VALUES ($1, $2::jsonb, $3, $4, $5, COALESCE($6::timestamptz, NOW()), $7)
        RETURNING *
      `, [code, JSON.stringify(name), body['item_group'] || 'General', body['item_type'] || 'FG', body['base_uom_id'], body['effective_from'] || null, context.userId]);
      const item = itemResult.rows[0] as Record<string, unknown>;
      const allocation = await allocateItemRevisionCode(client, String(item['master_id']), code);
      const revisionResult = await client.query(`
        INSERT INTO md_item_revision (
          code, name, version_no, lifecycle_status, effective_from, created_by, item_id, revision_code, site_id,
          is_default, item_group, base_uom_id, planning_strategy, procurement_type, tracking_level, default_scrap_rate,
          specification_ref, change_reason
        ) VALUES ($1, $2::jsonb, $3, 'Draft', $4::timestamptz, $5, $6, $7, $8, TRUE, $9, $10, $11, $12, $13, $14, $15, NULL)
        RETURNING *
      `, [allocation.revisionCode, JSON.stringify(name), allocation.revisionNo, body['effective_from'] || new Date().toISOString(), context.userId, item['master_id'], allocation.revisionCode, siteId, body['item_group'] || 'General', body['base_uom_id'], body['planning_strategy'] || 'MakeToStock', body['procurement_type'] || (body['item_type'] === 'RM' ? 'Buy' : 'Make'), body['tracking_level'] || 'None', body['default_scrap_rate'] || 0, body['specification_ref'] || null]);
      await client.query('COMMIT');
      return res.status(201).json({ ...item, revision: revisionResult.rows[0] });
    } catch (err: any) {
      await client.query('ROLLBACK');
      if (err?.code === '23505') return res.status(409).json({ error: 'Item code or UOM sign already exists' });
      return next(err);
    } finally {
      client.release();
    }
  });

  router.post('/items/:id/revisions', async (req, res, next) => {
    const context = getContext(req);
    const body = normalizeBody(req.body);
    const changeReason = String(body['change_reason'] || '').trim();
    const effectiveFrom = new Date(String(body['effective_from'] || ''));
    if (!changeReason) return res.status(400).json({ error: 'change_reason is required for a successor revision' });
    if (Number.isNaN(effectiveFrom.getTime()) || effectiveFrom.getTime() < Date.now()) return res.status(422).json({ error: 'effective_from must be now or later' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [context.userId]);
      const currentResult = await client.query(`SELECT r.*, i.code AS item_code FROM md_item_revision r JOIN md_item i ON i.master_id = r.item_id WHERE r.item_id = $1 ORDER BY r.version_no DESC LIMIT 1 FOR UPDATE`, [req.params['id']]);
      const current = currentResult.rows[0] as Record<string, unknown> | undefined;
      if (!current) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Item not found' }); }
      const allocation = await allocateItemRevisionCode(client, String(current['item_id']), String(current['item_code']));
      const revisionResult = await client.query(`
        INSERT INTO md_item_revision (code, name, version_no, lifecycle_status, effective_from, created_by, item_id, revision_code, site_id, is_default, item_group, base_uom_id, planning_strategy, procurement_type, tracking_level, default_scrap_rate, specification_ref, change_reason, previous_revision_id)
        VALUES ($1, $2::jsonb, $3, 'Draft', $4, $5, $6, $7, $8, FALSE, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        RETURNING *
      `, [allocation.revisionCode, JSON.stringify(body['name'] || current['name']), allocation.revisionNo, effectiveFrom.toISOString(), context.userId, current['item_id'], allocation.revisionCode, current['site_id'], body['item_group'] || current['item_group'], body['base_uom_id'] || current['base_uom_id'], body['planning_strategy'] || current['planning_strategy'], body['procurement_type'] || current['procurement_type'], body['tracking_level'] || current['tracking_level'], body['default_scrap_rate'] ?? current['default_scrap_rate'], body['specification_ref'] || current['specification_ref'] || null, changeReason, current['master_id']]);
      await client.query('COMMIT');
      return res.status(201).json({ data: revisionResult.rows[0], previous_revision_id: current['master_id'] });
    } catch (err) { await client.query('ROLLBACK'); return next(err); } finally { client.release(); }
  });

  router.get('/resource-assignments', async (req, res, next) => {
    try {
      const limit = Math.min(Math.max(Number(req.query['limit'] ?? 200), 1), 500);
      const { rows } = await pool.query(`
        SELECT ra.*, wc.code AS work_center_code, wc.name AS work_center_name,
               ws.code AS workstation_code, ws.name AS workstation_name,
               eq.code AS equipment_code, eq.name AS equipment_name,
               s.code AS site_code, s.name AS site_name
        FROM md_resource_assignment ra
        JOIN md_work_center wc ON wc.master_id = ra.work_center_id
        LEFT JOIN md_workstation ws ON ws.master_id = ra.workstation_id
        LEFT JOIN md_equipment eq ON eq.master_id = ra.equipment_id
        JOIN md_site s ON s.master_id = ra.site_id
        ORDER BY ra.effective_from DESC, ra.code
        LIMIT $1`, [limit]);
      return res.json({ data: rows });
    } catch (err) { return next(err); }
  });

  router.get('/shopfloors/:id', async (req, res, next) => {
    try {
      const detail = await pool.query(`SELECT sf.*, s.code AS site_code, s.name AS site_name FROM md_shopfloor sf JOIN md_site s ON s.master_id = sf.site_id WHERE sf.master_id = $1`, [req.params['id']]);
      if (!detail.rows[0]) return res.status(404).json({ error: 'Not Found' });
      const workCenters = await pool.query(`SELECT wc.*, s.code AS site_code, sf.code AS shopfloor_code FROM md_work_center wc JOIN md_site s ON s.master_id = wc.site_id LEFT JOIN md_shopfloor sf ON sf.master_id = wc.shopfloor_id WHERE wc.shopfloor_id = $1 ORDER BY wc.code`, [req.params['id']]);
      return res.json({ data: { ...detail.rows[0], work_centers: workCenters.rows } });
    } catch (err) { return next(err); }
  });

  router.get('/machines/:id/units', async (req, res, next) => {
    try {
      const { rows } = await pool.query(`SELECT mu.*, eq.code AS machine_code, eq.name AS machine_name FROM md_machine_unit mu JOIN md_equipment eq ON eq.master_id = mu.machine_id WHERE mu.machine_id = $1 ORDER BY mu.unit_sequence`, [req.params['id']]);
      return res.json({ data: rows });
    } catch (err) { return next(err); }
  });

  router.get('/workstations/:id/machine-groups', async (req, res, next) => {
    try {
      const { rows } = await pool.query(`SELECT mg.*, s.code AS site_code, sf.code AS shopfloor_code, wc.code AS work_center_code, ws.code AS workstation_code FROM md_workstation_machine_group mg JOIN md_site s ON s.master_id = mg.site_id JOIN md_shopfloor sf ON sf.master_id = mg.shopfloor_id JOIN md_work_center wc ON wc.master_id = mg.work_center_id JOIN md_workstation ws ON ws.master_id = mg.workstation_id WHERE mg.workstation_id = $1 AND mg.lifecycle_status NOT IN ('Inactive','Obsolete') AND (mg.effective_to IS NULL OR mg.effective_to > NOW()) ORDER BY mg.code`, [req.params['id']]);
      for (const group of rows) {
        const members = await pool.query(`SELECT ra.master_id, ra.machine_group_id, ra.equipment_id AS machine_id, eq.code AS machine_code, eq.name AS machine_name, ra.machine_unit_id, mu.code AS machine_unit_code, mu.execution_status, ra.assignment_role AS role, ra.requirement_type, ra.sequence_no, ra.effective_from, ra.effective_to FROM md_resource_assignment ra JOIN md_equipment eq ON eq.master_id = ra.equipment_id LEFT JOIN md_machine_unit mu ON mu.machine_unit_id = ra.machine_unit_id WHERE ra.machine_group_id = $1 ORDER BY ra.sequence_no, ra.effective_from`, [group.master_id]);
        group.members = members.rows;
        const requirements = await pool.query(`SELECT r.*, eq.code AS machine_code, eq.name AS machine_name FROM md_workstation_machine_requirement r JOIN md_equipment eq ON eq.master_id = r.machine_id WHERE r.machine_group_id = $1 AND r.active_flag = TRUE AND (r.effective_to IS NULL OR r.effective_to > NOW()) ORDER BY r.sequence_no`, [group.master_id]);
        group.requirements = requirements.rows;
      }
      return res.json({ data: rows });
    } catch (err) { return next(err); }
  });

  router.get('/workstations/:id/operation-capabilities', async (req, res, next) => {
    try {
      const { rows } = await pool.query(`SELECT c.*, o.code AS operation_code, o.name AS operation_name FROM md_workstation_operation_capability c JOIN md_operation o ON o.master_id = c.operation_id WHERE c.workstation_id = $1 AND c.active_flag = TRUE AND (c.effective_to IS NULL OR c.effective_to > NOW()) ORDER BY c.effective_from DESC, o.code`, [req.params['id']]);
      return res.json({ data: rows });
    } catch (err) { return next(err); }
  });

  router.post('/workstations/:id/operation-capabilities', async (req, res, next) => {
    const context = getContext(req); const body = normalizeBody(req.body);
    try {
      const workstation = await pool.query(`SELECT master_id, active_flag FROM md_workstation WHERE master_id = $1`, [req.params['id']]);
      if (!workstation.rows[0] || workstation.rows[0].active_flag !== true) return res.status(422).json({ error: 'WORKSTATION_NOT_FOUND_OR_INACTIVE' });
      if (!body['operation_id'] || Number(body['cycle_time_sec']) <= 0) return res.status(422).json({ error: 'WORKSTATION_CAPABILITY_TIMING_REQUIRED' });
      const { rows } = await pool.query(`INSERT INTO md_workstation_operation_capability (workstation_id, operation_id, cycle_time_sec, setup_time_min, base_quantity, efficiency_factor, scheduling_mode, effective_from, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [req.params['id'], body['operation_id'], Number(body['cycle_time_sec']), Number(body['setup_time_min'] || 0), Number(body['base_quantity'] || 1), Number(body['efficiency_factor'] || 1), body['scheduling_mode'] || 'Finite', body['effective_from'] || new Date().toISOString(), context.userId]);
      return res.status(201).json({ data: rows[0] });
    } catch (err: any) { if (err?.code === '23505') return res.status(409).json({ error: 'WORKSTATION_CAPABILITY_DUPLICATE' }); return next(err); }
  });

  router.put('/workstations/:id/operation-capabilities', async (req, res, next) => {
    const context = getContext(req); const entries = Array.isArray(req.body?.capabilities) ? req.body.capabilities as Record<string, any>[] : []; const client = await pool.connect();
    try {
      await client.query('BEGIN'); await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [context.userId]);
      const workstation = await client.query(`SELECT master_id, active_flag FROM md_workstation WHERE master_id = $1 FOR UPDATE`, [req.params['id']]);
      if (!workstation.rows[0] || workstation.rows[0].active_flag !== true) throw Object.assign(new Error('WORKSTATION_NOT_FOUND_OR_INACTIVE'), { statusCode: 422 });
      await client.query(`UPDATE md_workstation_operation_capability SET active_flag = FALSE, effective_to = NOW(), updated_by = $2, updated_at = NOW() WHERE workstation_id = $1 AND active_flag = TRUE AND (effective_to IS NULL OR effective_to > NOW())`, [req.params['id'], context.userId]);
      const created: Record<string, any>[] = [];
      const seenOperationIds = new Set<string>();
      const replacementNow = new Date();
      for (const entry of entries) {
        if (!entry.operation_id || Number(entry.cycle_time_sec) <= 0) throw Object.assign(new Error('WORKSTATION_CAPABILITY_TIMING_REQUIRED'), { statusCode: 422 });
        if (seenOperationIds.has(String(entry.operation_id))) throw Object.assign(new Error('WORKSTATION_CAPABILITY_DUPLICATE'), { statusCode: 409 });
        seenOperationIds.add(String(entry.operation_id));
        const requestedEffectiveFrom = entry.effective_from ? new Date(String(entry.effective_from)) : replacementNow;
        const effectiveFrom = requestedEffectiveFrom > replacementNow ? requestedEffectiveFrom : replacementNow;
        const result = await client.query(`INSERT INTO md_workstation_operation_capability (workstation_id, operation_id, cycle_time_sec, setup_time_min, base_quantity, efficiency_factor, scheduling_mode, effective_from, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [req.params['id'], entry.operation_id, Number(entry.cycle_time_sec), Number(entry.setup_time_min || 0), Number(entry.base_quantity || 1), Number(entry.efficiency_factor || 1), entry.scheduling_mode || 'Finite', effectiveFrom.toISOString(), context.userId]);
        created.push(result.rows[0]);
      }
      await client.query('COMMIT'); return res.json({ data: created });
    } catch (err: any) { await client.query('ROLLBACK'); if (err?.code === '23505') return res.status(409).json({ error: 'WORKSTATION_CAPABILITY_DUPLICATE' }); return next(err); } finally { client.release(); }
  });

  router.put('/workstations/:id/machine-groups', async (req, res, next) => {
    const context = getContext(req); const client = await pool.connect();
    try {
      const groups = Array.isArray(req.body?.groups) ? req.body.groups : [];
      if (!groups.length) return res.status(422).json({ error: 'AT_LEAST_ONE_MACHINE_GROUP_REQUIRED' });
      await client.query('BEGIN'); await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [context.userId]);
      await client.query(`UPDATE md_resource_assignment SET effective_to = NOW(), updated_by = $2, updated_at = NOW() WHERE workstation_id = $1 AND effective_to IS NULL`, [req.params['id'], context.userId]);
      await client.query(`UPDATE md_workstation_machine_requirement SET active_flag = FALSE, effective_to = NOW(), ended_by = $2, ended_at = NOW(), updated_by = $2, updated_at = NOW() WHERE machine_group_id IN (SELECT master_id FROM md_workstation_machine_group WHERE workstation_id = $1 AND lifecycle_status NOT IN ('Inactive','Obsolete')) AND active_flag = TRUE AND effective_to IS NULL`, [req.params['id'], context.userId]);
      await client.query(`UPDATE md_workstation_machine_group SET lifecycle_status = 'Inactive', effective_to = NOW(), updated_by = $2, updated_at = NOW() WHERE workstation_id = $1 AND lifecycle_status NOT IN ('Inactive','Obsolete')`, [req.params['id'], context.userId]);
      const created = await persistMachineGroups(client, req.params['id'], groups, context);
      await client.query('COMMIT'); return res.json({ data: created });
    } catch (err: any) {
      await client.query('ROLLBACK');
      if (err?.code === '23P01') return res.status(409).json({ error: 'MACHINE_UNIT_ALREADY_ASSIGNED', message: 'A physical machine unit is already assigned to another active Primary requirement.' });
      return next(err);
    } finally { client.release(); }
  });

  router.get('/machines/:id/change-impact', async (req, res, next) => {
    try {
      const [requirements, assignments, capabilities] = await Promise.all([
        pool.query(`SELECT r.requirement_id, r.machine_group_id, r.role, r.required_quantity, r.requirement_type, mg.code AS machine_group_code, ws.code AS workstation_code FROM md_workstation_machine_requirement r JOIN md_workstation_machine_group mg ON mg.master_id = r.machine_group_id JOIN md_workstation ws ON ws.master_id = mg.workstation_id WHERE r.machine_id = $1 AND r.active_flag = TRUE AND (r.effective_to IS NULL OR r.effective_to > NOW())`, [req.params['id']]),
        pool.query(`SELECT ra.master_id, ra.code, ra.assignment_role, ra.workstation_id, ws.code AS workstation_code FROM md_resource_assignment ra LEFT JOIN md_workstation ws ON ws.master_id = ra.workstation_id WHERE ra.equipment_id = $1 AND (ra.effective_to IS NULL OR ra.effective_to > NOW())`, [req.params['id']]),
        pool.query(`SELECT rc.master_id, rc.code, wc.code AS work_center_code FROM md_resource_capability rc JOIN md_work_center wc ON wc.master_id = rc.work_center_id WHERE rc.equipment_id = $1 AND rc.active_flag = TRUE`, [req.params['id']]),
      ]);
      const requiredQuantity = requirements.rows.filter((row) => row.requirement_type === 'Required').reduce((sum, row) => sum + Number(row.required_quantity || 0), 0);
      return res.json({ data: { machine_id: req.params['id'], required_quantity: requiredQuantity, blocking: requiredQuantity > 0, requirements: requirements.rows, assignments: assignments.rows, capabilities: capabilities.rows } });
    } catch (err) { return next(err); }
  });

  router.get('/machines/:id/dependencies', async (req, res, next) => {
    try {
      const [requirements, groups, assignments, capabilities, calendars, standards, units] = await Promise.all([
        pool.query(`SELECT r.requirement_id AS id, r.role, r.required_quantity, mg.code AS group_code, ws.code AS workstation_code FROM md_workstation_machine_requirement r JOIN md_workstation_machine_group mg ON mg.master_id = r.machine_group_id JOIN md_workstation ws ON ws.master_id = mg.workstation_id WHERE r.machine_id = $1`, [req.params['id']]),
        pool.query(`SELECT mg.master_id AS id, mg.code, mg.name, ws.code AS workstation_code FROM md_workstation_machine_group mg JOIN md_workstation ws ON ws.master_id = mg.workstation_id JOIN md_workstation_machine_requirement r ON r.machine_group_id = mg.master_id WHERE r.machine_id = $1`, [req.params['id']]),
        pool.query(`SELECT ra.master_id AS id, ra.code, ra.assignment_role, ws.code AS workstation_code FROM md_resource_assignment ra LEFT JOIN md_workstation ws ON ws.master_id = ra.workstation_id WHERE ra.equipment_id = $1`, [req.params['id']]),
        pool.query(`SELECT rc.master_id AS id, rc.code, wc.code AS work_center_code FROM md_resource_capability rc JOIN md_work_center wc ON wc.master_id = rc.work_center_id WHERE rc.equipment_id = $1`, [req.params['id']]),
        pool.query(`SELECT c.master_id AS id, c.code, c.calendar_date FROM md_resource_calendar c WHERE c.equipment_id = $1 OR (c.resource_type = 'Equipment' AND c.resource_id = $1)`, [req.params['id']]),
        pool.query(`SELECT ps.master_id AS id, ps.code, wc.code AS work_center_code FROM md_production_standard ps JOIN md_work_center wc ON wc.master_id = ps.work_center_id WHERE ps.equipment_id = $1`, [req.params['id']]),
        pool.query(`SELECT machine_unit_id AS id, code, active_flag, execution_status FROM md_machine_unit WHERE machine_id = $1`, [req.params['id']]),
      ]);
      return res.json({ data: { machine_id: req.params['id'], requirements: requirements.rows, machine_groups: groups.rows, assignments: assignments.rows, capabilities: capabilities.rows, calendars: calendars.rows, production_standards: standards.rows, machine_units: units.rows } });
    } catch (err) { return next(err); }
  });

  router.get('/workstations/:id/change-impact', async (req, res, next) => {
    try {
      const [groups, requirements, assignments, capabilities, calendars, compositions] = await Promise.all([
        pool.query(`SELECT mg.master_id AS id, mg.code, mg.name FROM md_workstation_machine_group mg WHERE mg.workstation_id = $1 AND mg.lifecycle_status NOT IN ('Inactive','Obsolete')`, [req.params['id']]),
        pool.query(`SELECT r.requirement_id AS id, r.role, r.required_quantity, r.requirement_type, mg.code AS group_code FROM md_workstation_machine_requirement r JOIN md_workstation_machine_group mg ON mg.master_id = r.machine_group_id WHERE mg.workstation_id = $1 AND r.active_flag = TRUE AND (r.effective_to IS NULL OR r.effective_to > NOW())`, [req.params['id']]),
        pool.query(`SELECT ra.master_id AS id, ra.code, ra.assignment_role, wc.code AS work_center_code FROM md_resource_assignment ra LEFT JOIN md_work_center wc ON wc.master_id = ra.work_center_id WHERE ra.workstation_id = $1 AND (ra.effective_to IS NULL OR ra.effective_to > NOW())`, [req.params['id']]),
        pool.query(`SELECT c.capability_id AS id, o.code AS operation_code, o.name AS operation_name FROM md_workstation_operation_capability c JOIN md_operation o ON o.master_id = c.operation_id WHERE c.workstation_id = $1 AND c.active_flag = TRUE AND (c.effective_to IS NULL OR c.effective_to > NOW())`, [req.params['id']]),
        pool.query(`SELECT c.master_id AS id, c.code, c.calendar_date FROM md_resource_calendar c WHERE c.resource_type = 'Workstation' AND c.resource_id = $1`, [req.params['id']]),
        pool.query(`SELECT wc.code AS work_center_code, ws.code AS workstation_code FROM md_work_center_composition c JOIN md_work_center wc ON wc.master_id = c.work_center_id JOIN md_workstation ws ON ws.master_id = c.workstation_id WHERE c.workstation_id = $1`, [req.params['id']]),
      ]);
      return res.json({ data: { workstation_id: req.params['id'], blocking: Boolean(groups.rows.length || requirements.rows.length || assignments.rows.length || capabilities.rows.length || calendars.rows.length || compositions.rows.length), groups: groups.rows, requirements: requirements.rows, assignments: assignments.rows, capabilities: capabilities.rows, calendars: calendars.rows, compositions: compositions.rows } });
    } catch (err) { return next(err); }
  });

  router.get('/workstations/:id/dependencies', async (req, res, next) => {
    try {
      const [groups, requirements, assignments, capabilities, calendars, compositions, skills] = await Promise.all([
        pool.query(`SELECT mg.master_id AS id, mg.code, mg.name, mg.lifecycle_status FROM md_workstation_machine_group mg WHERE mg.workstation_id = $1`, [req.params['id']]),
        pool.query(`SELECT r.requirement_id AS id, r.role, r.required_quantity, r.requirement_type, mg.code AS group_code FROM md_workstation_machine_requirement r JOIN md_workstation_machine_group mg ON mg.master_id = r.machine_group_id WHERE mg.workstation_id = $1`, [req.params['id']]),
        pool.query(`SELECT ra.master_id AS id, ra.code, ra.assignment_role, wc.code AS work_center_code FROM md_resource_assignment ra LEFT JOIN md_work_center wc ON wc.master_id = ra.work_center_id WHERE ra.workstation_id = $1`, [req.params['id']]),
        pool.query(`SELECT c.capability_id AS id, o.code AS operation_code, o.name AS operation_name FROM md_workstation_operation_capability c JOIN md_operation o ON o.master_id = c.operation_id WHERE c.workstation_id = $1`, [req.params['id']]),
        pool.query(`SELECT c.master_id AS id, c.code, c.calendar_date FROM md_resource_calendar c WHERE c.resource_type = 'Workstation' AND c.resource_id = $1`, [req.params['id']]),
        pool.query(`SELECT wc.code AS work_center_code, ws.code AS workstation_code FROM md_work_center_composition c JOIN md_work_center wc ON wc.master_id = c.work_center_id JOIN md_workstation ws ON ws.master_id = c.workstation_id WHERE c.workstation_id = $1`, [req.params['id']]),
        pool.query(`SELECT rsa.assignment_id AS id, s.code, s.name FROM md_resource_skill_assignment rsa JOIN md_skill s ON s.master_id = rsa.skill_id WHERE rsa.resource_type = 'Workstation' AND rsa.resource_id = $1`, [req.params['id']]),
      ]);
      return res.json({ data: { workstation_id: req.params['id'], groups: groups.rows, requirements: requirements.rows, assignments: assignments.rows, capabilities: capabilities.rows, calendars: calendars.rows, compositions: compositions.rows, skills: skills.rows } });
    } catch (err) { return next(err); }
  });

  router.get('/skill-groups', async (req, res, next) => {
    try {
      const scope = typeof req.query['scope'] === 'string' ? String(req.query['scope']) : '';
      const params = scope ? [scope] : [];
      const where = scope ? 'sg.scope = $1 AND sg.legacy_flag = FALSE' : 'sg.legacy_flag = FALSE';
      const { rows } = await pool.query(`SELECT sg.* FROM md_skill_group sg WHERE ${where} ORDER BY sg.code`, params);
      return res.json({ data: rows });
    } catch (err) { return next(err); }
  });

  router.post('/skill-groups', async (req, res, next) => {
    const context = getContext(req); const body = normalizeBody(req.body);
    try {
      if (!body['code'] || !body['name']) return res.status(422).json({ error: 'SKILL_GROUP_CODE_AND_NAME_REQUIRED' });
      const scope = String(body['scope'] || body['scope_type'] || '');
      if (!['Machine', 'Workstation', 'WorkCenter'].includes(scope)) return res.status(422).json({ error: 'SKILL_GROUP_SCOPE_REQUIRED' });
      const status = body['status'] === 'Inactive' || body['lifecycle_status'] === 'Inactive' ? 'Inactive' : 'Released';
      const duplicate = await pool.query(`SELECT 1 FROM md_skill_group WHERE scope = $1 AND legacy_flag = FALSE AND lifecycle_status NOT IN ('Inactive','Obsolete') AND lower(COALESCE(name->>'vi', name->>'en', name->>'ja', name->>'ko')) = lower(COALESCE($2::jsonb->>'vi', $2::jsonb->>'en', $2::jsonb->>'ja', $2::jsonb->>'ko'))`, [scope, JSON.stringify(body['name'])]);
      if (duplicate.rows[0]) return res.status(409).json({ error: 'SKILL_DUPLICATE' });
      const { rows } = await pool.query(`INSERT INTO md_skill_group (code, name, description, scope, legacy_flag, lifecycle_status, created_by) VALUES ($1,$2::jsonb,$3::jsonb,FALSE,$4,$5,$6) RETURNING *`, [String(body['code']).trim().toUpperCase(), JSON.stringify(body['name']), body['description'] ? JSON.stringify(body['description']) : null, scope, status, context.userId]);
      return res.status(201).json({ data: rows[0] });
    } catch (err) { return next(err); }
  });

  router.get('/resource-skill-assignments', async (req, res, next) => {
    try {
      const params = req.query['resource_type'] && req.query['resource_id'] ? [req.query['resource_type'], req.query['resource_id']] : [];
      const where = params.length ? 'WHERE rsa.resource_type = $1 AND rsa.resource_id = $2' : '';
      const { rows } = await pool.query(`SELECT rsa.*, s.code AS skill_code, s.name AS skill_name, s.skill_group, s.scope FROM md_resource_skill_assignment rsa JOIN md_skill s ON s.master_id = rsa.skill_id AND s.legacy_flag = FALSE ${where}${params.length ? ' AND' : ' WHERE'} rsa.active_flag = TRUE AND (rsa.effective_to IS NULL OR rsa.effective_to > NOW()) ORDER BY s.code`, params);
      return res.json({ data: rows });
    } catch (err) { return next(err); }
  });

  router.get('/work-centers/:id/composition', async (req, res, next) => {
    try {
      const { rows } = await pool.query(`SELECT c.*, ws.code AS workstation_code, ws.name AS workstation_name, op.code AS operation_code, op.name AS operation_name, c.effective_from, c.effective_to FROM md_work_center_composition c JOIN md_workstation ws ON ws.master_id = c.workstation_id JOIN md_operation op ON op.master_id = c.operation_id WHERE c.work_center_id = $1 AND c.active_flag = TRUE AND (c.effective_to IS NULL OR c.effective_to > NOW()) ORDER BY ws.code, op.code`, [req.params['id']]);
      return res.json({ data: rows });
    } catch (err) { return next(err); }
  });

  router.post('/work-centers/:id/composition', async (req, res, next) => {
    const context = getContext(req); const body = normalizeBody(req.body); const client = await pool.connect();
    try {
      const entries = Array.isArray(body['workstations']) ? body['workstations'] as Record<string, any>[] : [];
      if (!entries.length || entries.some((entry) => !entry['workstation_id'] || !Array.isArray(entry['operation_ids']) || !(entry['operation_ids'] as unknown[]).length)) throw Object.assign(new Error('WORK_CENTER_COMPOSITION_REQUIRES_WORKSTATION_AND_OPERATION'), { statusCode: 422 });
      await client.query('BEGIN'); await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [context.userId]);
      const wc = await client.query(`SELECT master_id, shopfloor_id, site_id, active_flag FROM md_work_center WHERE master_id = $1 FOR UPDATE`, [req.params['id']]);
      if (!wc.rows[0] || wc.rows[0].active_flag !== true) throw Object.assign(new Error('WORK_CENTER_NOT_FOUND_OR_INACTIVE'), { statusCode: 422 });
      for (const entry of entries) {
        const ws = await client.query(`SELECT master_id FROM md_workstation WHERE master_id = $1 AND work_center_id = $2 AND shopfloor_id = $3 AND active_flag = TRUE FOR UPDATE`, [entry['workstation_id'], req.params['id'], wc.rows[0].shopfloor_id]);
        if (!ws.rows[0]) throw Object.assign(new Error('WORKSTATION_NOT_IN_WORK_CENTER_HIERARCHY'), { statusCode: 422 });
        const operationIds = [...new Set((entry['operation_ids'] as unknown[]).map(String))];
        for (const operationId of operationIds) {
          const capability = await client.query(`SELECT 1 FROM md_workstation_operation_capability WHERE workstation_id = $1 AND operation_id = $2 AND active_flag = TRUE AND (effective_to IS NULL OR effective_to > NOW())`, [entry['workstation_id'], operationId]);
          if (!capability.rows[0]) throw Object.assign(new Error('WORKSTATION_OPERATION_NOT_SUPPORTED'), { statusCode: 422 });
        }
      }
      await client.query(`UPDATE md_work_center_composition SET active_flag = FALSE, effective_to = NOW(), ended_by = $2, ended_at = NOW(), updated_by = $2, updated_at = NOW() WHERE work_center_id = $1 AND active_flag = TRUE AND effective_to IS NULL`, [req.params['id'], context.userId]);
      const created: Record<string, any>[] = [];
      for (const entry of entries) for (const operationId of [...new Set((entry['operation_ids'] as unknown[]).map(String))]) {
        const result = await client.query(`INSERT INTO md_work_center_composition (work_center_id, workstation_id, operation_id, created_by) VALUES ($1,$2,$3,$4) RETURNING *`, [req.params['id'], entry['workstation_id'], operationId, context.userId]);
        created.push(result.rows[0]);
      }
      await client.query('COMMIT'); return res.status(201).json({ data: created });
    } catch (err) { await client.query('ROLLBACK'); return next(err); } finally { client.release(); }
  });

  router.get('/operations/:id/dependencies', async (req, res, next) => {
    try {
      const operationId = req.params['id'];
      const [capabilities, compositions, routings, skillRequirements, workInstructions, resourceCapabilities, productionStandards] = await Promise.all([
        pool.query(`SELECT c.capability_id AS id, ws.code AS workstation_code, ws.name AS workstation_name FROM md_workstation_operation_capability c JOIN md_workstation ws ON ws.master_id = c.workstation_id WHERE c.operation_id = $1`, [operationId]),
        pool.query(`SELECT c.composition_id AS id, wc.code AS work_center_code, wc.name AS work_center_name, ws.code AS workstation_code FROM md_work_center_composition c JOIN md_work_center wc ON wc.master_id = c.work_center_id JOIN md_workstation ws ON ws.master_id = c.workstation_id WHERE c.operation_id = $1`, [operationId]),
        pool.query(`SELECT ro.master_id AS id, rh.code AS routing_code, rh.name AS routing_name, ro.seq FROM md_routing_operation ro JOIN md_routing_header rh ON rh.master_id = ro.routing_header_id WHERE ro.operation_id = $1`, [operationId]),
        pool.query(`SELECT osr.master_id AS id, osr.code, ro.code AS routing_operation_code FROM md_operation_skill_requirement osr JOIN md_routing_operation ro ON ro.master_id = osr.routing_operation_id WHERE osr.operation_id = $1`, [operationId]),
        pool.query(`SELECT wi.master_id AS id, wi.code, wi.name FROM md_work_instruction wi WHERE wi.operation_id = $1`, [operationId]).catch(() => ({ rows: [] })),
        pool.query(`SELECT rc.master_id AS id, rc.code, wc.code AS work_center_code FROM md_resource_capability rc JOIN md_work_center wc ON wc.master_id = rc.work_center_id WHERE rc.operation_id = $1`, [operationId]),
        pool.query(`SELECT ps.master_id AS id, ps.code, wc.code AS work_center_code FROM md_production_standard ps JOIN md_work_center wc ON wc.master_id = ps.work_center_id WHERE ps.operation_id = $1`, [operationId]),
      ]);
      const data = { capabilities: capabilities.rows, compositions: compositions.rows, routings: routings.rows, skill_requirements: skillRequirements.rows, work_instructions: workInstructions.rows, resource_capabilities: resourceCapabilities.rows, production_standards: productionStandards.rows };
      return res.json({ data: { ...data, referenced: Object.values(data).some((rows) => rows.length > 0) } });
    } catch (err) { return next(err); }
  });

  router.get('/operations/:operationId/supported-work-centers', async (req, res, next) => {
    try {
      const { rows } = await pool.query(`
        SELECT wc.master_id AS work_center_id, wc.code AS work_center_code, wc.name AS work_center_name,
               sf.code AS shopfloor_code, sf.name AS shopfloor_name,
               s.code AS factory_code, s.name AS factory_name,
               COUNT(DISTINCT ws.master_id)::INT AS supporting_workstation_count
        FROM md_work_center wc
        JOIN md_shopfloor sf ON sf.master_id = wc.shopfloor_id
        JOIN md_site s ON s.master_id = wc.site_id
        JOIN md_work_center_composition composition
          ON composition.work_center_id = wc.master_id
         AND composition.active_flag = TRUE
         AND (composition.effective_to IS NULL OR composition.effective_to > NOW())
        JOIN md_workstation ws
          ON ws.master_id = composition.workstation_id
         AND ws.work_center_id = wc.master_id
         AND ws.active_flag = TRUE
         AND ws.lifecycle_status NOT IN ('Inactive', 'Obsolete')
        JOIN md_workstation_operation_capability capability
          ON capability.workstation_id = ws.master_id
         AND capability.operation_id = $1
         AND capability.active_flag = TRUE
         AND (capability.effective_to IS NULL OR capability.effective_to > NOW())
        WHERE wc.active_flag = TRUE AND wc.lifecycle_status NOT IN ('Inactive', 'Obsolete')
        GROUP BY wc.master_id, wc.code, wc.name, sf.code, sf.name, s.code, s.name
        ORDER BY wc.code`, [req.params['operationId']]);
      return res.json({ items: rows.map((row) => ({ work_center: { id: row.work_center_id, code: row.work_center_code, name: row.work_center_name }, shopfloor: { code: row.shopfloor_code, name: row.shopfloor_name }, factory: { code: row.factory_code, name: row.factory_name }, supporting_workstation_count: row.supporting_workstation_count })) });
    } catch (err) { return next(err); }
  });

  router.get('/operations/:id', async (req, res, next) => {
    try {
      const operation = await pool.query(`SELECT * FROM md_operation WHERE master_id = $1`, [req.params['id']]);
      if (!operation.rows[0]) return res.status(404).json({ error: 'Not Found' });
      const dependencies = await pool.query(`SELECT ws.code AS workstation_code, ws.name AS workstation_name, wc.code AS work_center_code, wc.name AS work_center_name FROM md_workstation_operation_capability c JOIN md_workstation ws ON ws.master_id = c.workstation_id LEFT JOIN md_work_center wc ON wc.master_id = ws.work_center_id WHERE c.operation_id = $1 AND c.active_flag = TRUE AND (c.effective_to IS NULL OR c.effective_to > NOW())`, [req.params['id']]);
      return res.json({ data: { ...operation.rows[0], supporting_workstations: dependencies.rows } });
    } catch (err) { return next(err); }
  });

  router.get('/operations/:id/worker-skill-requirements', async (req, res, next) => {
    try {
      const { rows } = await pool.query(`
        SELECT osr.master_id, osr.operation_id, osr.skill_id, osr.minimum_level,
               osr.required_persons, osr.mandatory_flag, osr.effective_from, osr.effective_to,
               osr.active_flag, sk.code AS skill_code, sk.name AS skill_name, sk.scope AS skill_scope
        FROM md_operation_skill_requirement osr
        JOIN md_skill sk ON sk.master_id = osr.skill_id
        WHERE osr.operation_id = $1 AND osr.routing_operation_id IS NULL
          AND osr.active_flag = TRUE AND (osr.effective_to IS NULL OR osr.effective_to > NOW())
        ORDER BY sk.code`, [req.params['id']]);
      return res.json({ data: rows });
    } catch (err) { return next(err); }
  });

  router.put('/operations/:id/worker-skill-requirements', async (req, res, next) => {
    const context = getContext(req); const body = normalizeBody(req.body); const requirements = Array.isArray(body['requirements']) ? body['requirements'] as Record<string, any>[] : [];
    const client = await pool.connect();
    try {
      const operation = await client.query(`SELECT master_id, code FROM md_operation WHERE master_id = $1`, [req.params['id']]);
      if (!operation.rows[0]) throw Object.assign(new Error('OPERATION_NOT_FOUND'), { statusCode: 404 });
      const activeRequirements = requirements.filter((item) => item['status'] !== 'Inactive' && item['active_flag'] !== false);
      const skillIds = activeRequirements.map((item) => String(item['skill_id'] || ''));
      if (new Set(skillIds).size !== skillIds.length) throw Object.assign(new Error('OPERATION_WORKER_SKILL_DUPLICATE'), { statusCode: 422 });
      if (activeRequirements.some((item) => !item['skill_id'])) throw Object.assign(new Error('OPERATION_WORKER_SKILL_SCOPE_INVALID'), { statusCode: 422 });
      if (activeRequirements.some((item) => !WORKER_SKILL_LEVELS.has(String(item['minimum_level'])))) throw Object.assign(new Error('OPERATION_WORKER_SKILL_LEVEL_INVALID'), { statusCode: 422 });
      if (activeRequirements.some((item) => !Number.isInteger(Number(item['required_persons'])) || Number(item['required_persons']) < 1)) throw Object.assign(new Error('OPERATION_WORKER_SKILL_PERSONS_INVALID'), { statusCode: 422 });
      for (const item of activeRequirements) {
        const from = item['effective_from'] ? new Date(String(item['effective_from'])) : new Date();
        const to = item['effective_to'] ? new Date(String(item['effective_to'])) : null;
        if (Number.isNaN(from.getTime()) || (to && (Number.isNaN(to.getTime()) || to <= from))) throw Object.assign(new Error('OPERATION_WORKER_SKILL_EFFECTIVE_DATES_INVALID'), { statusCode: 422 });
      }
      if (skillIds.length) {
        const validSkills = await client.query(`SELECT master_id FROM md_skill WHERE master_id = ANY($1::uuid[]) AND scope = 'Employee' AND legacy_flag = FALSE AND lifecycle_status NOT IN ('Inactive','Obsolete')`, [skillIds]);
        if (validSkills.rows.length !== skillIds.length) throw Object.assign(new Error('OPERATION_WORKER_SKILL_SCOPE_INVALID'), { statusCode: 422 });
      }
      await client.query('BEGIN'); await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [context.userId]);
      await client.query(`UPDATE md_operation_skill_requirement SET active_flag = FALSE, effective_to = NOW(), updated_by = $2, updated_at = NOW() WHERE operation_id = $1 AND routing_operation_id IS NULL AND active_flag = TRUE AND effective_to IS NULL`, [req.params['id'], context.userId]);
      const created: Record<string, any>[] = [];
      for (const [index, item] of requirements.entries()) {
        const active = item['status'] !== 'Inactive' && item['active_flag'] !== false;
        const from = item['effective_from'] ? new Date(String(item['effective_from'])) : new Date();
        const to = item['effective_to'] ? new Date(String(item['effective_to'])) : null;
        const skill = await client.query(`SELECT code FROM md_skill WHERE master_id = $1`, [String(item['skill_id'])]);
        if (!skill.rows[0]) throw Object.assign(new Error('OPERATION_WORKER_SKILL_SCOPE_INVALID'), { statusCode: 422 });
        const result = await client.query(`
          INSERT INTO md_operation_skill_requirement
            (code, name, version_no, lifecycle_status, effective_from, effective_to, created_by,
             operation_id, skill_id, minimum_level, required_persons, mandatory_flag, active_flag)
          VALUES ($1, $2, 1, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
        [`${operation.rows[0].code}-WSK-${Date.now()}-${index + 1}`, `${skill.rows[0].code} worker skill requirement`, active ? 'Released' : 'Inactive', from, to, context.userId, req.params['id'], String(item['skill_id']), String(item['minimum_level'] || 'L1'), Number(item['required_persons'] || 1), item['mandatory_flag'] !== false, active]);
        created.push(result.rows[0]);
      }
      await client.query('COMMIT'); return res.json({ data: created });
    } catch (err) { await client.query('ROLLBACK'); return next(err); } finally { client.release(); }
  });

  router.get('/routing-operations/:id/worker-skill-requirements', async (req, res, next) => {
    try {
      const { rows } = await pool.query(`
        SELECT osr.master_id, osr.operation_id, osr.routing_operation_id, osr.skill_id,
               osr.minimum_level, osr.required_persons, osr.mandatory_flag,
               osr.effective_from, osr.effective_to, osr.active_flag,
               sk.code AS skill_code, sk.name AS skill_name, sk.scope AS skill_scope
        FROM md_operation_skill_requirement osr JOIN md_skill sk ON sk.master_id = osr.skill_id
        WHERE osr.routing_operation_id = $1 AND osr.active_flag = TRUE
          AND (osr.effective_to IS NULL OR osr.effective_to > NOW()) ORDER BY sk.code`, [req.params['id']]);
      return res.json({ data: rows });
    } catch (err) { return next(err); }
  });

  router.put('/routing-operations/:id/worker-skill-requirements', async (req, res, next) => {
    const context = getContext(req); const requirements = Array.isArray(req.body?.requirements) ? req.body.requirements as Record<string, any>[] : []; const client = await pool.connect();
    try {
      const routingOperation = await client.query(`SELECT ro.master_id, ro.operation_id, ro.code, wc.site_id FROM md_routing_operation ro JOIN md_work_center wc ON wc.master_id = ro.work_center_id WHERE ro.master_id = $1`, [req.params['id']]);
      if (!routingOperation.rows[0]) throw Object.assign(new Error('ROUTING_OPERATION_NOT_FOUND'), { statusCode: 404 });
      const activeRequirements = requirements.filter((item) => item['status'] !== 'Inactive' && item['active_flag'] !== false); const skillIds = activeRequirements.map((item) => String(item['skill_id'] || ''));
      if (new Set(skillIds).size !== skillIds.length) throw Object.assign(new Error('OPERATION_WORKER_SKILL_DUPLICATE'), { statusCode: 422 });
      if (activeRequirements.some((item) => !WORKER_SKILL_LEVELS.has(String(item['minimum_level'])))) throw Object.assign(new Error('OPERATION_WORKER_SKILL_LEVEL_INVALID'), { statusCode: 422 });
      if (activeRequirements.some((item) => !Number.isInteger(Number(item['required_persons'])) || Number(item['required_persons']) < 1)) throw Object.assign(new Error('OPERATION_WORKER_SKILL_PERSONS_INVALID'), { statusCode: 422 });
      const validSkills = skillIds.length ? await client.query(`SELECT master_id FROM md_skill WHERE master_id = ANY($1::uuid[]) AND scope = 'Employee' AND legacy_flag = FALSE AND lifecycle_status NOT IN ('Inactive','Obsolete')`, [skillIds]) : { rows: [] };
      if (validSkills.rows.length !== skillIds.length) throw Object.assign(new Error('OPERATION_WORKER_SKILL_SCOPE_INVALID'), { statusCode: 422 });
      await client.query('BEGIN'); await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [context.userId]);
      await client.query(`UPDATE md_operation_skill_requirement SET active_flag = FALSE, effective_to = NOW(), updated_by = $2, updated_at = NOW() WHERE routing_operation_id = $1 AND active_flag = TRUE AND effective_to IS NULL`, [req.params['id'], context.userId]);
      const created: Record<string, any>[] = [];
      for (const [index, item] of requirements.entries()) {
        const active = item['status'] !== 'Inactive' && item['active_flag'] !== false; const from = item['effective_from'] ? new Date(String(item['effective_from'])) : new Date(); const to = item['effective_to'] ? new Date(String(item['effective_to'])) : null;
        if (to && (Number.isNaN(to.getTime()) || to <= from)) throw Object.assign(new Error('OPERATION_WORKER_SKILL_EFFECTIVE_DATES_INVALID'), { statusCode: 422 });
        const skill = await client.query(`SELECT code FROM md_skill WHERE master_id = $1`, [String(item['skill_id'])]); if (!skill.rows[0]) throw Object.assign(new Error('OPERATION_WORKER_SKILL_SCOPE_INVALID'), { statusCode: 422 });
        const result = await client.query(`INSERT INTO md_operation_skill_requirement (code, name, version_no, lifecycle_status, effective_from, effective_to, created_by, operation_id, skill_id, site_id, routing_operation_id, minimum_level, required_persons, mandatory_flag, active_flag) VALUES ($1,$2,1,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`, [`${routingOperation.rows[0].code}-WSK-${Date.now()}-${index + 1}`, `${skill.rows[0].code} worker skill requirement`, active ? 'Released' : 'Inactive', from, to, context.userId, routingOperation.rows[0].operation_id, String(item['skill_id']), routingOperation.rows[0].site_id, req.params['id'], String(item['minimum_level'] || 'L1'), Number(item['required_persons'] || 1), item['mandatory_flag'] !== false, active]);
        created.push(result.rows[0]);
      }
      await client.query('COMMIT'); return res.json({ data: created });
    } catch (err) { await client.query('ROLLBACK'); return next(err); } finally { client.release(); }
  });

  router.put('/resource-skill-assignments/:resourceType/:resourceId', async (req, res, next) => {
    const context = getContext(req); const body = normalizeBody(req.body); const resourceType = String(req.params['resourceType']); const resourceId = String(req.params['resourceId']);
    const client = await pool.connect();
    try {
      if (!['Machine', 'Workstation', 'WorkCenter'].includes(resourceType)) return res.status(422).json({ error: 'RESOURCE_SKILL_SCOPE_REQUIRED' });
      if (!Array.isArray(body['skill_ids'])) return res.status(422).json({ error: 'RESOURCE_SKILLS_REQUIRED' });
      const skillIds = [...new Set(body['skill_ids'].map(String))];
      if (resourceType === 'Machine' && skillIds.length === 0) return res.status(422).json({ error: 'MACHINE_SKILL_REQUIRED' });
      const valid = await client.query(`SELECT master_id FROM md_skill WHERE master_id = ANY($1::uuid[]) AND scope = $2 AND legacy_flag = FALSE AND lifecycle_status NOT IN ('Inactive','Obsolete')`, [skillIds, resourceType]);
      if (valid.rows.length !== skillIds.length) return res.status(422).json({ error: 'RESOURCE_SKILL_SCOPE_INVALID' });
      await client.query('BEGIN'); await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [context.userId]);
      await client.query(`SELECT assignment_id FROM md_resource_skill_assignment WHERE resource_type = $1 AND resource_id = $2 AND active_flag = TRUE AND (effective_to IS NULL OR effective_to > NOW()) FOR UPDATE`, [resourceType, resourceId]);
      const replacementNow = new Date().toISOString();
      await client.query(`UPDATE md_resource_skill_assignment SET active_flag = FALSE, effective_to = $3, ended_by = $4, ended_at = NOW(), updated_by = $4, updated_at = NOW() WHERE resource_type = $1 AND resource_id = $2 AND active_flag = TRUE AND (effective_to IS NULL OR effective_to > NOW())`, [resourceType, resourceId, replacementNow, context.userId]);
      for (const skillId of skillIds) await client.query(`INSERT INTO md_resource_skill_assignment (resource_type, resource_id, skill_id, minimum_level, required_flag, effective_from, created_by) VALUES ($1,$2,$3,$4,TRUE,$5,$6)`, [resourceType, resourceId, skillId, body['minimum_level'] || 'Basic', replacementNow, context.userId]);
      const { rows } = await client.query(`SELECT * FROM md_resource_skill_assignment WHERE resource_type = $1 AND resource_id = $2 AND active_flag = TRUE AND effective_to IS NULL ORDER BY created_at`, [resourceType, resourceId]);
      await client.query('COMMIT'); return res.json({ data: rows });
    } catch (err) { await client.query('ROLLBACK'); return next(err); } finally { client.release(); }
  });

  router.post('/resource-skill-assignments', async (req, res, next) => {
    const context = getContext(req); const body = normalizeBody(req.body);
    try {
      if (!['Machine', 'Workstation', 'WorkCenter'].includes(String(body['resource_type'])) || !body['resource_id'] || !body['skill_id']) return res.status(422).json({ error: 'RESOURCE_SKILL_SCOPE_REQUIRED' });
      const { rows } = await pool.query(`INSERT INTO md_resource_skill_assignment (resource_type, resource_id, skill_id, minimum_level, required_flag, effective_from, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [body['resource_type'], body['resource_id'], body['skill_id'], body['minimum_level'] || 'Basic', body['required_flag'] !== false, body['effective_from'] || new Date().toISOString(), context.userId]);
      return res.status(201).json({ data: rows[0] });
    } catch (err) { return next(err); }
  });

  router.post('/workstations/:id/machine-groups', async (req, res, next) => {
    const context = getContext(req); const client = await pool.connect();
    try { await client.query('BEGIN'); await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [context.userId]); const groups = await persistMachineGroups(client, req.params['id'], [normalizeBody(req.body)], context); await client.query('COMMIT'); return res.status(201).json({ data: groups[0] }); }
    catch (err) { await client.query('ROLLBACK'); return next(err); } finally { client.release(); }
  });

  router.post('/workstations/:id/machine-groups/:groupId/members', async (req, res, next) => {
    const context = getContext(req); const body = normalizeBody(req.body); const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const group = await client.query(`SELECT * FROM md_workstation_machine_group WHERE master_id = $1 AND workstation_id = $2 AND lifecycle_status NOT IN ('Inactive','Obsolete') FOR UPDATE`, [req.params['groupId'], req.params['id']]);
      if (!group.rows[0]) throw Object.assign(new Error('MACHINE_GROUP_NOT_FOUND'), { statusCode: 404 });
      if (!body['machine_id']) throw Object.assign(new Error('MACHINE_GROUP_MACHINE_REQUIRED'), { statusCode: 422 });
      const machine = await client.query(`SELECT master_id, code, name, site_id, active_flag, execution_status FROM md_equipment WHERE master_id = $1 FOR UPDATE`, [body['machine_id']]);
      if (!machine.rows[0] || machine.rows[0].site_id !== group.rows[0].site_id || machine.rows[0].active_flag !== true || machine.rows[0].execution_status === 'OutOfService') throw Object.assign(new Error('MACHINE_HIERARCHY_OR_STATUS_INVALID'), { statusCode: 422 });
      const unit = await resolveMachineUnit(client, String(body['machine_id']), body['machine_unit_id'] as string | undefined);
      const duplicate = await client.query(`SELECT 1 FROM md_resource_assignment WHERE machine_group_id = $1 AND COALESCE(machine_unit_id, equipment_id) = $2 AND effective_to IS NULL`, [req.params['groupId'], unit.machine_unit_id]);
      if (duplicate.rows[0]) throw Object.assign(new Error('MACHINE_GROUP_DUPLICATE_MEMBER'), { statusCode: 422 });
      const role = body['role'] === 'Primary' ? 'Primary' : 'Supporting';
      if (role === 'Primary') { const primary = await client.query(`SELECT 1 FROM md_resource_assignment WHERE machine_group_id = $1 AND assignment_role = 'Primary' AND effective_to IS NULL`, [req.params['groupId']]); if (primary.rows[0]) throw Object.assign(new Error('MACHINE_GROUP_MULTIPLE_PRIMARY'), { statusCode: 422 }); }
      const count = await client.query(`SELECT COUNT(*)::int AS count FROM md_resource_assignment WHERE machine_group_id = $1 AND effective_to IS NULL`, [req.params['groupId']]);
      const row = await client.query(`INSERT INTO md_resource_assignment (code, name, site_id, work_center_id, workstation_id, equipment_id, machine_group_id, machine_unit_id, assignment_type, assignment_role, requirement_type, sequence_no, scheduling_flag, oee_aggregation_flag, effective_from, created_by) VALUES ($1,$2::jsonb,$3,$4,$5,$6,$7,$8,'MachineGroupMember',$9,$10,$11,TRUE,$12,$13,$14) RETURNING *`, [`RA-${group.rows[0].code}-${Number(count.rows[0].count) + 1}`, JSON.stringify({ vi: 'Thành viên nhóm máy', en: 'Machine group member' }), group.rows[0].site_id, group.rows[0].work_center_id, group.rows[0].workstation_id, body['machine_id'], req.params['groupId'], unit.machine_unit_id, role, body['requirement_type'] === 'Optional' ? 'Optional' : 'Required', Number(count.rows[0].count) + 1, role === 'Primary' || body['requirement_type'] !== 'Optional', new Date(String(body['effective_from'] || new Date().toISOString())).toISOString(), context.userId]);
      await client.query('COMMIT'); return res.status(201).json({ data: { ...row.rows[0], machine_unit_code: unit.code, machine_code: machine.rows[0].code, machine_name: machine.rows[0].name } });
    } catch (err) { await client.query('ROLLBACK'); return next(err); } finally { client.release(); }
  });

  router.post('/workstations/:id/machine-groups/:groupId/members/:memberId/end', async (req, res, next) => {
    const effectiveTo = new Date(String(req.body?.effective_to || new Date().toISOString())); const client = await pool.connect();
    try { await client.query('BEGIN'); const group = await client.query(`SELECT COUNT(*)::int AS count FROM md_resource_assignment WHERE machine_group_id = $1 AND effective_to IS NULL AND master_id <> $2`, [req.params['groupId'], req.params['memberId']]); if (Number(group.rows[0]?.count || 0) < 1) throw Object.assign(new Error('MACHINE_GROUP_MEMBER_REQUIRED'), { statusCode: 422 }); const row = await client.query(`UPDATE md_resource_assignment SET effective_to = $1 WHERE master_id = $2 AND machine_group_id = $3 AND (effective_to IS NULL OR effective_to > $1) RETURNING *`, [effectiveTo.toISOString(), req.params['memberId'], req.params['groupId']]); if (!row.rows[0]) throw Object.assign(new Error('MACHINE_GROUP_MEMBER_NOT_FOUND'), { statusCode: 404 }); await client.query('COMMIT'); return res.json({ data: row.rows[0] }); }
    catch (err) { await client.query('ROLLBACK'); return next(err); } finally { client.release(); }
  });

  router.post('/workstations/:id/machine-groups/:groupId/replace-primary', async (req, res, next) => {
    const context = getContext(req); const body = normalizeBody(req.body); const client = await pool.connect();
    try { await client.query('BEGIN'); const current = await client.query(`SELECT master_id FROM md_resource_assignment WHERE machine_group_id = $1 AND assignment_role = 'Primary' AND effective_to IS NULL FOR UPDATE`, [req.params['groupId']]); if (!current.rows[0]) throw Object.assign(new Error('MACHINE_GROUP_NO_PRIMARY'), { statusCode: 422 }); const end = new Date(String(body['effective_from'] || new Date().toISOString())); const group = await client.query(`SELECT * FROM md_workstation_machine_group WHERE master_id = $1 AND workstation_id = $2 AND lifecycle_status NOT IN ('Inactive','Obsolete')`, [req.params['groupId'], req.params['id']]); if (!group.rows[0]) throw Object.assign(new Error('MACHINE_GROUP_NOT_FOUND'), { statusCode: 404 }); if (!body['machine_id']) throw Object.assign(new Error('MACHINE_GROUP_MACHINE_REQUIRED'), { statusCode: 422 }); const machine = await client.query(`SELECT master_id, code, name, site_id, active_flag, execution_status FROM md_equipment WHERE master_id = $1 FOR UPDATE`, [body['machine_id']]); if (!machine.rows[0] || machine.rows[0].site_id !== group.rows[0].site_id || machine.rows[0].active_flag !== true || machine.rows[0].execution_status !== 'Available') throw Object.assign(new Error('MACHINE_HIERARCHY_OR_STATUS_INVALID'), { statusCode: 422 }); const unit = await resolveMachineUnit(client, String(body['machine_id']), body['machine_unit_id'] as string | undefined); await client.query(`UPDATE md_resource_assignment SET effective_to = $1 WHERE master_id = $2`, [end.toISOString(), current.rows[0].master_id]); const next = await client.query(`INSERT INTO md_resource_assignment (code, name, site_id, work_center_id, workstation_id, equipment_id, machine_group_id, machine_unit_id, assignment_type, assignment_role, requirement_type, sequence_no, scheduling_flag, oee_aggregation_flag, effective_from, created_by) VALUES ($1,$2::jsonb,$3,$4,$5,$6,$7,$8,'MachineGroupMember','Primary','Required',1,TRUE,TRUE,$9,$10) RETURNING *`, [`RA-${group.rows[0].code}-${Date.now()}`, JSON.stringify({ vi: 'Thay máy chính', en: 'Replace primary machine', ja: '主機械を交換', ko: '주 머신 교체' }), group.rows[0].site_id, group.rows[0].work_center_id, group.rows[0].workstation_id, machine.rows[0].master_id, group.rows[0].master_id, unit.machine_unit_id, end.toISOString(), context.userId]); await client.query('COMMIT'); return res.status(201).json({ data: { ...next.rows[0], machine_code: machine.rows[0].code, machine_name: machine.rows[0].name, machine_unit_code: unit.code }, replaced_member_id: current.rows[0].master_id }); }
    catch (err) { await client.query('ROLLBACK'); return next(err); } finally { client.release(); }
  });

  router.post('/resource-assignments', async (req, res, next) => {
    const context = getContext(req);
    const body = normalizeBody(req.body);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [context.userId]);
      const required = ['site_id', 'work_center_id', 'workstation_id', 'assignment_role', 'effective_from'];
      if (required.some((key) => !body[key])) throw Object.assign(new Error('site_id, work_center_id, workstation_id, assignment_role, and effective_from are required'), { statusCode: 400 });
      const type = String(body['assignment_role']);
      if (!['Primary', 'Alternate', 'Supporting'].includes(type)) throw Object.assign(new Error('assignment_role must be Primary, Alternate, or Supporting'), { statusCode: 400 });
      const start = new Date(String(body['effective_from']));
      const end = body['effective_to'] ? new Date(String(body['effective_to'])) : null;
      if (Number.isNaN(start.getTime()) || (end && (Number.isNaN(end.getTime()) || end <= start))) throw Object.assign(new Error('effective_to must be after effective_from'), { statusCode: 422 });
      const record = await client.query(`
        INSERT INTO md_resource_assignment
          (code, name, site_id, work_center_id, workstation_id, equipment_id, machine_group_id, machine_unit_id, assignment_type, assignment_role, requirement_type, sequence_no,
           scheduling_flag, oee_aggregation_flag, effective_from, effective_to, created_by)
        VALUES ($1, $2::jsonb, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        RETURNING *`, [
        body['code'] || `RA-${String(body['workstation_id']).slice(0, 8)}-${Date.now()}`,
        JSON.stringify(body['name'] || { vi: 'Gán tài nguyên', en: 'Resource assignment' }),
        body['site_id'], body['work_center_id'], body['workstation_id'], body['equipment_id'] || null,
        body['machine_group_id'] || null, body['machine_unit_id'] || null, body['machine_group_id'] ? 'MachineGroupMember' : type, type, body['requirement_type'] === 'Optional' ? 'Optional' : 'Required', Number(body['sequence_no'] || 1), body['scheduling_flag'] !== false, body['oee_aggregation_flag'] === true,
        start.toISOString(), end?.toISOString() ?? null, context.userId,
      ]);
      const row = record.rows[0];
      const eventType = 'MES.MasterData.ResourceAssignmentCreated.v1';
      await writeToOutbox(client, { topic: eventType, envelope: createEventEnvelope({ event_type: eventType, source_service: SERVICE_NAME, trace_id: context.traceId, payload: { assignment_id: row.master_id, site_id: row.site_id, work_center_id: row.work_center_id, workstation_id: row.workstation_id, equipment_id: row.equipment_id, assignment_role: row.assignment_role, effective_from: row.effective_from, effective_to: row.effective_to } }) });
      await client.query('COMMIT');
      return res.status(201).json({ data: row });
    } catch (err: any) {
      await client.query('ROLLBACK');
      if (err?.code === '23P01') return res.status(409).json({ error: 'PRIMARY_EQUIPMENT_ASSIGNMENT_OVERLAP', message: 'Equipment already has an overlapping Primary assignment.' });
      if (err?.code === '23514' || err?.code === '23503') return res.status(422).json({ error: 'INVALID_RESOURCE_ASSIGNMENT', message: err.message });
      return next(err);
    } finally { client.release(); }
  });

  router.post('/resource-assignments/:id/end', async (req, res, next) => {
    const context = getContext(req);
    const effectiveTo = new Date(String(req.body?.effective_to || new Date().toISOString()));
    if (Number.isNaN(effectiveTo.getTime())) return res.status(400).json({ error: 'effective_to must be a valid timestamp' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [context.userId]);
      const { rows } = await client.query(`UPDATE md_resource_assignment SET effective_to = $1 WHERE master_id = $2 AND (effective_to IS NULL OR effective_to > $1) RETURNING *`, [effectiveTo.toISOString(), req.params['id']]);
      if (!rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Assignment not found or already ended' }); }
      const eventType = 'MES.MasterData.ResourceAssignmentEnded.v1';
      await writeToOutbox(client, { topic: eventType, envelope: createEventEnvelope({ event_type: eventType, source_service: SERVICE_NAME, trace_id: context.traceId, payload: { assignment_id: rows[0].master_id, effective_to: rows[0].effective_to } }) });
      await client.query('COMMIT');
      return res.json({ data: rows[0] });
    } catch (err) { await client.query('ROLLBACK'); return next(err); } finally { client.release(); }
  });

  router.post('/resource-assignments/:id/move', async (req, res, next) => {
    const context = getContext(req);
    const body = normalizeBody(req.body);
    const effectiveFrom = new Date(String(body['effective_from'] || ''));
    if (Number.isNaN(effectiveFrom.getTime())) return res.status(400).json({ error: 'effective_from must be a valid timestamp' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [context.userId]);
      const currentResult = await client.query('SELECT * FROM md_resource_assignment WHERE master_id = $1 FOR UPDATE', [req.params['id']]);
      const current = currentResult.rows[0] as Record<string, any> | undefined;
      if (!current) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Assignment not found' }); }
      if (effectiveFrom <= new Date(current['effective_from'])) { await client.query('ROLLBACK'); return res.status(422).json({ error: 'effective_from must be after the current assignment start' }); }
      const closed = await client.query('UPDATE md_resource_assignment SET effective_to = $1 WHERE master_id = $2 RETURNING *', [effectiveFrom.toISOString(), current['master_id']]);
      const next = await client.query(`
        INSERT INTO md_resource_assignment
          (code, name, site_id, work_center_id, workstation_id, equipment_id, assignment_type, assignment_role,
           scheduling_flag, oee_aggregation_flag, effective_from, effective_to, created_by)
        VALUES ($1, $2::jsonb, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *`, [
        body['code'] || `MOVE-${String(current['code']).slice(0, 24)}-${effectiveFrom.getTime()}`,
        JSON.stringify(body['name'] || current['name']), body['site_id'] || current['site_id'],
        body['work_center_id'] || current['work_center_id'], body['workstation_id'] || current['workstation_id'],
        body['equipment_id'] === undefined ? current['equipment_id'] : (body['equipment_id'] || null),
        current['assignment_type'], current['assignment_role'], current['scheduling_flag'], current['oee_aggregation_flag'],
        effectiveFrom.toISOString(), body['effective_to'] ? new Date(String(body['effective_to'])).toISOString() : current['effective_to'], context.userId,
      ]);
      const endedType = 'MES.MasterData.ResourceAssignmentEnded.v1';
      const createdType = 'MES.MasterData.ResourceAssignmentCreated.v1';
      await writeToOutbox(client, { topic: endedType, envelope: createEventEnvelope({ event_type: endedType, source_service: SERVICE_NAME, trace_id: context.traceId, payload: { assignment_id: closed.rows[0].master_id, effective_to: closed.rows[0].effective_to, replacement_assignment_id: next.rows[0].master_id } }) });
      await writeToOutbox(client, { topic: createdType, envelope: createEventEnvelope({ event_type: createdType, source_service: SERVICE_NAME, trace_id: context.traceId, payload: { assignment_id: next.rows[0].master_id, site_id: next.rows[0].site_id, work_center_id: next.rows[0].work_center_id, workstation_id: next.rows[0].workstation_id, equipment_id: next.rows[0].equipment_id, assignment_role: next.rows[0].assignment_role, effective_from: next.rows[0].effective_from, effective_to: next.rows[0].effective_to, replaced_assignment_id: closed.rows[0].master_id } }) });
      await client.query('COMMIT');
      return res.status(201).json({ data: next.rows[0], replaced_assignment: closed.rows[0] });
    } catch (err: any) {
      await client.query('ROLLBACK');
      if (err?.code === '23P01') return res.status(409).json({ error: 'PRIMARY_EQUIPMENT_ASSIGNMENT_OVERLAP', message: 'Equipment already has an overlapping Primary assignment.' });
      if (err?.code === '23514' || err?.code === '23503' || err?.code === 'P0001') return res.status(422).json({ error: 'INVALID_RESOURCE_ASSIGNMENT', message: err.message });
      return next(err);
    } finally { client.release(); }
  });

  router.get('/work-centers/:id', async (req, res, next) => {
    try {
      const detail = await pool.query(`SELECT wc.*, s.code AS site_code, s.name AS site_name, a.code AS area_code, a.name AS area_name FROM md_work_center wc JOIN md_site s ON s.master_id = wc.site_id JOIN md_production_area a ON a.master_id = wc.area_id WHERE wc.master_id = $1`, [req.params['id']]);
      if (!detail.rows[0]) return res.status(404).json({ error: 'Not Found' });
      const [workstations, assignments] = await Promise.all([
        pool.query(`SELECT ws.*, a.code AS area_code, a.name AS area_name FROM md_workstation ws LEFT JOIN md_production_area a ON a.master_id = ws.area_id WHERE ws.work_center_id = $1 ORDER BY ws.code`, [req.params['id']]),
        pool.query(`SELECT ra.*, ws.code AS workstation_code, ws.name AS workstation_name, eq.code AS equipment_code, eq.name AS equipment_name FROM md_resource_assignment ra LEFT JOIN md_workstation ws ON ws.master_id = ra.workstation_id LEFT JOIN md_equipment eq ON eq.master_id = ra.equipment_id WHERE ra.work_center_id = $1 ORDER BY ra.effective_from DESC`, [req.params['id']]),
      ]);
      return res.json({ data: { ...detail.rows[0], workstations: workstations.rows, assignments: assignments.rows } });
    } catch (err) { return next(err); }
  });

  router.get('/workstations/machine-availability', async (req, res, next) => {
    try {
      const effectiveFrom = new Date(String(req.query['effective_from'] || new Date().toISOString()));
      const effectiveTo = req.query['effective_to'] ? new Date(String(req.query['effective_to'])) : null;
      const workstationId = typeof req.query['workstation_id'] === 'string' && req.query['workstation_id'] ? req.query['workstation_id'] : null;
      const { rows } = await pool.query(`
        SELECT eq.master_id AS machine_id, eq.code, eq.name, eq.quantity,
               COUNT(mu.machine_unit_id) FILTER (WHERE mu.active_flag = TRUE) AS total_units,
               COUNT(mu.machine_unit_id) FILTER (WHERE mu.active_flag = TRUE AND mu.execution_status = 'Available'
                 AND NOT EXISTS (
                   SELECT 1 FROM md_resource_assignment ra
                   WHERE ra.machine_unit_id = mu.machine_unit_id
                     AND ra.assignment_role = 'Primary'
                     AND ra.workstation_id IS DISTINCT FROM $3::uuid
                     AND ra.effective_from < $2::timestamptz
                     AND $1::timestamptz < COALESCE(ra.effective_to, 'infinity'::timestamptz)
                 )) AS available_unit_count,
               COALESCE(jsonb_agg(jsonb_build_object('machine_unit_id', mu.machine_unit_id, 'code', mu.code, 'execution_status', mu.execution_status)) FILTER (WHERE mu.active_flag = TRUE AND mu.execution_status = 'Available'
                 AND NOT EXISTS (
                   SELECT 1 FROM md_resource_assignment ra
                   WHERE ra.machine_unit_id = mu.machine_unit_id
                     AND ra.assignment_role = 'Primary'
                     AND ra.workstation_id IS DISTINCT FROM $3::uuid
                     AND ra.effective_from < $2::timestamptz
                     AND $1::timestamptz < COALESCE(ra.effective_to, 'infinity'::timestamptz)
                 )), '[]'::jsonb) AS units
        FROM md_equipment eq
        LEFT JOIN md_machine_unit mu ON mu.machine_id = eq.master_id
        WHERE eq.active_flag = TRUE AND eq.execution_status = 'Available'
        GROUP BY eq.master_id, eq.code, eq.name, eq.quantity
        ORDER BY eq.code`, [effectiveFrom.toISOString(), effectiveTo ? effectiveTo.toISOString() : 'infinity', workstationId]);
      return res.json({ data: rows });
    } catch (err) { return next(err); }
  });

  router.get('/workstations/:id', async (req, res, next) => {
    try {
      const detail = await pool.query(`SELECT ws.*, s.code AS site_code, s.name AS site_name, a.code AS area_code, a.name AS area_name, wc.code AS work_center_code, wc.name AS work_center_name FROM md_workstation ws JOIN md_site s ON s.master_id = ws.site_id LEFT JOIN md_production_area a ON a.master_id = ws.area_id LEFT JOIN md_work_center wc ON wc.master_id = ws.work_center_id WHERE ws.master_id = $1`, [req.params['id']]);
      if (!detail.rows[0]) return res.status(404).json({ error: 'Not Found' });
      const assignments = await pool.query(`SELECT ra.*, wc.code AS work_center_code, wc.name AS work_center_name, eq.code AS equipment_code, eq.name AS equipment_name, mu.code AS machine_unit_code, mg.code AS machine_group_code FROM md_resource_assignment ra JOIN md_work_center wc ON wc.master_id = ra.work_center_id LEFT JOIN md_equipment eq ON eq.master_id = ra.equipment_id LEFT JOIN md_machine_unit mu ON mu.machine_unit_id = ra.machine_unit_id LEFT JOIN md_workstation_machine_group mg ON mg.master_id = ra.machine_group_id WHERE ra.workstation_id = $1 ORDER BY ra.effective_from DESC`, [req.params['id']]);
      const groups = await pool.query(`SELECT mg.*, s.code AS site_code, sf.code AS shopfloor_code, wc.code AS work_center_code, ws.code AS workstation_code FROM md_workstation_machine_group mg JOIN md_site s ON s.master_id = mg.site_id JOIN md_shopfloor sf ON sf.master_id = mg.shopfloor_id JOIN md_work_center wc ON wc.master_id = mg.work_center_id JOIN md_workstation ws ON ws.master_id = mg.workstation_id WHERE mg.workstation_id = $1 AND mg.lifecycle_status NOT IN ('Inactive','Obsolete') AND (mg.effective_to IS NULL OR mg.effective_to > NOW()) ORDER BY mg.code`, [req.params['id']]);
      const capabilities = await pool.query(`SELECT c.*, o.code AS operation_code, o.name AS operation_name FROM md_workstation_operation_capability c JOIN md_operation o ON o.master_id = c.operation_id WHERE c.workstation_id = $1 AND c.active_flag = TRUE AND (c.effective_to IS NULL OR c.effective_to > NOW()) ORDER BY c.effective_from DESC, o.code`, [req.params['id']]);
      for (const group of groups.rows) {
        group.members = assignments.rows.filter((assignment) => assignment.machine_group_id === group.master_id);
        const requirements = await pool.query(`SELECT r.*, eq.code AS machine_code, eq.name AS machine_name FROM md_workstation_machine_requirement r JOIN md_equipment eq ON eq.master_id = r.machine_id WHERE r.machine_group_id = $1 ORDER BY r.sequence_no`, [group.master_id]);
        group.requirements = requirements.rows;
      }
      return res.json({ data: { ...detail.rows[0], assignments: assignments.rows, machine_groups: groups.rows, operation_capabilities: capabilities.rows } });
    } catch (err) { return next(err); }
  });

  router.get(['/equipment/:id', '/machines/:id'], async (req, res, next) => {
    try {
      const detail = await pool.query(`SELECT eq.*, s.code AS site_code, s.name AS site_name, wc.code AS work_center_code, wc.name AS work_center_name FROM md_equipment eq JOIN md_site s ON s.master_id = eq.site_id LEFT JOIN md_work_center wc ON wc.master_id = eq.work_center_id WHERE eq.master_id = $1`, [req.params['id']]);
      if (!detail.rows[0]) return res.status(404).json({ error: 'Not Found' });
      const assignments = await pool.query(`SELECT ra.*, wc.code AS work_center_code, wc.name AS work_center_name, ws.code AS workstation_code, ws.name AS workstation_name, mg.code AS machine_group_code, mu.code AS machine_unit_code FROM md_resource_assignment ra JOIN md_work_center wc ON wc.master_id = ra.work_center_id LEFT JOIN md_workstation ws ON ws.master_id = ra.workstation_id LEFT JOIN md_workstation_machine_group mg ON mg.master_id = ra.machine_group_id LEFT JOIN md_machine_unit mu ON mu.machine_unit_id = ra.machine_unit_id WHERE ra.equipment_id = $1 ORDER BY ra.effective_from DESC`, [req.params['id']]);
      const units = await pool.query(`SELECT * FROM md_machine_unit WHERE machine_id = $1 ORDER BY unit_sequence`, [req.params['id']]);
      const skills = await pool.query(`SELECT rsa.assignment_id, rsa.minimum_level, rsa.required_flag, rsa.effective_from, rsa.effective_to, s.code AS skill_code, s.name AS skill_name, s.scope AS skill_scope FROM md_resource_skill_assignment rsa JOIN md_skill s ON s.master_id = rsa.skill_id WHERE rsa.resource_type = 'Machine' AND rsa.resource_id = $1 AND rsa.active_flag = TRUE AND rsa.effective_to IS NULL ORDER BY s.code`, [req.params['id']]);
      return res.json({ data: { ...detail.rows[0], assignments: assignments.rows, units: units.rows, skills: skills.rows, available_unit_count: units.rows.filter((unit) => unit.active_flag && unit.execution_status === 'Available').length } });
    } catch (err) { return next(err); }
  });

  router.post('/resource-planning/readiness', async (req, res, next) => {
    const body = normalizeBody(req.body);
    const siteId = String(body['site_id'] || '');
    const productRevisionId = String(body['product_revision_id'] || '');
    const routingOperationId = String(body['routing_operation_id'] || '');
    const workCenterId = String(body['work_center_id'] || '');
    const plannedDate = String(body['planned_date'] || '');
    const shiftId = String(body['shift_id'] || '');
    const quantity = Number(body['quantity']);
    if (!siteId || !productRevisionId || !routingOperationId || !workCenterId || !plannedDate || !shiftId || !Number.isFinite(quantity) || quantity <= 0) return res.status(422).json({ status: 'Blocked', blocking_errors: [{ code: 'READINESS_REQUEST_INVALID', message: 'site_id, product_revision_id, routing_operation_id, work_center_id, quantity, planned_date, and shift_id are required.' }], warnings: [], candidates: [] });
    try {
      const contextResult = await pool.query(`
        SELECT ro.master_id AS routing_operation_id, ro.operation_id, ro.seq, ro.queue_time_min, ro.move_time_min,
               op.code AS operation_code, op.name AS operation_name, wc.master_id AS work_center_id, wc.code AS work_center_code,
               wc.name AS work_center_name, wc.site_id, wc.active_flag AS work_center_active, pv.item_revision_id,
               r.revision_code, i.code AS item_code, i.name AS item_name, i.item_group
        FROM md_routing_operation ro
        JOIN md_routing_header rh ON rh.master_id = ro.routing_header_id
        JOIN md_operation op ON op.master_id = ro.operation_id
        JOIN md_work_center wc ON wc.master_id = ro.work_center_id
        JOIN md_production_version pv ON pv.routing_header_id = rh.master_id AND pv.item_revision_id = $2 AND pv.site_id = $1
        JOIN md_item_revision r ON r.master_id = pv.item_revision_id
        JOIN md_item i ON i.master_id = r.item_id
        WHERE ro.master_id = $3`, [siteId, productRevisionId, routingOperationId]);
      const context = contextResult.rows[0] as Record<string, any> | undefined;
      const blockingErrors: Array<Record<string, any>> = [];
      const warnings: Array<Record<string, any>> = [];
      if (!context) return res.status(404).json({ status: 'Blocked', blocking_errors: [{ code: 'ROUTING_OPERATION_NOT_FOUND' }], warnings: [], candidates: [] });
      if (context.site_id !== siteId || context.item_revision_id !== productRevisionId || context.work_center_id !== workCenterId || !context.work_center_active) blockingErrors.push({ code: 'ROUTING_CONTEXT_INVALID', message: 'Routing Operation, Production Version, Work Center, and Site must match an active planning context.' });
      const shift = await pool.query('SELECT master_id, code, name, start_time, end_time FROM md_shift WHERE master_id = $1 AND site_id = $2', [shiftId, siteId]);
      if (!shift.rows[0]) blockingErrors.push({ code: 'SHIFT_SITE_INVALID', message: 'Shift does not belong to the requested Site.' });
      const assignments = await pool.query(`
        SELECT ra.master_id AS assignment_id, ra.assignment_role, ra.effective_from, ra.effective_to,
               ws.master_id AS workstation_id, ws.code AS workstation_code, ws.name AS workstation_name, ws.active_flag AS workstation_active,
               eq.master_id AS equipment_id, eq.code AS equipment_code, eq.name AS equipment_name, eq.active_flag AS equipment_active,
               eq.execution_status, eq.planning_resource_flag, eq.default_efficiency
        FROM md_resource_assignment ra
        JOIN md_workstation ws ON ws.master_id = ra.workstation_id
        LEFT JOIN md_equipment eq ON eq.master_id = ra.equipment_id
        WHERE ra.site_id = $1 AND ra.work_center_id = $2 AND ra.scheduling_flag = TRUE
          AND ra.machine_group_id IS NULL
          AND ra.effective_from < ($3::date + INTERVAL '1 day') AND (ra.effective_to IS NULL OR ra.effective_to > $3::date)
          ORDER BY COALESCE(eq.code, ''), ws.code, ra.master_id`, [siteId, workCenterId, plannedDate]);
      const candidates: Array<Record<string, any>> = [];
      for (const assignment of assignments.rows as Array<Record<string, any>>) {
        const equipmentId = assignment.equipment_id || null;
        const capabilityResult = await pool.query(`
          SELECT rc.* FROM md_resource_capability rc
          WHERE rc.site_id = $1 AND rc.operation_id = $2 AND rc.active_flag = TRUE
            AND rc.effective_from < ($3::date + INTERVAL '1 day') AND (rc.effective_to IS NULL OR rc.effective_to > $3::date)
            AND (rc.product_revision_id = $4 OR (rc.product_revision_id IS NULL AND rc.item_group = $5))
            AND (rc.equipment_id IS NULL OR rc.equipment_id = $6)
          ORDER BY
            CASE WHEN rc.product_revision_id = $4 AND rc.equipment_id = $6 THEN 1
                 WHEN rc.product_revision_id = $4 AND rc.equipment_id IS NULL THEN 2
                 WHEN rc.product_revision_id IS NULL AND rc.equipment_id = $6 THEN 3 ELSE 4 END,
            rc.priority_no ASC, rc.speed_factor DESC, rc.code ASC LIMIT 1`, [siteId, context.operation_id, plannedDate, productRevisionId, context.item_group, equipmentId]);
        const capability = capabilityResult.rows[0] as Record<string, any> | undefined;
        const candidateWarnings: Array<Record<string, any>> = [];
        const candidateErrors: Array<Record<string, any>> = [];
        if (!capability) candidateErrors.push({ code: 'NO_EFFECTIVE_CAPABILITY' });
        else if (!capability.eligibility) candidateErrors.push({ code: 'CAPABILITY_EXPLICIT_DENY' });
        else {
          if (capability.min_lot_size !== null && quantity < Number(capability.min_lot_size)) candidateErrors.push({ code: 'LOT_SIZE_BELOW_MINIMUM', min_lot_size: capability.min_lot_size });
          if (capability.max_lot_size !== null && quantity > Number(capability.max_lot_size)) candidateErrors.push({ code: 'LOT_SIZE_ABOVE_MAXIMUM', max_lot_size: capability.max_lot_size });
        }
        if (!assignment.workstation_active) candidateErrors.push({ code: 'WORKSTATION_INACTIVE' });
        if (assignment.equipment_id && (!assignment.equipment_active || assignment.execution_status !== 'Available')) candidateErrors.push({ code: assignment.execution_status === 'OutOfService' ? 'EQUIPMENT_OUT_OF_SERVICE' : 'EQUIPMENT_NOT_AVAILABLE' });
        if (assignment.equipment_id && !assignment.planning_resource_flag) candidateErrors.push({ code: 'EQUIPMENT_NOT_PLANNING_RESOURCE' });
        const resourceCalendar = await pool.query(`
          SELECT c.* FROM md_resource_calendar c
          WHERE c.site_id = $1 AND c.calendar_date = $2::date AND c.shift_id = $3
            AND ((c.resource_type = 'Equipment' AND c.resource_id = $4)
              OR (c.resource_type = 'Workstation' AND c.resource_id = $5)
              OR (c.resource_type = 'WorkCenter' AND c.resource_id = $6))
          ORDER BY CASE c.resource_type WHEN 'Equipment' THEN 1 WHEN 'Workstation' THEN 2 ELSE 3 END LIMIT 1`, [siteId, plannedDate, shiftId, equipmentId, assignment.workstation_id, workCenterId]);
        const calendar = resourceCalendar.rows[0] as Record<string, any> | undefined;
        if (!calendar) candidateWarnings.push({ code: 'CALENDAR_FALLBACK_DEFAULT_SHIFT' });
        else if (calendar.availability_status !== 'Available' || Number(calendar.available_minutes) <= 0 || Number(calendar.capacity_factor) <= 0) candidateErrors.push({ code: calendar.availability_status === 'Holiday' ? 'CALENDAR_HOLIDAY' : 'CALENDAR_UNAVAILABLE' });
        const standardResult = await pool.query(`
          SELECT ps.* FROM md_production_standard ps
          WHERE ps.site_id = $1 AND ps.item_revision_id = $2 AND ps.work_center_id = $3
            AND (ps.routing_operation_id = $4 OR (ps.routing_operation_id IS NULL AND ps.operation_id = $5))
            AND ps.lifecycle_status = 'Released' AND ps.valid_from <= ($6::date + INTERVAL '1 day')
            AND (ps.valid_to IS NULL OR ps.valid_to > $6::date)
            AND (ps.equipment_id IS NULL OR ps.equipment_id = $7)
          ORDER BY CASE WHEN ps.equipment_id = $7 THEN 1 ELSE 2 END, ps.valid_from DESC, ps.code ASC LIMIT 1`, [siteId, productRevisionId, workCenterId, routingOperationId, context.operation_id, plannedDate, equipmentId]);
        const standard = standardResult.rows[0] as Record<string, any> | undefined;
        if (!standard) candidateErrors.push({ code: 'NO_EFFECTIVE_PRODUCTION_STANDARD' });
        else if (!standard.equipment_id && equipmentId) candidateWarnings.push({ code: 'WORK_CENTER_STANDARD_FALLBACK' });
        const skillResult = await pool.query(`
          SELECT osr.master_id, osr.required_persons, osr.minimum_level, osr.mandatory_flag, sk.code AS skill_code, sk.name AS skill_name
          FROM md_operation_skill_requirement osr JOIN md_skill sk ON sk.master_id = osr.skill_id
          WHERE osr.routing_operation_id = $1 AND osr.active_flag = TRUE AND osr.effective_from < ($2::date + INTERVAL '1 day')
            AND (osr.effective_to IS NULL OR osr.effective_to > $2::date) ORDER BY sk.code`, [routingOperationId, plannedDate]);
        const calendarMinutes = calendar ? Number(calendar.available_minutes) : 480;
        const calendarFactor = calendar ? Number(calendar.capacity_factor) : 1;
        const standardEfficiency = standard ? Number(standard.efficiency_factor || 1) : 1;
        const capabilitySpeed = capability ? Number(capability.speed_factor || 1) : 1;
        const equipmentEfficiency = Number(assignment.default_efficiency || 1);
        const baseQuantity = standard ? Number(standard.base_quantity || 1) : 1;
        const adjustedCycleTime = standard ? Number(standard.cycle_time_sec) / capabilitySpeed / standardEfficiency / equipmentEfficiency / calendarFactor : null;
        const runDuration = adjustedCycleTime === null ? null : (quantity / baseQuantity) * adjustedCycleTime / 60;
        const estimatedDuration = runDuration === null ? null : Number((Number(standard?.setup_time_min || 0) + runDuration + Number(context.queue_time_min || 0) + Number(context.move_time_min || 0)).toFixed(3));
        candidates.push({
          workstation: { id: assignment.workstation_id, code: assignment.workstation_code, name: assignment.workstation_name },
          equipment: assignment.equipment_id ? { id: assignment.equipment_id, code: assignment.equipment_code, name: assignment.equipment_name, execution_status: assignment.execution_status } : null,
          assignment: { id: assignment.assignment_id, role: assignment.assignment_role },
          capability: capability ? { id: capability.master_id, code: capability.code, priority_no: capability.priority_no, speed_factor: capability.speed_factor, specificity: capability.equipment_id ? 'Equipment' : 'WorkCenter' } : null,
          calendar: calendar ? { id: calendar.master_id, resource_type: calendar.resource_type, availability_status: calendar.availability_status, available_minutes: calendar.available_minutes, capacity_factor: calendar.capacity_factor } : { availability_status: 'Fallback', available_minutes: 480, capacity_factor: 1 },
          production_standard: standard ? { id: standard.master_id, code: standard.code, level: standard.equipment_id ? 'Equipment' : 'WorkCenter', base_quantity: standard.base_quantity, setup_time_min: standard.setup_time_min, cycle_time_sec: standard.cycle_time_sec, labor_count: standard.labor_count, efficiency_factor: standard.efficiency_factor } : null,
          skill_requirements: skillResult.rows,
          estimated_duration_min: estimatedDuration,
          calculation: { adjusted_cycle_time_sec: adjustedCycleTime, run_duration_min: runDuration, setup_time_min: Number(standard?.setup_time_min || 0), queue_time_min: Number(context.queue_time_min || 0), move_time_min: Number(context.move_time_min || 0), formula: 'setup + ((quantity / baseQuantity) * cycleSec / capabilitySpeed / standardEfficiency / equipmentEfficiency / calendarCapacityFactor) / 60 + queue + move' },
          readiness: candidateErrors.length ? 'Blocked' : candidateWarnings.length ? 'ReadyWithWarnings' : 'Eligible',
          blocking_errors: candidateErrors,
          warnings: candidateWarnings,
        });
      }
      const groupRows = await pool.query(`SELECT mg.*, ws.code AS workstation_code, ws.name AS workstation_name FROM md_workstation_machine_group mg JOIN md_workstation ws ON ws.master_id = mg.workstation_id WHERE mg.site_id = $1 AND mg.work_center_id = $2 AND mg.lifecycle_status NOT IN ('Inactive','Obsolete') AND mg.effective_from < ($3::date + INTERVAL '1 day') AND (mg.effective_to IS NULL OR mg.effective_to > $3::date) ORDER BY mg.code`, [siteId, workCenterId, plannedDate]);
      for (const group of groupRows.rows as Array<Record<string, any>>) {
        const memberRows = await pool.query(`SELECT ra.master_id AS assignment_id, ra.assignment_role AS role, ra.requirement_type, ra.effective_from, ra.effective_to, eq.master_id AS machine_id, eq.code AS machine_code, eq.name AS machine_name, eq.active_flag AS machine_active, eq.execution_status AS machine_execution_status, eq.planning_resource_flag, eq.default_efficiency, mu.machine_unit_id, mu.code AS machine_unit_code, mu.execution_status AS unit_execution_status FROM md_resource_assignment ra JOIN md_equipment eq ON eq.master_id = ra.equipment_id LEFT JOIN md_machine_unit mu ON mu.machine_unit_id = ra.machine_unit_id WHERE ra.machine_group_id = $1 AND ra.effective_from < ($2::date + INTERVAL '1 day') AND (ra.effective_to IS NULL OR ra.effective_to > $2::date) ORDER BY ra.sequence_no`, [group.master_id, plannedDate]);
        const members = memberRows.rows as Array<Record<string, any>>;
        const primary = members.filter((member) => member.role === 'Primary');
        const candidateErrors: Array<Record<string, any>> = [];
        const candidateWarnings: Array<Record<string, any>> = [];
        if (!members.length) candidateErrors.push({ code: 'MACHINE_GROUP_INSUFFICIENT_ACTIVE_MEMBERS' });
        if (primary.length === 0) candidateErrors.push({ code: 'MACHINE_GROUP_NO_PRIMARY' });
        if (primary.length > 1) candidateErrors.push({ code: 'MACHINE_GROUP_MULTIPLE_PRIMARY' });
        if (members.length < Number(group.minimum_required_machines || 1)) candidateErrors.push({ code: 'MACHINE_GROUP_INSUFFICIENT_ACTIVE_MEMBERS' });
        const primaryMember = primary[0];
        if (primaryMember && (!primaryMember.machine_active || primaryMember.machine_execution_status !== 'Available' || !primaryMember.unit_execution_status || primaryMember.unit_execution_status !== 'Available')) candidateErrors.push({ code: primaryMember.machine_execution_status === 'OutOfService' ? 'PRIMARY_MACHINE_UNAVAILABLE' : 'PRIMARY_MACHINE_UNAVAILABLE' });
        for (const member of members.filter((item) => item.role === 'Supporting')) {
          const unavailable = !member.machine_active || member.machine_execution_status !== 'Available' || member.unit_execution_status !== 'Available';
          if (unavailable && member.requirement_type === 'Required') candidateErrors.push({ code: 'REQUIRED_SUPPORTING_MACHINE_UNAVAILABLE', machine_code: member.machine_code });
          if (unavailable && member.requirement_type === 'Optional') candidateWarnings.push({ code: 'OPTIONAL_SUPPORTING_MACHINE_UNAVAILABLE', machine_code: member.machine_code });
        }
        if (!primaryMember) {
          candidates.push({ workstation: { id: group.workstation_id, code: null, name: null }, machine_group: { id: group.master_id, code: group.code, name: group.name }, primary_machine: null, supporting_machines: [], equipment: null, readiness: 'Blocked', blocking_errors: candidateErrors, warnings: candidateWarnings });
          continue;
        }
        const primaryId = primaryMember.machine_id;
        const capabilityResult = await pool.query(`SELECT rc.* FROM md_resource_capability rc WHERE rc.site_id = $1 AND rc.operation_id = $2 AND rc.active_flag = TRUE AND rc.effective_from < ($3::date + INTERVAL '1 day') AND (rc.effective_to IS NULL OR rc.effective_to > $3::date) AND (rc.product_revision_id = $4 OR (rc.product_revision_id IS NULL AND rc.item_group = $5)) AND (rc.equipment_id IS NULL OR rc.equipment_id = $6) ORDER BY CASE WHEN rc.product_revision_id = $4 AND rc.equipment_id = $6 THEN 1 WHEN rc.product_revision_id = $4 AND rc.equipment_id IS NULL THEN 2 ELSE 3 END, rc.priority_no LIMIT 1`, [siteId, context.operation_id, plannedDate, productRevisionId, context.item_group, primaryId]);
        const capability = capabilityResult.rows[0] as Record<string, any> | undefined;
        if (!capability) candidateErrors.push({ code: 'NO_EFFECTIVE_CAPABILITY' }); else if (!capability.eligibility) candidateErrors.push({ code: 'CAPABILITY_EXPLICIT_DENY' });
        const calendarResult = await pool.query(`SELECT c.* FROM md_resource_calendar c WHERE c.site_id = $1 AND c.calendar_date = $2::date AND c.shift_id = $3 AND ((c.resource_type = 'Equipment' AND c.resource_id = $4) OR (c.resource_type = 'Workstation' AND c.resource_id = $5) OR (c.resource_type = 'WorkCenter' AND c.resource_id = $6)) ORDER BY CASE c.resource_type WHEN 'Equipment' THEN 1 WHEN 'Workstation' THEN 2 ELSE 3 END LIMIT 1`, [siteId, plannedDate, shiftId, primaryId, group.workstation_id, workCenterId]);
        const calendar = calendarResult.rows[0] as Record<string, any> | undefined;
        if (!calendar) candidateWarnings.push({ code: 'CALENDAR_FALLBACK_DEFAULT_SHIFT' }); else if (calendar.availability_status !== 'Available' || Number(calendar.available_minutes) <= 0 || Number(calendar.capacity_factor) <= 0) candidateErrors.push({ code: 'CALENDAR_UNAVAILABLE' });
        for (const member of members.filter((item) => item.role === 'Supporting' && item.requirement_type === 'Required')) {
          const memberCalendar = await pool.query(`SELECT 1 FROM md_resource_calendar c WHERE c.site_id = $1 AND c.calendar_date = $2::date AND c.shift_id = $3 AND c.resource_type = 'Equipment' AND c.resource_id = $4 AND c.availability_status = 'Available' AND c.available_minutes > 0 AND c.capacity_factor > 0 LIMIT 1`, [siteId, plannedDate, shiftId, member.machine_id]);
          if (!memberCalendar.rows[0]) candidateErrors.push({ code: 'REQUIRED_SUPPORTING_MACHINE_UNAVAILABLE', machine_code: member.machine_code });
        }
        const standardResult = await pool.query(`SELECT ps.* FROM md_production_standard ps WHERE ps.site_id = $1 AND ps.item_revision_id = $2 AND ps.work_center_id = $3 AND (ps.routing_operation_id = $4 OR (ps.routing_operation_id IS NULL AND ps.operation_id = $5)) AND ps.lifecycle_status = 'Released' AND ps.valid_from <= ($6::date + INTERVAL '1 day') AND (ps.valid_to IS NULL OR ps.valid_to > $6::date) AND (ps.equipment_id IS NULL OR ps.equipment_id = $7) ORDER BY CASE WHEN ps.equipment_id = $7 THEN 1 ELSE 2 END, ps.valid_from DESC LIMIT 1`, [siteId, productRevisionId, workCenterId, routingOperationId, context.operation_id, plannedDate, primaryId]);
        const standard = standardResult.rows[0] as Record<string, any> | undefined;
        if (!standard) candidateErrors.push({ code: 'NO_EFFECTIVE_PRODUCTION_STANDARD' });
        const standardRow = standard || {};
        const calendarMinutes = calendar ? Number(calendar.available_minutes) : 480; const calendarFactor = calendar ? Number(calendar.capacity_factor) : 1; const adjustedCycleTime = standard ? Number(standardRow.cycle_time_sec) / Number(capability?.speed_factor || 1) / Number(standardRow.efficiency_factor || 1) / Number(primaryMember.default_efficiency || 1) / calendarFactor : null; const runDuration = adjustedCycleTime === null ? null : (quantity / Number(standardRow.base_quantity || 1)) * adjustedCycleTime / 60; const estimatedDuration = runDuration === null ? null : Number((Number(standardRow.setup_time_min || 0) + runDuration + Number(context.queue_time_min || 0) + Number(context.move_time_min || 0)).toFixed(3));
        candidates.push({ workstation: { id: group.workstation_id, code: group.workstation_code, name: group.workstation_name }, machine_group: { id: group.master_id, code: group.code, name: group.name, minimum_required_machines: group.minimum_required_machines }, primary_machine: { id: primaryMember.machine_id, code: primaryMember.machine_code, name: primaryMember.machine_name, unit_id: primaryMember.machine_unit_id, unit_code: primaryMember.machine_unit_code }, supporting_machines: members.filter((member) => member.role === 'Supporting').map((member) => ({ id: member.machine_id, code: member.machine_code, name: member.machine_name, unit_id: member.machine_unit_id, unit_code: member.machine_unit_code, required: member.requirement_type === 'Required', readiness: member.machine_execution_status === 'Available' && member.unit_execution_status === 'Available' ? 'Available' : 'Unavailable' })), equipment: { id: primaryMember.machine_id, code: primaryMember.machine_code, name: primaryMember.machine_name, execution_status: primaryMember.machine_execution_status }, assignment: { id: primaryMember.assignment_id, role: 'Primary' }, capability: capability ? { id: capability.master_id, code: capability.code, priority_no: capability.priority_no, speed_factor: capability.speed_factor, specificity: capability.equipment_id ? 'Equipment' : 'WorkCenter' } : null, calendar: calendar ? { id: calendar.master_id, resource_type: calendar.resource_type, availability_status: calendar.availability_status, available_minutes: calendar.available_minutes, capacity_factor: calendar.capacity_factor } : { availability_status: 'Fallback', available_minutes: 480, capacity_factor: 1 }, production_standard: standard ? { id: standard.master_id, code: standard.code, level: standard.equipment_id ? 'Equipment' : 'WorkCenter' } : null, estimated_duration_min: estimatedDuration, calculation: { adjusted_cycle_time_sec: adjustedCycleTime, run_duration_min: runDuration, setup_time_min: Number(standard?.setup_time_min || 0), queue_time_min: Number(context.queue_time_min || 0), move_time_min: Number(context.move_time_min || 0), formula: 'group primary standard plus required supporting availability' }, readiness: candidateErrors.length ? 'Blocked' : candidateWarnings.length ? 'ReadyWithWarnings' : 'Eligible', blocking_errors: candidateErrors, warnings: candidateWarnings });
      }
      candidates.sort((a, b) => {
        const readinessRank = (value: string) => value === 'Eligible' ? 0 : value === 'ReadyWithWarnings' ? 1 : 2;
        return readinessRank(a.readiness) - readinessRank(b.readiness) || Number(a.capability?.priority_no || 999999) - Number(b.capability?.priority_no || 999999) || Number(b.capability?.speed_factor || 0) - Number(a.capability?.speed_factor || 0) || String(a.equipment?.code || a.workstation?.code || '').localeCompare(String(b.equipment?.code || b.workstation?.code || ''));
      });
      const eligible = candidates.filter((candidate) => candidate.readiness === 'Eligible');
      const warningCandidates = candidates.filter((candidate) => candidate.readiness === 'ReadyWithWarnings');
      if (!assignments.rows.length && !groupRows.rows.length) blockingErrors.push({ code: 'NO_EFFECTIVE_ASSIGNMENT' });
      const status = blockingErrors.length || (!eligible.length && !warningCandidates.length) ? 'Blocked' : warningCandidates.length ? 'ReadyWithWarnings' : 'Ready';
      return res.json({ status, work_center: { id: context.work_center_id, code: context.work_center_code, name: context.work_center_name }, operation: { id: routingOperationId, code: context.operation_code, name: context.operation_name, sequence: context.seq }, candidates, blocking_errors: blockingErrors, warnings });
    } catch (err) { return next(err); }
  });

  router.get('/:resource', async (req, res, next) => {
    try {
      const table = requireTable(req.params['resource'] ?? '');
      const limit = Math.min(Number(req.query['limit'] ?? 100), 500);
      const params: unknown[] = [limit];
      let where = '';
      if (table.tableName === 'md_employee' && typeof req.query['work_center_id'] === 'string' && req.query['work_center_id']) {
        params.push(req.query['work_center_id']);
        where = `WHERE default_work_center_id = $2`;
      }
      if (table.tableName === 'md_resource_capability' && typeof req.query['work_center_id'] === 'string' && req.query['work_center_id']) {
        params.push(req.query['work_center_id']);
        where = `WHERE md_resource_capability.work_center_id = $2`;
      }
      if (['md_production_version', 'md_mbom_header', 'md_routing_header'].includes(table.tableName)) {
        const filters: string[] = [];
        if (table.tableName !== 'md_routing_header' && typeof req.query['item_revision_id'] === 'string' && req.query['item_revision_id']) { params.push(req.query['item_revision_id']); filters.push(`${table.tableName}.item_revision_id = $${params.length}`); }
        if (table.tableName !== 'md_routing_header' && typeof req.query['site_id'] === 'string' && req.query['site_id']) { params.push(req.query['site_id']); filters.push(`${table.tableName}.site_id = $${params.length}`); }
        if (typeof req.query['lifecycle_status'] === 'string' && req.query['lifecycle_status']) { params.push(req.query['lifecycle_status']); filters.push(`${table.tableName}.lifecycle_status = $${params.length}`); }
        if (filters.length) where = `WHERE ${filters.join(' AND ')}`;
      }
      let query = `SELECT * FROM ${table.tableName} ${where} ORDER BY code, version_no LIMIT $1`;
      if (table.tableName === 'md_skill') {
        const scopeFilter = typeof req.query['scope'] === 'string' && req.query['scope'] ? `AND sk.scope = $2` : '';
        if (scopeFilter) params.push(String(req.query['scope']));
        query = `SELECT sk.*, sg.code AS skill_group_code, sg.name AS skill_group_name FROM md_skill sk LEFT JOIN md_skill_group sg ON sg.skill_group_id = sk.skill_group_id AND sg.legacy_flag = FALSE WHERE sk.legacy_flag = FALSE ${scopeFilter} ORDER BY sk.code LIMIT $1`;
      } else if (table.tableName === 'md_workstation_operation_capability') {
        query = `SELECT c.*, o.code AS operation_code, o.name AS operation_name, ws.code AS workstation_code, ws.name AS workstation_name FROM md_workstation_operation_capability c JOIN md_operation o ON o.master_id = c.operation_id JOIN md_workstation ws ON ws.master_id = c.workstation_id ORDER BY ws.code, o.code LIMIT $1`;
      } else if (table.tableName === 'md_work_center_composition') {
        query = `SELECT c.*, wc.code AS work_center_code, wc.name AS work_center_name, ws.code AS workstation_code, ws.name AS workstation_name, o.code AS operation_code, o.name AS operation_name FROM md_work_center_composition c JOIN md_work_center wc ON wc.master_id = c.work_center_id JOIN md_workstation ws ON ws.master_id = c.workstation_id JOIN md_operation o ON o.master_id = c.operation_id ORDER BY wc.code, ws.code, o.code LIMIT $1`;
      } else if (table.tableName === 'md_workstation_machine_requirement') {
        query = `SELECT r.*, mg.code AS machine_group_code, eq.code AS machine_code, eq.name AS machine_name FROM md_workstation_machine_requirement r JOIN md_workstation_machine_group mg ON mg.master_id = r.machine_group_id JOIN md_equipment eq ON eq.master_id = r.machine_id ORDER BY mg.code, r.sequence_no LIMIT $1`;
      } else if (table.tableName === 'md_production_version') {
        query = `SELECT pv.*, mb.code AS mbom_code, mb.name AS mbom_name,
                        rt.code AS routing_code, rt.name AS routing_name, s.code AS site_code,
                        r.revision_code, i.code AS item_code, i.name AS item_name
                 FROM md_production_version pv
                 LEFT JOIN md_mbom_header mb ON mb.master_id = pv.mbom_header_id
                 LEFT JOIN md_routing_header rt ON rt.master_id = pv.routing_header_id
                 LEFT JOIN md_site s ON s.master_id = pv.site_id
                 LEFT JOIN md_item_revision r ON r.master_id = pv.item_revision_id
                 LEFT JOIN md_item i ON i.master_id = r.item_id
                 ${where.replaceAll('md_production_version.', 'pv.')} ORDER BY pv.code, pv.version_no LIMIT $1`;
      } else if (table.tableName === 'md_routing_header') {
        query = `SELECT rt.*,
                        (SELECT COUNT(*)::INT FROM md_routing_operation ro WHERE ro.routing_header_id = rt.master_id) AS operation_count,
                        (SELECT COUNT(DISTINCT wc.site_id)::INT FROM md_routing_operation ro JOIN md_work_center wc ON wc.master_id = ro.work_center_id WHERE ro.routing_header_id = rt.master_id) AS factory_count
                 FROM md_routing_header rt
                 ${where.replaceAll('md_routing_header.', 'rt.')} ORDER BY rt.code, rt.version_no LIMIT $1`;
      } else if (table.tableName === 'md_mbom_header') {
        query = `SELECT mb.*, r.revision_code, i.code AS item_code, i.name AS item_name, s.code AS site_code,
                        u.code AS base_uom_code
                 FROM md_mbom_header mb
                 LEFT JOIN md_item_revision r ON r.master_id = mb.item_revision_id
                 LEFT JOIN md_item i ON i.master_id = r.item_id
                 LEFT JOIN md_site s ON s.master_id = mb.site_id
                 LEFT JOIN md_uom u ON u.master_id = mb.base_uom_id
                 ${where.replaceAll('md_mbom_header.', 'mb.')} ORDER BY mb.code, mb.version_no LIMIT $1`;
      } else if (table.tableName === 'md_routing_operation') {
        query = `SELECT ro.*, op.code AS operation_code, op.name AS operation_name, op.description AS operation_description,
                        op.operation_type, op.confirmation_mode, op.quantity_reporting,
                        op.requires_material_scan, op.requires_output_label, op.allow_partial_completion,
                        wc.code AS work_center_code, wc.name AS work_center_name,
                        sf.code AS shopfloor_code, sf.name AS shopfloor_name,
                        s.code AS factory_code, s.name AS factory_name
                 FROM md_routing_operation ro
                 LEFT JOIN md_operation op ON op.master_id = ro.operation_id
                 LEFT JOIN md_work_center wc ON wc.master_id = ro.work_center_id
                 LEFT JOIN md_shopfloor sf ON sf.master_id = wc.shopfloor_id
                 LEFT JOIN md_site s ON s.master_id = wc.site_id
                 ${where.replaceAll('md_routing_operation.', 'ro.')} ORDER BY ro.routing_header_id, ro.seq LIMIT $1`;
      } else if (table.tableName === 'md_resource_capability') {
        query = `SELECT rc.*, op.code AS operation_code, op.name AS operation_name, wc.code AS work_center_code, wc.name AS work_center_name,
                        r.revision_code, i.code AS item_code, i.name AS item_name, eq.code AS equipment_code, eq.name AS equipment_name
                 FROM md_resource_capability rc
                 LEFT JOIN md_operation op ON op.master_id = rc.operation_id
                 LEFT JOIN md_work_center wc ON wc.master_id = rc.work_center_id
                 LEFT JOIN md_item_revision r ON r.master_id = rc.product_revision_id
                 LEFT JOIN md_item i ON i.master_id = r.item_id
                 LEFT JOIN md_equipment eq ON eq.master_id = rc.equipment_id
                 ${where.replaceAll('md_resource_capability.', 'rc.')} ORDER BY op.code LIMIT $1`;
      } else if (table.tableName === 'md_resource_calendar') {
        query = `SELECT c.*, s.code AS site_code, s.name AS site_name, sh.code AS shift_code, sh.name AS shift_name,
                        wc.code AS work_center_code, wc.name AS work_center_name, ws.code AS workstation_code, ws.name AS workstation_name,
                        eq.code AS equipment_code, eq.name AS equipment_name, rs.code AS reason_code, rs.name AS reason_name
                 FROM md_resource_calendar c
                 LEFT JOIN md_site s ON s.master_id = c.site_id
                 LEFT JOIN md_shift sh ON sh.master_id = c.shift_id
                 LEFT JOIN md_work_center wc ON wc.master_id = c.resource_id AND c.resource_type = 'WorkCenter'
                 LEFT JOIN md_workstation ws ON ws.master_id = c.resource_id AND c.resource_type = 'Workstation'
                 LEFT JOIN md_equipment eq ON eq.master_id = c.resource_id AND c.resource_type = 'Equipment'
                 LEFT JOIN md_reason_code rs ON rs.master_id = c.reason_id
                 ORDER BY c.calendar_date DESC, c.resource_type, c.resource_id LIMIT $1`;
      } else if (table.tableName === 'md_production_standard') {
        query = `SELECT ps.*, r.revision_code, i.code AS item_code, i.name AS item_name, ro.code AS routing_operation_code,
                        ro.seq AS routing_operation_seq, op.code AS operation_code, op.name AS operation_name,
                        wc.code AS work_center_code, wc.name AS work_center_name, eq.code AS equipment_code, eq.name AS equipment_name
                 FROM md_production_standard ps
                 LEFT JOIN md_item_revision r ON r.master_id = ps.item_revision_id
                 LEFT JOIN md_item i ON i.master_id = r.item_id
                 LEFT JOIN md_routing_operation ro ON ro.master_id = ps.routing_operation_id
                 LEFT JOIN md_operation op ON op.master_id = ps.operation_id
                 LEFT JOIN md_work_center wc ON wc.master_id = ps.work_center_id
                 LEFT JOIN md_equipment eq ON eq.master_id = ps.equipment_id
                 ORDER BY ps.valid_from DESC, ps.code LIMIT $1`;
      } else if (table.tableName === 'md_operation_skill_requirement') {
        query = `SELECT osr.*, rth.code AS routing_code, ro.code AS routing_operation_code, ro.seq AS operation_seq,
                        op.code AS operation_code, op.name AS operation_name, sk.code AS skill_code, sk.name AS skill_name
                 FROM md_operation_skill_requirement osr
                 LEFT JOIN md_routing_operation ro ON ro.master_id = osr.routing_operation_id
                 LEFT JOIN md_routing_header rth ON rth.master_id = ro.routing_header_id
                 LEFT JOIN md_operation op ON op.master_id = ro.operation_id
                 LEFT JOIN md_skill sk ON sk.master_id = osr.skill_id
                 ORDER BY rth.code, ro.seq, sk.code LIMIT $1`;
      } else if (table.tableName === 'md_shopfloor') {
        query = `SELECT sf.*, s.code AS site_code, s.name AS site_name,
                        (SELECT COUNT(*)::INT FROM md_work_center wc WHERE wc.shopfloor_id = sf.master_id) AS work_center_count,
                        (SELECT COUNT(*)::INT FROM md_workstation ws JOIN md_work_center wc ON wc.master_id = ws.work_center_id WHERE wc.shopfloor_id = sf.master_id) AS workstation_count,
                        (SELECT COUNT(*)::INT FROM md_equipment eq JOIN md_resource_assignment ra ON ra.equipment_id = eq.master_id JOIN md_work_center wc ON wc.master_id = ra.work_center_id WHERE wc.shopfloor_id = sf.master_id AND (ra.effective_to IS NULL OR ra.effective_to > NOW())) AS machine_count
                 FROM md_shopfloor sf JOIN md_site s ON s.master_id = sf.site_id ORDER BY sf.code LIMIT $1`;
      } else if (table.tableName === 'md_production_area') {
        query = `SELECT a.*, s.code AS site_code, s.name AS site_name,
                        (SELECT COUNT(*)::INT FROM md_production_area child WHERE child.parent_area_id = a.master_id) AS child_count,
                        (SELECT COUNT(*)::INT FROM md_work_center wc WHERE wc.area_id = a.master_id) AS work_center_count
                 FROM md_production_area a JOIN md_site s ON s.master_id = a.site_id
                 ORDER BY a.site_id, a.parent_area_id NULLS FIRST, a.sequence_no, a.code LIMIT $1`;
      } else if (table.tableName === 'md_work_center') {
        query = `SELECT wc.*, s.code AS site_code, s.name AS site_name, a.code AS area_code, a.name AS area_name,
                        (SELECT COUNT(*)::INT FROM md_workstation ws WHERE ws.work_center_id = wc.master_id) AS workstation_count,
                        (SELECT COUNT(*)::INT FROM md_resource_assignment ra WHERE ra.work_center_id = wc.master_id AND (ra.effective_to IS NULL OR ra.effective_to > NOW())) AS active_assignment_count
                 FROM md_work_center wc JOIN md_site s ON s.master_id = wc.site_id JOIN md_production_area a ON a.master_id = wc.area_id
                 ORDER BY wc.code, wc.version_no LIMIT $1`;
      } else if (table.tableName === 'md_workstation') {
        query = `SELECT ws.*, s.code AS site_code, s.name AS site_name, a.code AS area_code, a.name AS area_name,
                        wc.code AS work_center_code, wc.name AS work_center_name,
                        (SELECT COUNT(*)::INT FROM md_resource_assignment ra WHERE ra.workstation_id = ws.master_id AND (ra.effective_to IS NULL OR ra.effective_to > NOW())) AS active_assignment_count
                 FROM md_workstation ws JOIN md_site s ON s.master_id = ws.site_id LEFT JOIN md_production_area a ON a.master_id = ws.area_id LEFT JOIN md_work_center wc ON wc.master_id = ws.work_center_id
                 ORDER BY ws.code, ws.version_no LIMIT $1`;
      } else if (table.tableName === 'md_equipment') {
        query = `SELECT eq.*, s.code AS site_code, s.name AS site_name, wc.code AS work_center_code, wc.name AS work_center_name,
                        (SELECT COUNT(*)::INT FROM md_machine_unit mu WHERE mu.machine_id = eq.master_id AND mu.active_flag = TRUE AND mu.execution_status = 'Available' AND NOT EXISTS (SELECT 1 FROM md_resource_assignment ra WHERE ra.machine_unit_id = mu.machine_unit_id AND ra.assignment_role = 'Primary' AND ra.effective_from < NOW() AND NOW() < COALESCE(ra.effective_to, 'infinity'::timestamptz))) AS available_unit_count,
                        (SELECT COUNT(*)::INT FROM md_resource_assignment ra WHERE ra.equipment_id = eq.master_id AND (ra.effective_to IS NULL OR ra.effective_to > NOW())) AS active_assignment_count
                 FROM md_equipment eq JOIN md_site s ON s.master_id = eq.site_id LEFT JOIN md_work_center wc ON wc.master_id = eq.work_center_id
                 ORDER BY eq.code, eq.version_no LIMIT $1`;
      } else if (table.tableName === 'md_item_revision') {
        query = `SELECT r.*, i.code AS item_code, i.name AS item_name,
                    EXISTS (SELECT 1 FROM md_production_version pv WHERE pv.item_revision_id = r.master_id AND pv.lifecycle_status = 'Released') AS has_production_configuration
                 FROM md_item_revision r
                 LEFT JOIN md_item i ON i.master_id = r.item_id
                 ${where.replaceAll('md_item_revision.', 'r.')} ORDER BY r.code, r.version_no LIMIT $1`;
      }
      const { rows } = await pool.query(query, params);
      res.json({ data: rows });
    } catch (err) {
      next(err);
    }
  });

  router.get('/routing-headers/code-preview', async (_req, res, next) => {
    try {
      res.json(await routingCodePreview(pool));
    } catch (err) {
      next(err);
    }
  });

  router.post('/business-codes/reservations', async (req, res, next) => {
    const context = getContext(req); const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const entityType = String(normalizeBody(req.body)['entity_type'] || '');
      const reservation = await reserveBusinessCode(client, entityType, context);
      await client.query('COMMIT');
      return res.status(201).json({ data: reservation });
    } catch (err) { await client.query('ROLLBACK'); return next(err); } finally { client.release(); }
  });

  router.get('/:resource/:id', async (req, res, next) => {
    try {
      const table = requireTable(req.params['resource'] ?? '');
      const { rows } = await pool.query(`SELECT * FROM ${table.tableName} WHERE master_id = $1`, [req.params['id']]);
      if (!rows[0]) return res.status(404).json({ error: 'Not Found' });
      return res.json(rows[0]);
    } catch (err) {
      return next(err);
    }
  });

  router.put('/skills/:id', async (req, res, next) => {
    const body = normalizeBody(req.body);
    const context = getContext(req);
    try {
      if (body['scope'] !== undefined || body['scope_type'] !== undefined || body['skill_group_id'] !== undefined) return res.status(409).json({ error: 'SKILL_SCOPE_IMMUTABLE' });
      const allowed = ['name', 'description', 'minimum_level', 'lifecycle_status'];
      const columns = allowed.filter((column) => body[column] !== undefined);
      if (body['name'] !== undefined && !localizedTextSchema.safeParse(body['name']).success) return res.status(422).json({ error: 'SKILL_NAME_INVALID' });
      if (!columns.length) return res.status(400).json({ error: 'No update fields provided' });
      const existing = await pool.query(`SELECT master_id, scope FROM md_skill WHERE master_id = $1 AND legacy_flag = FALSE`, [req.params['id']]);
      if (!existing.rows[0]) return res.status(404).json({ error: 'SKILL_NOT_FOUND' });
      if (body['name'] !== undefined) {
        const duplicate = await pool.query(`SELECT 1 FROM md_skill WHERE scope = $3 AND legacy_flag = FALSE AND master_id <> $2 AND lifecycle_status NOT IN ('Inactive','Obsolete') AND lower(COALESCE(name->>'vi', name->>'en', name->>'ja', name->>'ko')) = lower(COALESCE($1::jsonb->>'vi', $1::jsonb->>'en', $1::jsonb->>'ja', $1::jsonb->>'ko'))`, [JSON.stringify(body['name']), req.params['id'], existing.rows[0].scope]);
        if (duplicate.rows[0]) return res.status(409).json({ error: 'SKILL_DUPLICATE' });
      }
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [context.userId]);
        const sets = columns.map((column, index) => `${column} = $${index + 1}${['name', 'description'].includes(column) ? '::jsonb' : ''}`);
        const values = columns.map((column) => ['name', 'description'].includes(column) ? JSON.stringify(body[column]) : body[column]);
        const { rows } = await client.query(`UPDATE md_skill SET ${sets.join(', ')}, updated_by = $${columns.length + 1}, updated_at = NOW() WHERE master_id = $${columns.length + 2} AND legacy_flag = FALSE RETURNING *`, [...values, context.userId, req.params['id']]);
        if (!rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'SKILL_NOT_FOUND' }); }
        await client.query('COMMIT');
        return res.json({ data: rows[0] });
      } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
    } catch (err) { return next(err); }
  });

  router.post('/uoms', async (req, res, next) => {
    const context = getContext(req);
    const body = normalizeBody(req.body);
    const code = String(body['code'] || '').trim().toUpperCase();
    const name = String(body['name'] || '').trim();
    if (!code || !name) return res.status(400).json({ error: 'code and name are required' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [context.userId]);
      const { rows } = await client.query(`INSERT INTO md_uom (code, name, version_no, lifecycle_status, effective_from, created_by, uom_class, decimal_precision) VALUES ($1, $2, 1, 'Released', NOW(), $3, $4, $5) RETURNING *`, [code, name, context.userId, body['uom_class'] || 'Quantity', body['decimal_precision'] || 3]);
      await client.query('COMMIT');
      return res.status(201).json(rows[0]);
    } catch (err: any) {
      await client.query('ROLLBACK');
      if (err?.code === '23505') {
        const existing = await pool.query(`SELECT * FROM md_uom WHERE UPPER(code) = UPPER($1) AND lifecycle_status <> 'Obsolete' ORDER BY version_no DESC LIMIT 1`, [code]);
        if (existing.rows[0]) return res.status(200).json(existing.rows[0]);
      }
      return next(err);
    } finally { client.release(); }
  });

  router.post('/:resource', async (req, res, next) => {
    const table = requireTable(req.params['resource'] ?? '');
    const context = getContext(req);
    const body = normalizeLocalizedFields(table, normalizeBody(req.body));
    validateEngineeringMetadata(table, body, true);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [context.userId]);
      if (table.tableName === 'md_site') body['code'] = await consumeBusinessCode(client, body['code_reservation_id'], 'Factory', context);
      if (table.tableName === 'md_shopfloor') body['code'] = await consumeBusinessCode(client, body['code_reservation_id'], 'Shopfloor', context);
      if (table.tableName === 'md_work_center') {
        body['code'] = await consumeBusinessCode(client, body['code_reservation_id'], 'WorkCenter', context);
        if (!body['shopfloor_id']) throw Object.assign(new Error('SHOPFLOOR_REQUIRED'), { statusCode: 422 });
        const parent = await client.query(`SELECT master_id, site_id FROM md_shopfloor WHERE master_id = $1 AND lifecycle_status NOT IN ('Inactive','Obsolete')`, [body['shopfloor_id']]);
        if (!parent.rows[0]) throw Object.assign(new Error('SHOPFLOOR_NOT_FOUND'), { statusCode: 422 });
        body['site_id'] = parent.rows[0].site_id;
        body['area_id'] = parent.rows[0].master_id;
      }
      if (table.tableName === 'md_workstation') {
        body['code'] = await consumeBusinessCode(client, body['code_reservation_id'], 'Workstation', context);
        if (!body['work_center_id'] || (!body['machine_id'] && !Array.isArray(body['machine_groups']))) throw Object.assign(new Error('WORK_CENTER_AND_MACHINE_GROUPS_REQUIRED'), { statusCode: 422 });
        const parent = await client.query(`SELECT site_id, shopfloor_id, area_id FROM md_work_center WHERE master_id = $1 AND active_flag = TRUE`, [body['work_center_id']]);
        if (!parent.rows[0]) throw Object.assign(new Error('WORK_CENTER_NOT_FOUND'), { statusCode: 422 });
        body['site_id'] = parent.rows[0].site_id;
        body['shopfloor_id'] = parent.rows[0].shopfloor_id;
        body['area_id'] = parent.rows[0].area_id;
      }
      if (table.tableName === 'md_equipment') {
        body['code'] = await consumeBusinessCode(client, body['code_reservation_id'], 'Machine', context);
        if (!body['site_id']) throw Object.assign(new Error('MACHINE_SITE_REQUIRED'), { statusCode: 422 });
        const site = await client.query(`SELECT master_id FROM md_site WHERE master_id = $1 AND lifecycle_status NOT IN ('Inactive','Obsolete')`, [body['site_id']]);
        if (!site.rows[0]) throw Object.assign(new Error('MACHINE_SITE_INVALID'), { statusCode: 422 });
        if (body['work_center_id']) {
          const workCenter = await client.query(`SELECT site_id FROM md_work_center WHERE master_id = $1 AND lifecycle_status NOT IN ('Inactive','Obsolete')`, [body['work_center_id']]);
          if (!workCenter.rows[0] || workCenter.rows[0].site_id !== body['site_id']) throw Object.assign(new Error('MACHINE_WORK_CENTER_SITE_MISMATCH'), { statusCode: 422 });
        }
        const quantity = Number(body['quantity'] ?? 1);
        if (!Number.isInteger(quantity) || quantity < 1) throw Object.assign(new Error('MACHINE_QUANTITY_BELOW_ONE'), { statusCode: 422 });
        body['quantity'] = quantity;
      }
      if (table.tableName === 'md_skill_group') body['code'] = await consumeBusinessCode(client, body['code_reservation_id'], 'SkillGroup', context);
      if (table.tableName === 'md_operation') {
        body['code'] = await consumeBusinessCode(client, body['code_reservation_id'], 'Operation', context);
        if (!localizedTextSchema.safeParse(body['name']).success) throw Object.assign(new Error('OPERATION_NAME_REQUIRED'), { statusCode: 422 });
        if (!['Production', 'Inspection', 'Packing', 'Handling'].includes(String(body['operation_type']))) throw Object.assign(new Error('OPERATION_TYPE_INVALID'), { statusCode: 422 });
        if (!['StartFinish', 'QuantityOnly', 'Auto'].includes(String(body['confirmation_mode']))) throw Object.assign(new Error('OPERATION_CONFIRMATION_MODE_INVALID'), { statusCode: 422 });
        if (!['GoodOnly', 'GoodScrap'].includes(String(body['quantity_reporting'] || 'GoodOnly'))) throw Object.assign(new Error('OPERATION_QUANTITY_REPORTING_INVALID'), { statusCode: 422 });
        body['quantity_reporting'] = body['quantity_reporting'] || 'GoodOnly';
        delete body['active_flag'];
      }
      if (table.tableName === 'md_skill') {
        const scope = String(body['scope'] || body['scope_type'] || '');
        if (!['Machine', 'Workstation', 'WorkCenter'].includes(scope)) throw Object.assign(new Error('SKILL_SCOPE_REQUIRED'), { statusCode: 422 });
        body['code'] = body['code'] || (scope === 'Employee' ? await allocateResourceCode(client, 'SK-EMP') : await consumeBusinessCode(client, body['code_reservation_id'], `Skill:${scope}`, context));
        body['scope'] = scope;
        body['skill_group'] = body['skill_group'] || scope;
        body['skill_group_id'] = null;
      }
      if (table.tableName === 'md_routing_header') body['code'] = await allocateRoutingCode(client);
      if (table.tableName === 'md_resource_capability' && Number(body['cycle_time_sec']) <= 0) throw Object.assign(new Error('cycle_time_sec must be greater than zero'), { statusCode: 422 });
      if (table.tableName === 'md_resource_capability') {
        body['cycle_time_sec'] = body['cycle_time_sec'] ?? 60;
        if (!body['site_id'] || !body['work_center_id'] || !body['operation_id'] || (!body['product_revision_id'] && !body['item_group'])) throw Object.assign(new Error('CAPABILITY_SCOPE_REQUIRED'), { statusCode: 422 });
        if (Number(body['priority_no'] || 1) <= 0 || Number(body['speed_factor'] || 1) <= 0) throw Object.assign(new Error('CAPABILITY_NUMERIC_RULE_INVALID'), { statusCode: 422 });
        if (body['min_lot_size'] !== undefined && Number(body['min_lot_size']) <= 0) throw Object.assign(new Error('CAPABILITY_MIN_LOT_INVALID'), { statusCode: 422 });
        if (body['max_lot_size'] !== undefined && body['min_lot_size'] !== undefined && Number(body['max_lot_size']) < Number(body['min_lot_size'])) throw Object.assign(new Error('CAPABILITY_LOT_RANGE_INVALID'), { statusCode: 422 });
      }
      if (table.tableName === 'md_resource_calendar') {
        const calendarDate = String(body['calendar_date'] || '');
        if (!body['site_id'] || !body['resource_type'] || !body['resource_id'] || !body['shift_id'] || !/^\d{4}-\d{2}-\d{2}$/.test(calendarDate)) throw Object.assign(new Error('CALENDAR_REQUIRED_FIELDS'), { statusCode: 422 });
        if (Number(body['available_minutes'] || 0) < 0 || Number(body['capacity_factor'] ?? 1) < 0) throw Object.assign(new Error('CALENDAR_NUMERIC_RULE_INVALID'), { statusCode: 422 });
        body['effective_from'] = body['effective_from'] ?? `${calendarDate}T00:00:00.000Z`;
        body['available_from'] = body['available_from'] ?? body['effective_from'];
        body['available_to'] = body['available_to'] ?? `${calendarDate}T23:59:59.999Z`;
        body['work_center_id'] = body['resource_type'] === 'WorkCenter' ? body['resource_id'] : null;
        body['workstation_id'] = body['resource_type'] === 'Workstation' ? body['resource_id'] : null;
        body['equipment_id'] = body['resource_type'] === 'Equipment' ? body['resource_id'] : null;
      }
      if (table.tableName === 'md_production_standard') {
        if (!body['site_id'] || !body['item_revision_id'] || !body['routing_operation_id'] || !body['work_center_id']) throw Object.assign(new Error('PRODUCTION_STANDARD_REQUIRED_FIELDS'), { statusCode: 422 });
        if (Number(body['base_quantity'] || 1) <= 0 || Number(body['setup_time_min'] || 0) < 0 || Number(body['cycle_time_sec']) <= 0 || Number(body['labor_count'] || 1) <= 0 || Number(body['standard_yield'] || 1) <= 0 || Number(body['efficiency_factor'] || 1) <= 0) throw Object.assign(new Error('PRODUCTION_STANDARD_NUMERIC_RULE_INVALID'), { statusCode: 422 });
        const operation = await client.query(`SELECT ro.operation_id, ro.work_center_id, wc.site_id FROM md_routing_operation ro JOIN md_work_center wc ON wc.master_id = ro.work_center_id WHERE ro.master_id = $1`, [body['routing_operation_id']]);
        if (!operation.rows[0] || operation.rows[0].work_center_id !== body['work_center_id'] || operation.rows[0].site_id !== body['site_id']) throw Object.assign(new Error('PRODUCTION_STANDARD_ROUTING_CONTEXT_INVALID'), { statusCode: 422 });
        body['operation_id'] = body['operation_id'] || operation.rows[0].operation_id;
        if (body['equipment_id']) {
          const equipmentEligibility = await client.query(`
            SELECT 1 FROM md_resource_assignment ra JOIN md_equipment eq ON eq.master_id = ra.equipment_id
            WHERE ra.work_center_id = $1 AND ra.equipment_id = $2 AND ra.scheduling_flag = TRUE AND eq.planning_resource_flag = TRUE
              AND eq.active_flag = TRUE AND eq.execution_status = 'Available'
              AND tstzrange(ra.effective_from, COALESCE(ra.effective_to, 'infinity'::timestamptz), '[)') && tstzrange($3::timestamptz, COALESCE($4::timestamptz, 'infinity'::timestamptz), '[)')`, [body['work_center_id'], body['equipment_id'], body['valid_from'] || body['effective_from'] || new Date().toISOString(), body['valid_to'] || null]);
          if (!equipmentEligibility.rows[0]) throw Object.assign(new Error('PRODUCTION_STANDARD_EQUIPMENT_ASSIGNMENT_INVALID'), { statusCode: 422 });
          const capability = await client.query(`SELECT 1 FROM md_resource_capability WHERE site_id = $1 AND operation_id = $2 AND work_center_id = $3 AND (equipment_id = $4 OR equipment_id IS NULL) AND product_revision_id = $5 AND eligibility = TRUE AND active_flag = TRUE`, [body['site_id'], body['operation_id'], body['work_center_id'], body['equipment_id'], body['item_revision_id']]);
          if (!capability.rows[0]) throw Object.assign(new Error('PRODUCTION_STANDARD_EQUIPMENT_CAPABILITY_REQUIRED'), { statusCode: 422 });
        }
        body['valid_from'] = body['valid_from'] || body['effective_from'] || new Date().toISOString();
      }
      if (table.tableName === 'md_operation_skill_requirement') {
        const operation = await client.query(`SELECT ro.operation_id, wc.site_id FROM md_routing_operation ro JOIN md_work_center wc ON wc.master_id = ro.work_center_id WHERE ro.master_id = $1`, [body['routing_operation_id']]);
        if (!operation.rows[0] || !body['skill_id']) throw Object.assign(new Error('OPERATION_SKILL_ROUTING_REQUIRED'), { statusCode: 422 });
        const skill = await client.query(`SELECT 1 FROM md_skill WHERE master_id = $1 AND lifecycle_status NOT IN ('Inactive','Obsolete')`, [body['skill_id']]);
        if (!skill.rows[0]) throw Object.assign(new Error('OPERATION_SKILL_INACTIVE'), { statusCode: 422 });
        body['operation_id'] = operation.rows[0].operation_id;
        body['site_id'] = body['site_id'] || operation.rows[0].site_id;
        if (Number(body['required_persons'] || 1) <= 0) throw Object.assign(new Error('OPERATION_SKILL_REQUIRED_PERSONS_INVALID'), { statusCode: 422 });
      }
      if (table.tableName === 'md_routing_header') {
        delete body['item_revision_id'];
        delete body['site_id'];
      }
      if (table.tableName === 'md_routing_operation') {
        const operation = await client.query(`SELECT lifecycle_status FROM md_operation WHERE master_id = $1`, [body['operation_id']]);
        if (!operation.rows[0] || ['Inactive', 'Obsolete'].includes(String(operation.rows[0].lifecycle_status))) throw Object.assign(new Error('ROUTING_OPERATION_INACTIVE'), { statusCode: 422 });
        const exposed = await client.query(`
          SELECT 1 FROM md_work_center wc
          JOIN md_work_center_composition c ON c.work_center_id = wc.master_id
            AND c.active_flag = TRUE AND (c.effective_to IS NULL OR c.effective_to > NOW())
          JOIN md_workstation ws ON ws.master_id = c.workstation_id
            AND ws.work_center_id = wc.master_id AND ws.active_flag = TRUE
            AND ws.lifecycle_status NOT IN ('Inactive', 'Obsolete')
          JOIN md_workstation_operation_capability capability ON capability.workstation_id = ws.master_id
            AND capability.operation_id = $2 AND capability.active_flag = TRUE
            AND (capability.effective_to IS NULL OR capability.effective_to > NOW())
          WHERE wc.master_id = $1 AND wc.active_flag = TRUE AND wc.lifecycle_status NOT IN ('Inactive', 'Obsolete')
          LIMIT 1`, [body['work_center_id'], body['operation_id']]);
        if (!exposed.rows[0]) throw Object.assign(new Error('WORKCENTER_OPERATION_NOT_SUPPORTED'), { statusCode: 422 });
      }
      const record: Record<string, unknown> = {
        ...body,
        effective_from: body['effective_from'] ?? new Date(),
        created_by: context.userId,
      };
      const machineId = table.tableName === 'md_workstation' ? String(record['machine_id'] || '') : '';
      const machineGroups = table.tableName === 'md_workstation' ? record['machine_groups'] : undefined;
      delete record['code_reservation_id'];
      delete record['machine_id'];
      delete record['machine_groups'];
      const columns = Object.keys(record);
      const placeholders = columns.map((_, index) => `$${index + 1}`);
      const { rows } = await client.query(
        `INSERT INTO ${table.tableName} (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
        columns.map((column) => record[column]),
      );
      if (table.tableName === 'md_equipment') {
        const quantity = Number(rows[0]['quantity'] || 1);
        for (let unitSequence = 1; unitSequence <= quantity; unitSequence += 1) {
          await client.query(`INSERT INTO md_machine_unit (machine_id, code, unit_sequence, execution_status, active_flag) VALUES ($1,$2,$3,$4,$5)`, [rows[0]['master_id'], `${rows[0]['code']}-${String(unitSequence).padStart(2, '0')}`, unitSequence, rows[0]['execution_status'] || 'Available', rows[0]['active_flag'] !== false]);
        }
      }
      if (table.tableName === 'md_workstation' && Array.isArray(machineGroups)) {
        await persistMachineGroups(client, String(rows[0]['master_id']), machineGroups, context);
      } else if (table.tableName === 'md_workstation' && machineId) {
        const machine = await client.query(`SELECT site_id, active_flag, execution_status FROM md_equipment WHERE master_id = $1 FOR UPDATE`, [machineId]);
        if (!machine.rows[0] || machine.rows[0].site_id !== record['site_id'] || machine.rows[0].active_flag !== true || machine.rows[0].execution_status === 'OutOfService') throw Object.assign(new Error('MACHINE_ASSIGNMENT_INVALID'), { statusCode: 422 });
        await persistMachineGroups(client, String(rows[0]['master_id']), [{ name: { vi: 'Nhóm máy mặc định', en: 'Default machine group', ja: '既定のマシングループ', ko: '기본 머신 그룹' }, primary_machine_id: machineId, minimum_required_machines: 1, effective_from: record['effective_from'] }], context);
      }
      const creationEvent = creationEventType(table.tableName);
      if (creationEvent) {
        await writeToOutbox(client, {
          topic: creationEvent,
          envelope: createEventEnvelope({
            event_type: creationEvent,
            source_service: SERVICE_NAME,
            trace_id: context.traceId,
            payload: eventPayloadFor(table, rows[0] as Record<string, unknown>),
          }),
        });
      }
      await client.query('COMMIT');
      return res.status(201).json(rows[0]);
    } catch (err: any) {
      await client.query('ROLLBACK');
      if (err?.code === '23P01') return res.status(409).json({ error: 'MACHINE_UNIT_ALREADY_ASSIGNED', message: 'A physical machine unit is already assigned to another active Primary requirement.' });
      return next(err);
    } finally {
      client.release();
    }
  });

  router.put('/:resource/:id', async (req, res, next) => {
    const table = requireTable(req.params['resource'] ?? '');
    const context = getContext(req);
    const body = normalizeLocalizedFields(table, normalizeBody(req.body));
    if (table.protectedAfterRelease) {
      const released = await pool.query(`SELECT lifecycle_status FROM ${table.tableName} WHERE master_id = $1`, [req.params['id']]);
      if (released.rows[0]?.lifecycle_status === 'Released') return res.status(409).json({ error: table.tableName.startsWith('md_ebom') ? 'EBOM_RELEASED_IMMUTABLE' : 'RELEASED_RECORD_IMMUTABLE' });
    }
    if (table.tableName === 'md_item' && Object.keys(body).some((column) => ['name', 'item_group', 'base_uom_id'].includes(column))) {
      const { rows } = await pool.query(`SELECT 1 FROM md_item_revision WHERE item_id = $1 AND lifecycle_status = 'Released' LIMIT 1`, [req.params['id']]);
      if (rows[0]) return res.status(409).json({ error: 'Released Item specification is immutable; create a new Item Revision' });
    }
    delete body['master_id'];
    delete body['created_by'];
    delete body['created_at'];
    delete body['updated_by'];
    delete body['updated_at'];
    delete body['row_version'];
    if (table.tableName === 'md_equipment') {
      for (const projectionField of ['site_code', 'site_name', 'work_center_code', 'work_center_name', 'assignments', 'units', 'available_unit_count', 'skill_ids', 'code_reservation_id']) delete body[projectionField];
      if (body['site_id'] === null || body['site_id'] === '') delete body['site_id'];
    }
    if (table.tableName === 'md_workstation') {
      for (const projectionField of ['site_code', 'site_name', 'area_code', 'area_name', 'work_center_code', 'work_center_name', 'assignments', 'machine_groups', 'operation_capabilities', 'skill_ids', 'code_reservation_id', 'machine_id']) delete body[projectionField];
    }
    if (table.tableName === 'md_routing_header') {
      delete body['item_revision_id'];
      delete body['site_id'];
    }
    if (table.tableName === 'md_operation') {
      delete body['code']; delete body['version_no'];
      // md_operation uses the shared lifecycle_status column; active_flag is a legacy client field.
      delete body['active_flag'];
      if (body['operation_type'] !== undefined && !['Production', 'Inspection', 'Packing', 'Handling'].includes(String(body['operation_type']))) return res.status(422).json({ error: 'OPERATION_TYPE_INVALID' });
      if (body['confirmation_mode'] !== undefined && !['StartFinish', 'QuantityOnly', 'Auto'].includes(String(body['confirmation_mode']))) return res.status(422).json({ error: 'OPERATION_CONFIRMATION_MODE_INVALID' });
      if (body['quantity_reporting'] !== undefined && !['GoodOnly', 'GoodScrap'].includes(String(body['quantity_reporting']))) return res.status(422).json({ error: 'OPERATION_QUANTITY_REPORTING_INVALID' });
    }
    validateEngineeringMetadata(table, body);
    const columns = Object.keys(body);
    if (columns.length === 0) return res.status(400).json({ error: 'No update fields provided' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [context.userId]);

      if (table.tableName === 'md_ebom_header') {
        const current = await client.query(`SELECT master_id, lifecycle_status FROM md_ebom_header WHERE master_id = $1 FOR UPDATE`, [req.params['id']]);
        if (!current.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'EBOM_NOT_FOUND' }); }
        if (current.rows[0].lifecycle_status === 'Released') { await client.query('ROLLBACK'); return res.status(409).json({ error: 'EBOM_RELEASED_IMMUTABLE' }); }
      }
      if (table.tableName === 'md_workstation' && body['work_center_id']) {
        const parent = await client.query(`SELECT site_id, shopfloor_id, area_id FROM md_work_center WHERE master_id = $1 AND active_flag = TRUE FOR SHARE`, [body['work_center_id']]);
        if (!parent.rows[0]) throw Object.assign(new Error('WORK_CENTER_NOT_FOUND'), { statusCode: 422 });
        body['site_id'] = parent.rows[0].site_id;
        body['shopfloor_id'] = parent.rows[0].shopfloor_id;
        body['area_id'] = parent.rows[0].area_id;
      }
      if (table.tableName === 'md_equipment' && body['quantity'] !== undefined) await syncMachineQuantity(client, req.params['id'], Number(body['quantity']));
      const sets = columns.map((column, index) => `${column} = $${index + 1}`);
      const params = [...columns.map((column) => body[column]), req.params['id']];
      const { rows } = await client.query(
        `UPDATE ${table.tableName} SET ${sets.join(', ')} WHERE master_id = $${columns.length + 1} RETURNING *`,
        params,
      );
      if (!rows[0]) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Not Found' });
      }
      if (table.tableName === 'md_employee') {
        const eventType = 'MES.MasterData.EmployeeCreated.v1';
        const employeePayload = eventPayloadFor(table, rows[0] as Record<string, unknown>);
        const skillRows = await client.query(`SELECT es.skill_id, es.level, s.code, s.name FROM md_employee_skill es JOIN md_skill s ON s.master_id = es.skill_id WHERE es.employee_id = $1`, [req.params['id']]);
        employeePayload['skills'] = skillRows.rows;
        await writeToOutbox(client, { topic: eventType, envelope: createEventEnvelope({ event_type: eventType, source_service: SERVICE_NAME, trace_id: context.traceId, payload: employeePayload }) });
      }
      await client.query('COMMIT');
      return res.json(rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      return next(err);
    } finally {
      client.release();
    }
  });

  router.delete('/:resource/:id', async (req, res, next) => {
    const table = requireTable(req.params['resource'] ?? '');
    const client = await pool.connect();
    try {
      const id = req.params['id'];
      const dependencyQueries: Record<string, string> = {
        md_site: `SELECT EXISTS (SELECT 1 FROM md_shopfloor WHERE site_id=$1) OR EXISTS (SELECT 1 FROM md_work_center WHERE site_id=$1) AS used`,
        md_shopfloor: `SELECT EXISTS (SELECT 1 FROM md_work_center WHERE shopfloor_id=$1) AS used`,
        md_work_center: `SELECT EXISTS (SELECT 1 FROM md_routing_operation WHERE work_center_id=$1) OR EXISTS (SELECT 1 FROM md_resource_assignment WHERE work_center_id=$1) AS used`,
        md_workstation: `SELECT EXISTS (SELECT 1 FROM md_resource_assignment WHERE workstation_id=$1) OR EXISTS (SELECT 1 FROM md_workstation_machine_group WHERE workstation_id=$1) OR EXISTS (SELECT 1 FROM md_workstation_operation_capability WHERE workstation_id=$1) OR EXISTS (SELECT 1 FROM md_work_center_composition WHERE workstation_id=$1) AS used`,
        md_equipment: `SELECT EXISTS (SELECT 1 FROM md_machine_unit WHERE machine_id=$1) OR EXISTS (SELECT 1 FROM md_resource_assignment WHERE equipment_id=$1) OR EXISTS (SELECT 1 FROM md_workstation_machine_requirement WHERE machine_id=$1) OR EXISTS (SELECT 1 FROM md_resource_capability WHERE equipment_id=$1) OR EXISTS (SELECT 1 FROM md_resource_calendar WHERE equipment_id=$1 OR (resource_type = 'Equipment' AND resource_id=$1)) OR EXISTS (SELECT 1 FROM md_production_standard WHERE equipment_id=$1) AS used`,
        md_operation: `SELECT EXISTS (SELECT 1 FROM md_workstation_operation_capability WHERE operation_id=$1) OR EXISTS (SELECT 1 FROM md_work_center_composition WHERE operation_id=$1) OR EXISTS (SELECT 1 FROM md_routing_operation WHERE operation_id=$1) OR EXISTS (SELECT 1 FROM md_operation_skill_requirement WHERE operation_id=$1) OR EXISTS (SELECT 1 FROM md_resource_capability WHERE operation_id=$1) OR EXISTS (SELECT 1 FROM md_production_standard WHERE operation_id=$1) AS used`,
      };
      const dependencyQuery = dependencyQueries[table.tableName];
      if (dependencyQuery) {
        const dependency = await client.query<{ used: boolean }>(dependencyQuery, [id]);
        if (dependency.rows[0]?.used) return res.status(409).json({ error: table.tableName === 'md_equipment' ? 'MACHINE_REFERENCED' : table.tableName === 'md_workstation' ? 'WORKSTATION_REFERENCED' : table.tableName === 'md_operation' ? 'OPERATION_REFERENCED' : 'RESOURCE_REFERENCED', message: 'Referenced resources cannot be deleted; deactivate or end the configuration instead.' });
      }
      const result = await client.query(`DELETE FROM ${table.tableName} WHERE master_id=$1 RETURNING master_id`, [id]);
      if (!result.rows[0]) return res.status(404).json({ error: 'Not Found' });
      return res.json({ deleted: true, master_id: id });
    } catch (err) { return next(err); } finally { client.release(); }
  });

  router.patch('/:resource/:id', async (req, res, next) => {
    const table = requireTable(req.params['resource'] ?? '');
    const context = getContext(req);
    const body = normalizeBody(req.body);
    const expected = body['expected_row_version'];
    delete body['expected_row_version'];
    if (typeof expected !== 'number') return res.status(400).json({ error: 'expected_row_version is required' });
    const columns = Object.keys(body);
    if (columns.length === 0) return res.status(400).json({ error: 'No update fields provided' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [context.userId]);
      const sets = columns.map((column, index) => `${column} = $${index + 1}`);
      const params = [...columns.map((column) => body[column]), req.params['id'], expected];
      const { rows } = await client.query(
        `UPDATE ${table.tableName} SET ${sets.join(', ')} WHERE master_id = $${columns.length + 1} AND row_version = $${columns.length + 2} RETURNING *`,
        params,
      );
      if (!rows[0]) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Update conflict or record not found' });
      }
      if (table.tableName === 'md_employee') {
        const eventType = 'MES.MasterData.EmployeeCreated.v1';
        const employeePayload = eventPayloadFor(table, rows[0] as Record<string, unknown>);
        const skillRows = await client.query(`SELECT es.skill_id, es.level, s.code, s.name FROM md_employee_skill es JOIN md_skill s ON s.master_id = es.skill_id WHERE es.employee_id = $1`, [req.params['id']]);
        employeePayload['skills'] = skillRows.rows;
        await writeToOutbox(client, { topic: eventType, envelope: createEventEnvelope({ event_type: eventType, source_service: SERVICE_NAME, trace_id: context.traceId, payload: employeePayload }) });
      }
      await client.query('COMMIT');
      return res.json(rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      return next(err);
    } finally {
      client.release();
    }
  });

  router.post('/:resource/:id/release', async (req: Request, res: Response, next: NextFunction) => {
    const table = requireTable(req.params['resource'] ?? '');
    const context = getContext(req);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [context.userId]);

      if (table.tableName === 'md_production_version') {
        const validation = await validateProductionVersion(client, req.params['id'] ?? '');
        if (!validation.valid) {
          await client.query('ROLLBACK');
          return res.status(422).json(validation);
        }
      }

      if (table.tableName === 'md_ebom_header') {
        const current = await client.query(`SELECT * FROM md_ebom_header WHERE master_id = $1 FOR UPDATE`, [req.params['id']]);
        if (!current.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'EBOM_NOT_FOUND' }); }
        if (current.rows[0].lifecycle_status === 'Released') { await client.query('ROLLBACK'); return res.status(409).json({ error: 'EBOM_RELEASED_IMMUTABLE' }); }
        const lines = await client.query(`SELECT master_id FROM md_ebom_line WHERE ebom_header_id = $1 AND lifecycle_status NOT IN ('Inactive','Obsolete') AND effective_to IS NULL`, [req.params['id']]);
        if (lines.rowCount === 0) {
          await client.query('ROLLBACK');
          return res.status(422).json({ error: 'EBOM_RELEASE_REQUIRES_LINES', failures: [{ code: 'EBOM_RELEASE_REQUIRES_LINES', message: 'A current EBOM design tree is required before release.' }] });
        }
        await client.query(`UPDATE md_ebom_line SET lifecycle_status = 'Released', updated_by = $1, updated_at = NOW() WHERE ebom_header_id = $2 AND lifecycle_status NOT IN ('Inactive','Obsolete') AND effective_to IS NULL`, [context.userId, req.params['id']]);
        const released = await client.query(`UPDATE md_ebom_header SET lifecycle_status = 'Released', approved_by = $1, approved_at = NOW(), updated_by = $1, updated_at = NOW() WHERE master_id = $2 RETURNING *`, [context.userId, req.params['id']]);
        await client.query('COMMIT');
        return res.json({ data: released.rows[0], event_published: false, event_type: null });
      }

      if (table.tableName === 'md_item_revision') {
        const currentResult = await client.query(`SELECT * FROM md_item_revision WHERE master_id = $1 FOR UPDATE`, [req.params['id']]);
        const current = currentResult.rows[0] as Record<string, unknown> | undefined;
        if (!current) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Record not found' }); }
        if (current['previous_revision_id'] && !String(current['change_reason'] || '').trim()) {
          await client.query('ROLLBACK');
          return res.status(422).json({ error: 'Successor revision requires change_reason' });
        }
        await client.query('ALTER TABLE md_item_revision DISABLE TRIGGER USER');
        await client.query(`UPDATE md_item_revision SET is_default = FALSE WHERE item_id = $1 AND site_id = $2 AND master_id <> $3 AND lifecycle_status = 'Released'`, [current['item_id'], current['site_id'], req.params['id']]);
        if (current['previous_revision_id']) {
          await client.query(`UPDATE md_item_revision SET effective_to = $1, is_default = FALSE WHERE master_id = $2`, [current['effective_from'], current['previous_revision_id']]);
        }
        await client.query('ALTER TABLE md_item_revision ENABLE TRIGGER USER');
      }

      const releaseSet = table.tableName === 'md_item_revision'
        ? `lifecycle_status = 'Released', approved_by = $1, approved_at = NOW(), released_by = $1, is_default = TRUE`
        : `lifecycle_status = 'Released', approved_by = $1, approved_at = NOW()`;
      const { rows } = await client.query(
        `UPDATE ${table.tableName}
         SET ${releaseSet}
         WHERE master_id = $2 AND lifecycle_status IN ('Draft','InReview','Inactive')
         RETURNING *`,
        [context.userId, req.params['id']],
      );
      const row = rows[0] as Record<string, unknown> | undefined;
      if (!row) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Record is not releasable or not found' });
      }

      if (table.eventType) {
        const envelope = createEventEnvelope({
          event_type: table.eventType,
          source_service: SERVICE_NAME,
          trace_id: context.traceId,
          payload: eventPayloadFor(table, row),
        });
        await writeToOutbox(client, { topic: table.eventType, envelope });
      }

      await client.query('COMMIT');
      return res.json({ data: row, event_published: Boolean(table.eventType), event_type: table.eventType ?? null });
    } catch (err) {
      await client.query('ROLLBACK');
      return next(err);
    } finally {
      client.release();
    }
  });

  return router;
}
