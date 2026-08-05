import { Router, type Request, type Response, type NextFunction } from 'express';
import { Pool, type PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { createEventEnvelope, localizedTextSchema, writeToOutbox } from '@mom-platform/shared-kernel';
import { TABLE_BY_RESOURCE, type TableDefinition } from '../../domain/table-registry.js';
import { validateProductionVersion } from '../../application/validation-engine/validation-engine.js';
import { formatRoutingCode } from './routing-numbering.js';
import { validateRoutingOperationGraph } from './routing-validation.js';

const SERVICE_NAME = 'mes-master-data-service';
const IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';
const WORKER_SKILL_LEVELS = new Set(['Basic', 'L1', 'L2', 'L3', 'L4', 'L5']);
const UOM_TYPES = new Set(['Count', 'Length', 'Area', 'Weight', 'Volume', 'Time']);

const EXPLICIT_OFFSET_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function parseRevisionEffectiveFrom(value: unknown): Date {
  const raw = String(value ?? '').trim();
  if (!EXPLICIT_OFFSET_DATETIME.test(raw)) throw routingError('ITEM_REVISION_EFFECTIVE_FROM_INVALID', 'effective_from must be an ISO 8601 datetime with seconds and an explicit timezone offset.');
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) throw routingError('ITEM_REVISION_EFFECTIVE_FROM_INVALID', 'effective_from is not a valid datetime.');
  return parsed;
}

async function getUomUsage(pool: Pool, uomId: string): Promise<{ total: number; byTable: Record<string, number> }> {
  const { rows } = await pool.query<{ source: string; count: string }>(`
    SELECT source, SUM(count)::BIGINT AS count FROM (
      SELECT 'Items' AS source, COUNT(*)::BIGINT AS count FROM md_item WHERE base_uom_id = $1
      UNION ALL SELECT 'Item Revisions', COUNT(*) FROM md_item_revision WHERE base_uom_id = $1
      UNION ALL SELECT 'MBOM Headers', COUNT(*) FROM md_mbom_header WHERE base_uom_id = $1
      UNION ALL SELECT 'MBOM Lines', COUNT(*) FROM md_mbom_line WHERE uom_id = $1
      UNION ALL SELECT 'EBOM Lines', COUNT(*) FROM md_ebom_line WHERE uom_id = $1
      UNION ALL SELECT 'Conversions', COUNT(*) FROM md_uom_conversion WHERE from_uom_id = $1 OR to_uom_id = $1
    ) usage GROUP BY source ORDER BY source`, [uomId]);
  const byTable: Record<string, number> = {};
  for (const row of rows) byTable[row.source] = Number(row.count);
  return { total: Object.values(byTable).reduce((sum, value) => sum + value, 0), byTable };
}

async function evaluateWorkerReadiness(pool: Pool, input: { operationId: string; routingOperationId: string; siteId: string; workCenterId: string; shiftId: string; plannedDate: string }): Promise<{ readiness: Array<Record<string, any>>; blockingErrors: Array<Record<string, any>> }> {
  const requirementsResult = await pool.query(`
    SELECT r.skill_id, r.minimum_level, r.required_persons, r.mandatory_flag,
           r.routing_operation_id, s.code AS skill_code
    FROM md_operation_skill_requirement r
    JOIN md_skill s ON s.master_id = r.skill_id
    WHERE r.operation_id = $1 AND r.active_flag = TRUE AND r.lifecycle_status = 'Released'
      AND r.effective_from < ($2::date + INTERVAL '1 day')
      AND (r.effective_to IS NULL OR r.effective_to > $2::date)
      AND (r.site_id IS NULL OR r.site_id = $3)
      AND (r.routing_operation_id = $4 OR r.routing_operation_id IS NULL)
    ORDER BY CASE WHEN r.routing_operation_id = $4 THEN 0 ELSE 1 END, r.skill_id`,
  [input.operationId, input.plannedDate, input.siteId, input.routingOperationId]);
  const requirements = new Map<string, Record<string, any>>();
  for (const row of requirementsResult.rows as Array<Record<string, any>>) if (!requirements.has(String(row.skill_id))) requirements.set(String(row.skill_id), row);
  const readiness: Array<Record<string, any>> = [];
  const blockingErrors: Array<Record<string, any>> = [];
  for (const requirement of requirements.values()) {
    const workersResult = await pool.query(`
      SELECT DISTINCT e.master_id, e.code, e.name, es.level,
             COALESCE(schedule.schedule_status, 'Unavailable') AS schedule_status
      FROM md_employee e
      JOIN md_employee_skill es ON es.employee_id = e.master_id AND es.skill_id = $1
        AND es.active_flag = TRUE AND es.qualification_status = 'Active'
        AND es.effective_from < ($2::date + INTERVAL '1 day')
        AND (es.effective_to IS NULL OR es.effective_to > $2::date)
        AND (es.expires_at IS NULL OR es.expires_at::date >= $2::date)
      LEFT JOIN md_employee_shift_schedule schedule ON schedule.employee_id = e.master_id
        AND schedule.shift_id = $3 AND schedule.schedule_date = $2::date
        AND (schedule.work_center_id IS NULL OR schedule.work_center_id = $4)
      WHERE e.site_id = $5 AND e.employee_status = 'Active' AND e.lifecycle_status = 'Released'`,
    [requirement.skill_id, input.plannedDate, input.shiftId, input.workCenterId, input.siteId]);
    const minimumLevel = Number(String(requirement.minimum_level || 'L1').replace(/[^0-9]/g, '')) || 1;
    const qualified = workersResult.rows.filter((worker: Record<string, any>) => (Number(String(worker.level || '').replace(/[^0-9]/g, '')) || 0) >= minimumLevel && worker.schedule_status === 'Scheduled');
    const requiredPersons = Math.max(1, Number(requirement.required_persons) || 1);
    readiness.push({ skill_id: requirement.skill_id, skill_code: requirement.skill_code, minimum_level: requirement.minimum_level, required_persons: requiredPersons, qualified_available_persons: qualified.length, readiness: qualified.length >= requiredPersons ? 'Available' : 'Insufficient', workers: qualified.map((worker: Record<string, any>) => ({ id: worker.master_id, code: worker.code, name: worker.name, level: worker.level })) });
    if (qualified.length < requiredPersons && requirement.mandatory_flag !== false) blockingErrors.push({ code: 'WORKER_CAPACITY_INSUFFICIENT', skill_code: requirement.skill_code, required_persons: requiredPersons, qualified_available_persons: qualified.length });
  }
  return { readiness, blockingErrors };
}

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

type RoutingOperationInput = {
  operation_id: string;
  work_center_id: string;
  workstation_id: string | null;
  seq: number;
  predecessor_seq: number | null;
  scheduling_mode: string;
  queue_time_min: number;
  move_time_min: number;
  overlap_allowed: boolean;
  transfer_batch_qty: number | null;
  milestone_flag: boolean;
  planning_mode: 'INHERITED' | 'ROUTING_OVERRIDE';
  base_quantity: number;
  setup_time_min: number;
  cycle_time_sec: number;
  required_workers: number;
  efficiency_factor: number;
  standard_yield: number;
  units_per_label: number | null;
  label_quantity_method: string;
  copies_per_label: number;
};

function routingError(code: string, message: string, statusCode = 422): Error & { statusCode: number; code: string } {
  return Object.assign(new Error(message), { statusCode, code });
}

async function validateRoutingOperationReplacement(client: PoolClient, routingId: string, value: unknown): Promise<RoutingOperationInput[]> {
  if (!Array.isArray(value)) throw routingError('ROUTING_OPERATIONS_REQUIRED', 'The submitted operation list is required.');
  const rows = value as Record<string, unknown>[];
  const normalized: RoutingOperationInput[] = rows.map((row) => ({
    operation_id: String(row['operation_id'] || ''),
    work_center_id: String(row['work_center_id'] || ''),
    workstation_id: row['workstation_id'] ? String(row['workstation_id']) : null,
    seq: Number(row['seq']),
    predecessor_seq: row['predecessor_seq'] === null || row['predecessor_seq'] === '' || row['predecessor_seq'] === undefined ? null : Number(row['predecessor_seq']),
    scheduling_mode: String(row['scheduling_mode'] || 'Finite'),
    queue_time_min: Number(row['queue_time_min'] ?? 0),
    move_time_min: Number(row['move_time_min'] ?? 0),
    overlap_allowed: row['overlap_allowed'] === true,
    transfer_batch_qty: row['transfer_batch_qty'] === null || row['transfer_batch_qty'] === undefined || row['transfer_batch_qty'] === '' ? null : Number(row['transfer_batch_qty']),
    milestone_flag: row['milestone_flag'] === true,
    planning_mode: String(row['planning_mode'] || 'INHERITED').toUpperCase() as 'INHERITED' | 'ROUTING_OVERRIDE',
    base_quantity: row['base_quantity'] === undefined || row['base_quantity'] === null || row['base_quantity'] === '' ? Number.NaN : Number(row['base_quantity']),
    setup_time_min: row['setup_time_min'] === undefined || row['setup_time_min'] === null || row['setup_time_min'] === '' ? Number.NaN : Number(row['setup_time_min']),
    cycle_time_sec: row['cycle_time_sec'] === undefined || row['cycle_time_sec'] === null || row['cycle_time_sec'] === '' ? Number.NaN : Number(row['cycle_time_sec']),
    required_workers: row['required_workers'] === undefined || row['required_workers'] === null || row['required_workers'] === '' ? Number.NaN : Number(row['required_workers']),
    efficiency_factor: row['efficiency_factor'] === undefined || row['efficiency_factor'] === null || row['efficiency_factor'] === '' ? Number.NaN : Number(row['efficiency_factor']),
    standard_yield: row['standard_yield'] === undefined || row['standard_yield'] === null || row['standard_yield'] === '' ? Number.NaN : Number(row['standard_yield']),
    units_per_label: row['units_per_label'] === undefined || row['units_per_label'] === null || row['units_per_label'] === '' ? null : Number(row['units_per_label']),
    label_quantity_method: String(row['label_quantity_method'] || 'CEIL_BY_UNITS_PER_LABEL'),
    copies_per_label: Number(row['copies_per_label'] ?? 1),
  }));
  const sequences = new Set<number>();
  const operationIds = new Set<string>();
  for (const row of normalized) {
    if (!row.operation_id || !row.work_center_id || !Number.isInteger(row.seq) || row.seq < 1) throw routingError('ROUTING_OPERATION_FIELDS_INVALID', 'Each Routing Operation requires an Operation, Work Center, and positive integer sequence.');
    if (sequences.has(row.seq)) throw routingError('ROUTING_SEQUENCE_DUPLICATE', 'Routing operation sequence numbers must be unique.');
    if (operationIds.has(row.operation_id)) throw routingError('ROUTING_OPERATION_DUPLICATE', 'An Operation may appear only once in a Routing.');
    if (row.predecessor_seq !== null && (!Number.isInteger(row.predecessor_seq) || row.predecessor_seq === row.seq)) throw routingError('ROUTING_PREDECESSOR_INVALID', 'A predecessor must reference another operation sequence.');
    if (!Number.isFinite(row.queue_time_min) || row.queue_time_min < 0 || !Number.isFinite(row.move_time_min) || row.move_time_min < 0 || (row.transfer_batch_qty !== null && (!Number.isFinite(row.transfer_batch_qty) || row.transfer_batch_qty <= 0))) throw routingError('ROUTING_TIMING_INVALID', 'Queue, move, and transfer-batch values are invalid.');
    if (!['INHERITED', 'ROUTING_OVERRIDE'].includes(row.planning_mode)) throw routingError('ROUTING_PLANNING_MODE_INVALID', 'Planning mode must be INHERITED or ROUTING_OVERRIDE.');
    if (row.units_per_label !== null && (!Number.isFinite(row.units_per_label) || row.units_per_label <= 0)) throw routingError('LABEL_POLICY_INVALID', 'Units per label must be greater than zero.');
    if (!['CEIL_BY_UNITS_PER_LABEL', 'ONE_PER_UNIT'].includes(row.label_quantity_method) || !Number.isInteger(row.copies_per_label) || row.copies_per_label < 1) throw routingError('LABEL_POLICY_INVALID', 'Label quantity method and copies per label are invalid.');
    sequences.add(row.seq); operationIds.add(row.operation_id);
  }
  validateRoutingOperationGraph(normalized);
  for (const row of normalized) if (row.predecessor_seq !== null && !sequences.has(row.predecessor_seq)) throw routingError('ROUTING_PREDECESSOR_INVALID', `Predecessor sequence ${row.predecessor_seq} does not exist.`);

  const routing = await client.query(`SELECT master_id, lifecycle_status FROM md_routing_header WHERE master_id = $1 FOR UPDATE`, [routingId]);
  if (!routing.rows[0]) throw Object.assign(new Error('ROUTING_NOT_FOUND'), { statusCode: 404 });
  if (routing.rows[0].lifecycle_status === 'Released') throw routingError('ROUTING_RELEASED_IMMUTABLE', 'Released Routings cannot be edited. Create a new Routing version.', 409);
  if (!normalized.length) return normalized;
  const operations = await client.query(`SELECT master_id, default_cycle_time_sec, default_setup_time_min, default_base_quantity, default_required_persons, default_efficiency_factor, default_yield FROM md_operation WHERE master_id = ANY($1::uuid[]) AND lifecycle_status NOT IN ('Inactive','Obsolete')`, [[...operationIds]]);
  if (operations.rowCount !== operationIds.size) throw routingError('ROUTING_OPERATION_INACTIVE', 'All selected Operations must be active.');
  const defaults = new Map(operations.rows.map((operation) => [String(operation.master_id), operation]));
  for (const row of normalized) {
    const operation = defaults.get(row.operation_id);
    if (!operation) continue;
    if (row.planning_mode === 'ROUTING_OVERRIDE' && (!Number.isFinite(row.cycle_time_sec) || row.cycle_time_sec <= 0 || !Number.isFinite(row.setup_time_min) || row.setup_time_min < 0 || !Number.isFinite(row.base_quantity) || row.base_quantity <= 0 || !Number.isInteger(row.required_workers) || row.required_workers < 1 || !Number.isFinite(row.efficiency_factor) || row.efficiency_factor <= 0 || !Number.isFinite(row.standard_yield) || row.standard_yield <= 0)) {
      throw routingError('ROUTING_PLANNING_VALUES_INVALID', 'Routing planning values must be positive and valid.');
    }
  }
  const workCenters = await client.query(`SELECT master_id, site_id FROM md_work_center WHERE master_id = ANY($1::uuid[]) AND active_flag = TRUE AND lifecycle_status NOT IN ('Inactive','Obsolete')`, [[...new Set(normalized.map((row) => row.work_center_id))]]);
  if (workCenters.rowCount !== new Set(normalized.map((row) => row.work_center_id)).size) throw routingError('ROUTING_WORK_CENTER_INVALID', 'All selected Work Centers must be active.');
  const sites = new Set(workCenters.rows.map((row) => String(row.site_id)));
  if (sites.size > 1) throw routingError('ROUTING_WORK_CENTER_SITE_MISMATCH', 'All Routing Work Centers must belong to the same Site.');
  const predecessorBySeq = new Map(normalized.map((row) => [row.seq, row.predecessor_seq]));
  for (const start of normalized) {
    const visited = new Set<number>(); let current = start.seq;
    while (predecessorBySeq.get(current) !== null && predecessorBySeq.get(current) !== undefined) {
      if (visited.has(current)) throw routingError('ROUTING_PREDECESSOR_CYCLE', 'Routing predecessor dependencies cannot contain a cycle.');
      visited.add(current); current = predecessorBySeq.get(current) as number;
    }
  }
  return normalized;
}

async function resolveProductionVersionSite(client: PoolClient, itemRevisionId: string, mbomHeaderId: string, routingHeaderId: string): Promise<string> {
  const itemRevision = await client.query(`
    SELECT r.master_id FROM md_item_revision r
    JOIN md_item i ON i.master_id = r.item_id
    WHERE r.master_id = $1 AND r.lifecycle_status = 'Released' AND i.lifecycle_status = 'Released' AND i.item_type IN ('FG', 'SFG')
      AND r.effective_from <= NOW() AND (r.effective_to IS NULL OR r.effective_to > NOW())
  `, [itemRevisionId]);
  if (!itemRevision.rows[0]) throw Object.assign(new Error('PRODUCTION_VERSION_ITEM_REVISION_INVALID'), { statusCode: 422 });

  const mbom = await client.query(`
    SELECT master_id, site_id, item_revision_id FROM md_mbom_header
    WHERE master_id = $1 AND lifecycle_status = 'Released'
      AND effective_from <= NOW() AND (effective_to IS NULL OR effective_to > NOW())
  `, [mbomHeaderId]);
  if (!mbom.rows[0]) throw Object.assign(new Error('PRODUCTION_VERSION_MBOM_INVALID'), { statusCode: 422 });
  if (String(mbom.rows[0].item_revision_id || '') !== itemRevisionId) throw Object.assign(new Error('PRODUCTION_VERSION_MBOM_REVISION_MISMATCH'), { statusCode: 422 });

  const routing = await client.query(`
    SELECT rh.master_id, rh.item_revision_id, wc.site_id
    FROM md_routing_header rh
    JOIN md_routing_operation ro ON ro.routing_header_id = rh.master_id
    JOIN md_work_center wc ON wc.master_id = ro.work_center_id
    WHERE rh.master_id = $1 AND rh.lifecycle_status = 'Released'
      AND rh.effective_from <= NOW() AND (rh.effective_to IS NULL OR rh.effective_to > NOW())
    GROUP BY rh.master_id, wc.site_id
  `, [routingHeaderId]);
  const routingSites = new Set(routing.rows.map((row) => String(row.site_id)));
  if (routingSites.size === 0) throw Object.assign(new Error('PRODUCTION_VERSION_ROUTING_INVALID'), { statusCode: 422 });
  if (String(routing.rows[0]?.item_revision_id || '') !== itemRevisionId) throw Object.assign(new Error('PRODUCTION_VERSION_ROUTING_REVISION_MISMATCH'), { statusCode: 422 });
  const routingSite = [...routingSites][0];
  if (!routingSite || routingSites.size > 1 || String(mbom.rows[0].site_id) !== routingSite) {
    throw Object.assign(new Error('PRODUCTION_VERSION_SITE_MISMATCH'), { statusCode: 422 });
  }
  return routingSite;
}

async function validateStructureOwner(client: Pick<PoolClient, 'query'>, tableName: string, itemRevisionId: unknown): Promise<void> {
  if (!itemRevisionId) throw Object.assign(new Error(tableName === 'md_mbom_header' ? 'MBOM_OUTPUT_REVISION_REQUIRED' : 'ROUTING_OUTPUT_REVISION_REQUIRED'), { statusCode: 422 });
  const result = await client.query(`
    SELECT r.master_id, i.item_type, r.site_id
    FROM md_item_revision r JOIN md_item i ON i.master_id = r.item_id
    WHERE r.master_id = $1 AND r.lifecycle_status NOT IN ('Inactive','Obsolete')
  `, [itemRevisionId]);
  if (!result.rows[0]) throw Object.assign(new Error('OUTPUT_ITEM_REVISION_INVALID'), { statusCode: 422 });
  if (!['FG', 'SFG'].includes(String(result.rows[0].item_type))) {
    throw Object.assign(new Error(tableName === 'md_mbom_header' ? 'MBOM_OUTPUT_RAW_MATERIAL_NOT_ALLOWED' : 'ROUTING_OUTPUT_RAW_MATERIAL_NOT_ALLOWED'), { statusCode: 422 });
  }
}

function getContext(req: Request) {
  const suppliedUserId = (req.headers['x-user-id'] as string | undefined) ?? SYSTEM_USER_ID;
  return {
    userId: /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(suppliedUserId) ? suppliedUserId : SYSTEM_USER_ID,
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

const CODE_PREFIX_BY_ENTITY: Record<string, string> = { Factory: 'FAC', Shopfloor: 'SF', ProductionLine: 'PL', WorkCenter: 'WC', Workstation: 'WS', Machine: 'MC', Operation: 'OP', SkillGroup: 'SKG', 'SkillGroup:Machine': 'SKG-MC', 'SkillGroup:Workstation': 'SKG-WS', 'SkillGroup:WorkCenter': 'SKG-WC', Skill: 'SK', 'Skill:Machine': 'SK-MC', 'Skill:Workstation': 'SK-WS', 'Skill:WorkCenter': 'SK-WC' };

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

const PRINT_STATION_MODES = new Set(['PHYSICAL', 'SIMULATION', 'HYBRID']);
const PRINT_STATION_STATUSES = new Set(['PENDING', 'ONLINE', 'OFFLINE', 'DEGRADED', 'DISABLED']);
const PRINT_STATION_CAPABILITIES = new Set(['PRINT', 'LASER', 'VISION', 'PLC']);

function printStationUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw Object.assign(new Error('PRINT_STATION_GATEWAY_URL_REQUIRED'), { statusCode: 422 });
  const input = value.trim();
  let parsed: URL;
  try { parsed = new URL(input); } catch { throw Object.assign(new Error('PRINT_STATION_GATEWAY_URL_INVALID'), { statusCode: 422 }); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw Object.assign(new Error('PRINT_STATION_GATEWAY_URL_INVALID'), { statusCode: 422 });
  if (/\/{2,}$/.test(input.replace(`${parsed.protocol}//${parsed.host}`, ''))) throw Object.assign(new Error('PRINT_STATION_GATEWAY_URL_INVALID'), { statusCode: 422 });
  return input.replace(/\/+$/, '');
}

function printStationCapabilities(value: unknown): string[] {
  const values = Array.isArray(value) ? value.map(String) : ['PRINT'];
  const unique = [...new Set(values.map((item) => item.toUpperCase()))];
  if (!unique.length || unique.some((item) => !PRINT_STATION_CAPABILITIES.has(item))) throw Object.assign(new Error('PRINT_STATION_CAPABILITIES_INVALID'), { statusCode: 422 });
  return unique;
}

function printStationDate(value: unknown, fallback: Date): Date {
  if (value === undefined || value === null || value === '') return fallback;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw Object.assign(new Error('PRINT_STATION_EFFECTIVE_DATE_INVALID'), { statusCode: 422 });
  return date;
}

async function resolveMachineUnit(client: PoolClient, machineId: string, requestedUnitId?: string): Promise<Record<string, any>> {
  const result = requestedUnitId
    ? await client.query(`SELECT mu.*, eq.site_id, eq.active_flag AS machine_active, eq.execution_status AS machine_execution_status FROM md_machine_unit mu JOIN md_equipment eq ON eq.master_id = mu.machine_id WHERE mu.machine_unit_id = $1 AND mu.machine_id = $2 FOR UPDATE`, [requestedUnitId, machineId])
    : await client.query(`SELECT mu.*, eq.site_id, eq.active_flag AS machine_active, eq.execution_status AS machine_execution_status FROM md_machine_unit mu JOIN md_equipment eq ON eq.master_id = mu.machine_id WHERE mu.machine_id = $1 AND mu.active_flag = TRUE AND mu.execution_status = 'Available' AND eq.active_flag = TRUE AND eq.execution_status = 'Available' ORDER BY mu.unit_sequence LIMIT 1 FOR UPDATE`, [machineId]);
  const unit = result.rows[0];
  if (!unit || unit.machine_active !== true || unit.active_flag !== true || unit.execution_status !== 'Available' || unit.machine_execution_status !== 'Available' || unit.physical_identity_status !== 'Identified' || unit.planning_resource_flag !== true) throw Object.assign(new Error('MACHINE_UNIT_NOT_AVAILABLE'), { statusCode: 422 });
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
      const units = await client.query(`SELECT mu.*, eq.site_id, eq.active_flag AS machine_active, eq.execution_status AS machine_execution_status FROM md_machine_unit mu JOIN md_equipment eq ON eq.master_id = mu.machine_id WHERE mu.machine_id = $1 AND mu.active_flag = TRUE AND mu.execution_status = 'Available' AND mu.physical_identity_status = 'Identified' AND mu.planning_resource_flag = TRUE AND eq.active_flag = TRUE AND eq.execution_status = 'Available' AND NOT (mu.machine_unit_id = ANY($4::uuid[])) AND NOT EXISTS (SELECT 1 FROM md_resource_assignment ra WHERE ra.machine_unit_id = mu.machine_unit_id AND ra.assignment_role = 'Primary' AND ra.workstation_id IS DISTINCT FROM $5::uuid AND ra.effective_from < $3::timestamptz AND $2::timestamptz < COALESCE(ra.effective_to, 'infinity'::timestamptz)) ORDER BY mu.unit_sequence, mu.code FOR UPDATE`, [member.machine_id, effectiveFrom, effectiveTo || 'infinity', [...selectedUnitIds], workstationId]);
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

// A group-member mutation represents both requirement intent and an effective
// physical assignment. Keep the two records synchronized without making either
// table a duplicate Workstation-owned machine list.
async function addMachineGroupRequirementForAssignment(client: PoolClient, group: Record<string, any>, machine: Record<string, any>, unit: Record<string, any>, role: string, requirementType: string, effectiveFrom: string, context: { userId: string }): Promise<void> {
  const sequence = await client.query(`SELECT COALESCE(MAX(sequence_no), 0)::int + 1 AS next_sequence FROM md_workstation_machine_requirement WHERE machine_group_id = $1 AND active_flag = TRUE AND (effective_to IS NULL OR effective_to > $2::timestamptz)`, [group.master_id, effectiveFrom]);
  await client.query(`INSERT INTO md_workstation_machine_requirement (machine_group_id, machine_id, role, required_quantity, requirement_type, pinned_machine_unit_ids, sequence_no, effective_from, effective_to, created_by) VALUES ($1,$2,$3,1,$4,$5::jsonb,$6,$7,$8,$9)`, [group.master_id, machine.master_id, role, requirementType, JSON.stringify([String(unit.machine_unit_id)]), Number(sequence.rows[0]?.next_sequence || 1), effectiveFrom, group.effective_to || null, context.userId]);
}

async function endMachineGroupRequirementForAssignment(client: PoolClient, assignment: Record<string, any>, effectiveTo: string, context: { userId: string }): Promise<void> {
  if (!assignment.machine_group_id || !assignment.equipment_id || !assignment.machine_unit_id) return;
  const result = await client.query(`SELECT * FROM md_workstation_machine_requirement WHERE machine_group_id = $1 AND machine_id = $2 AND active_flag = TRUE AND (effective_to IS NULL OR effective_to > $3::timestamptz) AND pinned_machine_unit_ids @> $4::jsonb ORDER BY sequence_no DESC LIMIT 1 FOR UPDATE`, [assignment.machine_group_id, assignment.equipment_id, effectiveTo, JSON.stringify([String(assignment.machine_unit_id)])]);
  const requirement = result.rows[0];
  if (!requirement) return;
  const pinned = Array.isArray(requirement.pinned_machine_unit_ids) ? requirement.pinned_machine_unit_ids.map(String).filter((id: string) => id !== String(assignment.machine_unit_id)) : [];
  if (Number(requirement.required_quantity || 1) > 1 && pinned.length > 0) {
    await client.query(`UPDATE md_workstation_machine_requirement SET required_quantity = required_quantity - 1, pinned_machine_unit_ids = $1::jsonb, updated_by = $2, updated_at = NOW() WHERE requirement_id = $3`, [JSON.stringify(pinned), context.userId, requirement.requirement_id]);
  } else {
    await client.query(`UPDATE md_workstation_machine_requirement SET active_flag = FALSE, effective_to = $1, ended_by = $2, ended_at = NOW(), updated_by = $2, updated_at = NOW() WHERE requirement_id = $3`, [effectiveTo, context.userId, requirement.requirement_id]);
  }
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

function validateUomQuantity(value: unknown, uom: Record<string, any>, options: { positive?: boolean } = {}) {
  const raw = String(value ?? '').trim();
  if (!raw || !/^[+]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)) throw Object.assign(new Error('UOM_QUANTITY_REQUIRED'), { statusCode: 422 });
  if (options.positive !== false && Number(raw) <= 0) throw Object.assign(new Error('UOM_QUANTITY_MUST_BE_POSITIVE'), { statusCode: 422 });
  const precision = Number(uom.decimal_precision ?? 0);
  const normalized = raw.includes('.') ? raw.replace(/0+$/, '').replace(/\.$/, '') : raw;
  const decimals = normalized.includes('.') ? (normalized.split('.')[1] || '').length : 0;
  if (uom.allow_fraction === false && decimals > 0) throw Object.assign(new Error('UOM_FRACTION_NOT_ALLOWED'), { statusCode: 422 });
  if (decimals > (uom.allow_fraction === false ? 0 : precision)) throw Object.assign(new Error('UOM_DECIMAL_PRECISION_EXCEEDED'), { statusCode: 422 });
}

function normalizeShopfloorPayload(body: Record<string, unknown>): Record<string, unknown> {
  if (body['status'] !== undefined && body['lifecycle_status'] === undefined) {
    body['lifecycle_status'] = body['status'];
  }
  if (body['active_flag'] === false) body['lifecycle_status'] = 'Inactive';

  // Shopfloor uses the shared master-data lifecycle and hierarchy schema.
  // These fields belonged to an older resource form and are not columns of
  // md_shopfloor; accepting them would produce PostgreSQL 42703 at INSERT/UPDATE.
  for (const field of [
    'status',
    'active_flag',
    'max_concurrent_jobs',
    'default_efficiency',
    'execution_status',
    'planning_resource_flag',
    'assignment_role',
    'scheduling_flag',
    'oee_aggregation_flag',
  ]) delete body[field];
  return body;
}

function translatableColumns(tableName: string): string[] {
  const localizedNameTables = new Set([
    'md_site',
    'md_shopfloor',
    'md_production_area',
    'md_production_line',
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
  if (['md_site', 'md_shopfloor', 'md_production_area', 'md_production_line', 'md_work_center', 'md_workstation', 'md_equipment', 'md_skill'].includes(table.tableName) && (requireName || body['name'] !== undefined)) {
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

function isProductionVersionNameValid(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const name = value as Record<string, unknown>;
  return typeof name.vi === 'string' && name.vi.trim().length > 0 && typeof name.en === 'string' && name.en.trim().length > 0;
}

async function defaultProductionVersionName(client: PoolClient, itemRevisionID: string, code: string): Promise<Record<string, string>> {
  const result = await client.query(`SELECT COALESCE(i.code, r.revision_code, $2) AS item_code FROM md_item_revision r LEFT JOIN md_item i ON i.master_id = r.item_id WHERE r.master_id = $1`, [itemRevisionID, code]);
  const itemCode = String(result.rows[0]?.item_code || code);
  return {
    vi: `Phiên bản sản xuất ${itemCode}`,
    en: `Production Version ${code} for ${itemCode}`,
    ja: `${itemCode} 生産バージョン ${code}`,
    ko: `${itemCode} 생산 버전 ${code}`,
  };
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
    return { ...base, item_revision_id: row['item_revision_id'], site_id: row['site_id'], base_quantity: row['base_quantity'], base_uom_id: row['base_uom_id'], description: row['description'], business_version: row['business_version'], purpose: row['purpose'], structure_version: row['structure_version'], change_reason: row['change_reason'], engineering_note: row['engineering_note'], reference_document: row['reference_document'] };
  }
  if (table.tableName === 'md_routing_header') {
    return { ...base, item_revision_id: row['item_revision_id'], description: row['description'], business_version: row['business_version'], routing_type: row['routing_type'], production_purpose: row['production_purpose'], change_reason: row['change_reason'], engineering_note: row['engineering_note'], reference_document: row['reference_document'] };
  }
  if (table.tableName === 'md_production_version') {
    return { ...base, name_i18n: row['name_i18n'], item_revision_id: row['item_revision_id'], ebom_header_id: row['ebom_header_id'], mbom_header_id: row['mbom_header_id'], routing_header_id: row['routing_header_id'], site_id: row['site_id'], min_lot_size: row['min_lot_size'], max_lot_size: row['max_lot_size'] };
  }
  if (table.tableName === 'md_employee') {
    return { ...base, site_id: row['site_id'], default_work_center_id: row['default_work_center_id'], employee_status: row['employee_status'], preferred_locale: row['preferred_locale'] };
  }
  if (table.tableName === 'md_shift') {
    return { ...base, site_id: row['site_id'], start_time: row['start_time'], end_time: row['end_time'], crosses_midnight: row['crosses_midnight'] };
  }
  if (table.tableName === 'md_item_revision') {
    return { ...base, revision_code: row['revision_code'], item_id: row['item_id'], item_type: row['item_type'], site_id: row['site_id'], effective_from: row['effective_from'], effective_to: row['effective_to'], base_uom_id: row['base_uom_id'], base_uom_code: row['base_uom_code'], item_group: row['item_group'], material_group_id: row['material_group_id'], planning_strategy: row['planning_strategy'], procurement_type: row['procurement_type'], tracking_level: row['tracking_level'], default_scrap_rate: row['default_scrap_rate'] };
  }
  if (table.tableName === 'md_item') {
    return { ...base, item_group: row['item_group'], material_group_id: row['material_group_id'], item_type: row['item_type'], base_uom_id: row['base_uom_id'] };
  }
  if (table.tableName === 'md_uom') {
    return { ...base, uom_class: row['uom_class'], decimal_precision: row['decimal_precision'], site_id: row['site_id'] };
  }
  if (table.tableName === 'md_site') {
    return { ...base, timezone: row['timezone'], address: row['address'] };
  }
  if (table.tableName === 'md_work_center') {
    return { ...base, site_id: row['site_id'], work_center_type: row['work_center_type'], active_flag: row['active_flag'], resource_type: row['resource_type'], capacity_model: row['capacity_model'] };
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

function phase6Error(error: any): { status: number; code: string } | null {
  const message = String(error?.message || '');
  const known = new Set([
    'PRODUCTION_LINE_AREA_SITE_MISMATCH',
    'PRODUCTION_LINE_SHOPFLOOR_SITE_MISMATCH',
    'PRODUCTION_LINE_SHIFT_SITE_MISMATCH',
    'PRODUCTION_LINE_WORK_CENTER_SITE_MISMATCH',
    'PRODUCTION_LINE_WORK_CENTER_AREA_MISMATCH',
    'WORK_CENTER_LINE_OWNERSHIP_OVERLAP',
    'PRODUCTION_LINE_RESOURCE_SITE_MISMATCH',
    'PRODUCTION_LINE_RESOURCE_WORK_CENTER_MISMATCH',
    'PRODUCTION_LINE_RESOURCE_ASSIGNMENT_SNAPSHOT_MISMATCH',
    'PRODUCTION_LINE_RESOURCE_WORK_CENTER_NOT_SCOPED',
    'PRODUCTION_VERSION_LINE_SITE_MISMATCH',
    'PRODUCTION_VERSION_LINE_PV_NOT_RELEASED',
    'PRODUCTION_VERSION_LINE_NOT_RELEASED',
    'PRODUCTION_VERSION_LINE_OPERATION_CAPABILITY_UNRESOLVED',
  ]);
  if (known.has(message)) return { status: message.includes('OVERLAP') ? 409 : 422, code: message };
  if (error?.code === '23505') {
    const constraint = String(error?.constraint || '');
    if (constraint.includes('ux_md_pv_line_eligibility_priority_current')) return { status: 409, code: 'PRODUCTION_VERSION_LINE_PRIORITY_DUPLICATE' };
    if (constraint.includes('ux_md_pv_line_eligibility_primary_current')) return { status: 409, code: 'PRODUCTION_VERSION_LINE_PRIMARY_DUPLICATE' };
    if (constraint.includes('ux_md_pv_line_eligibility_current')) return { status: 409, code: 'PRODUCTION_VERSION_LINE_DUPLICATE' };
    return { status: 409, code: 'PRODUCTION_LINE_DUPLICATE' };
  }
  return null;
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

  router.get('/integration/snapshot', async (req, res, next) => {
    const requestedLimit = Number(req.query['limit'] ?? 500);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 5000) : 500;
    const cursorValue = typeof req.query['cursor'] === 'string' ? req.query['cursor'] : '';
    let offset = 0;
    try {
      if (cursorValue) offset = Number(JSON.parse(Buffer.from(cursorValue, 'base64url').toString('utf8')).offset ?? 0);
    } catch { return res.status(400).json({ error: 'SNAPSHOT_CURSOR_INVALID' }); }
    if (!Number.isInteger(offset) || offset < 0) return res.status(400).json({ error: 'SNAPSHOT_CURSOR_INVALID' });
    const siteId = typeof req.query['site_id'] === 'string' && req.query['site_id'] ? req.query['site_id'] : null;
    const client = await pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const watermark = await client.query<{ snapshot_at: string }>(`SELECT transaction_timestamp()::text AS snapshot_at`);
      const [sites, uoms, conversions, items, revisions, workCenters] = await Promise.all([
        client.query(`SELECT * FROM md_site WHERE lifecycle_status IN ('Released','Inactive','Obsolete') AND ($1::uuid IS NULL OR master_id = $1::uuid) ORDER BY master_id LIMIT $2 OFFSET $3`, [siteId, limit, offset]),
        client.query(`SELECT * FROM md_uom WHERE lifecycle_status IN ('Released','Inactive','Obsolete') ORDER BY master_id LIMIT $1 OFFSET $2`, [limit, offset]),
        client.query(`SELECT * FROM md_uom_conversion WHERE lifecycle_status IN ('Released','Inactive','Obsolete') ORDER BY master_id LIMIT $1 OFFSET $2`, [limit, offset]),
        client.query(`SELECT * FROM md_item WHERE lifecycle_status IN ('Released','Inactive','Obsolete') ORDER BY master_id LIMIT $1 OFFSET $2`, [limit, offset]),
        client.query(`SELECT * FROM md_item_revision WHERE lifecycle_status IN ('Released','Inactive','Obsolete') AND ($1::uuid IS NULL OR site_id = $1::uuid) ORDER BY master_id LIMIT $2 OFFSET $3`, [siteId, limit, offset]),
        client.query(`SELECT * FROM md_work_center WHERE lifecycle_status IN ('Released','Inactive','Obsolete') AND ($1::uuid IS NULL OR site_id = $1::uuid) ORDER BY master_id LIMIT $2 OFFSET $3`, [siteId, limit, offset]),
      ]);
      const results = [sites, uoms, conversions, items, revisions, workCenters];
      const complete = results.every((result) => result.rows.length < limit);
      const nextOffset = offset + limit;
      const nextCursor = complete ? null : Buffer.from(JSON.stringify({ offset: nextOffset })).toString('base64url');
      await client.query('COMMIT');
      return res.json({ source_service: SERVICE_NAME, contract_version: 'mes-master-data-snapshot-v1', site_id: siteId, snapshot_at: watermark.rows[0]?.snapshot_at, watermark: { snapshot_at: watermark.rows[0]?.snapshot_at, offset }, complete, next_cursor: nextCursor, data: { sites: sites.rows, uoms: uoms.rows, conversions: conversions.rows, items: items.rows, revisions: revisions.rows, work_centers: workCenters.rows } });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      return next(err);
    } finally { client.release(); }
  });

  router.get('/material-groups', async (req, res, next) => {
    try {
      const search = typeof req.query['search'] === 'string' ? `%${String(req.query['search']).trim()}%` : null;
      const { rows } = await pool.query(`
        SELECT g.*, (SELECT COUNT(*)::int FROM md_item i WHERE i.material_group_id = g.master_id) AS item_reference_count,
          (SELECT COUNT(*)::int FROM md_item_revision r WHERE r.material_group_id = g.master_id) AS revision_reference_count
        FROM md_material_group g
        WHERE ($1::text IS NULL OR g.code ILIKE $1 OR g.name::text ILIKE $1)
        ORDER BY g.code LIMIT $2`, [search, Math.min(Number(req.query['limit'] || 500), 500)]);
      return res.json({ data: rows });
    } catch (err) { return next(err); }
  });

  router.get('/material-groups/:id', async (req, res, next) => {
    try {
      const { rows } = await pool.query(`
        SELECT g.*, (SELECT COUNT(*)::int FROM md_item i WHERE i.material_group_id = g.master_id) AS item_reference_count,
          (SELECT COUNT(*)::int FROM md_item_revision r WHERE r.material_group_id = g.master_id) AS revision_reference_count
        FROM md_material_group g WHERE g.master_id = $1`, [req.params['id']]);
      if (!rows[0]) return res.status(404).json({ error: 'MATERIAL_GROUP_NOT_FOUND' });
      return res.json({ data: rows[0] });
    } catch (err) { return next(err); }
  });

  router.post('/material-groups', async (req, res, next) => {
    const body = normalizeBody(req.body); const code = String(body['code'] || '').trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9_-]{1,79}$/.test(code)) return res.status(422).json({ error: 'MATERIAL_GROUP_CODE_INVALID' });
    if (!localizedTextSchema.safeParse(body['name']).success) return res.status(422).json({ error: 'MATERIAL_GROUP_NAME_INVALID' });
    try {
      const { rows } = await pool.query(`INSERT INTO md_material_group (code, name, description, lifecycle_status, created_by) VALUES ($1,$2::jsonb,$3::jsonb,'Released',$4) RETURNING *`, [code, JSON.stringify(body['name']), body['description'] ? JSON.stringify(body['description']) : null, getContext(req).userId]);
      return res.status(201).json({ data: rows[0] });
    } catch (err: any) {
      if (err?.code === '23505') return res.status(409).json({ error: 'MATERIAL_GROUP_CODE_DUPLICATE' });
      return next(err);
    }
  });

  router.put('/material-groups/:id', async (req, res, next) => {
    const body = normalizeBody(req.body);
    try {
      const current = await pool.query(`SELECT * FROM md_material_group WHERE master_id = $1 FOR UPDATE`, [req.params['id']]);
      if (!current.rows[0]) return res.status(404).json({ error: 'MATERIAL_GROUP_NOT_FOUND' });
      const references = await pool.query(`SELECT (SELECT COUNT(*) FROM md_item WHERE material_group_id = $1) + (SELECT COUNT(*) FROM md_item_revision WHERE material_group_id = $1) AS total`, [req.params['id']]);
      if (Number(references.rows[0]?.total || 0) > 0) return res.status(409).json({ error: 'MATERIAL_GROUP_IN_USE', usage: Number(references.rows[0].total) });
      if (body['name'] !== undefined && !localizedTextSchema.safeParse(body['name']).success) return res.status(422).json({ error: 'MATERIAL_GROUP_NAME_INVALID' });
      const code = body['code'] === undefined ? current.rows[0].code : String(body['code']).trim().toUpperCase();
      if (!/^[A-Z0-9][A-Z0-9_-]{1,79}$/.test(code)) return res.status(422).json({ error: 'MATERIAL_GROUP_CODE_INVALID' });
      const { rows } = await pool.query(`UPDATE md_material_group SET code=$1, name=$2::jsonb, description=$3::jsonb, updated_by=$4, updated_at=NOW() WHERE master_id=$5 RETURNING *`, [code, JSON.stringify(body['name'] ?? current.rows[0].name), body['description'] === undefined ? current.rows[0].description : (body['description'] ? JSON.stringify(body['description']) : null), getContext(req).userId, req.params['id']]);
      return res.json({ data: rows[0] });
    } catch (err: any) { if (err?.code === '23505') return res.status(409).json({ error: 'MATERIAL_GROUP_CODE_DUPLICATE' }); if (String(err?.message) === 'MATERIAL_GROUP_IN_USE') return res.status(409).json({ error: 'MATERIAL_GROUP_IN_USE' }); return next(err); }
  });

  router.delete('/material-groups/:id', async (req, res, next) => {
    try {
      const references = await pool.query(`SELECT (SELECT COUNT(*) FROM md_item WHERE material_group_id = $1) + (SELECT COUNT(*) FROM md_item_revision WHERE material_group_id = $1) AS total`, [req.params['id']]);
      if (Number(references.rows[0]?.total || 0) > 0) return res.status(409).json({ error: 'MATERIAL_GROUP_IN_USE', usage: Number(references.rows[0].total) });
      const { rows } = await pool.query(`DELETE FROM md_material_group WHERE master_id=$1 RETURNING master_id`, [req.params['id']]);
      if (!rows[0]) return res.status(404).json({ error: 'MATERIAL_GROUP_NOT_FOUND' });
      return res.json({ deleted: true });
    } catch (err: any) { if (String(err?.message) === 'MATERIAL_GROUP_IN_USE') return res.status(409).json({ error: 'MATERIAL_GROUP_IN_USE' }); return next(err); }
  });

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

  router.get('/production-lines', async (req, res, next) => {
    try {
      const limit = Math.min(Math.max(Number(req.query['limit'] ?? 200), 1), 500);
      const values: unknown[] = [];
      const filters: string[] = [];
      if (typeof req.query['site_id'] === 'string' && req.query['site_id']) { values.push(req.query['site_id']); filters.push(`pl.site_id = $${values.length}`); }
      if (typeof req.query['search'] === 'string' && req.query['search']) { values.push(`%${req.query['search']}%`); filters.push(`(pl.code ILIKE $${values.length} OR pl.name::text ILIKE $${values.length})`); }
      const { rows } = await pool.query(`
        SELECT pl.*, s.code AS site_code, s.name AS site_name, pa.code AS area_code, pa.name AS area_name, sf.code AS shopfloor_code, sf.name AS shopfloor_name,
               (SELECT COUNT(*)::INT FROM md_production_line_work_center lwc WHERE lwc.production_line_id = pl.master_id AND lwc.active_flag = TRUE AND (lwc.effective_to IS NULL OR lwc.effective_to > NOW())) AS active_work_center_count,
               (SELECT COUNT(*)::INT FROM md_production_version_line_eligibility e WHERE e.production_line_id = pl.master_id AND e.active_flag = TRUE AND (e.effective_to IS NULL OR e.effective_to > NOW())) AS active_eligibility_count,
               CASE
                 WHEN NOT EXISTS (SELECT 1 FROM md_production_line_work_center lwc WHERE lwc.production_line_id = pl.master_id AND lwc.active_flag = TRUE AND (lwc.effective_to IS NULL OR lwc.effective_to > NOW())) THEN 'NotReady'
                 WHEN NOT EXISTS (SELECT 1 FROM md_production_version_line_eligibility e WHERE e.production_line_id = pl.master_id AND e.active_flag = TRUE AND (e.effective_to IS NULL OR e.effective_to > NOW())) THEN 'ReadyWithWarnings'
                 ELSE 'Ready'
               END AS readiness_status,
               (
                 CASE WHEN NOT EXISTS (SELECT 1 FROM md_production_line_work_center lwc WHERE lwc.production_line_id = pl.master_id AND lwc.active_flag = TRUE AND (lwc.effective_to IS NULL OR lwc.effective_to > NOW())) THEN 1 ELSE 0 END
                 + CASE WHEN NOT EXISTS (SELECT 1 FROM md_production_version_line_eligibility e WHERE e.production_line_id = pl.master_id AND e.active_flag = TRUE AND (e.effective_to IS NULL OR e.effective_to > NOW())) THEN 1 ELSE 0 END
               )::INT AS readiness_blocker_count
        FROM md_production_line pl
        JOIN md_site s ON s.master_id = pl.site_id
        JOIN md_production_area pa ON pa.master_id = pl.area_id
        LEFT JOIN md_shopfloor sf ON sf.master_id = pl.shopfloor_id
        ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
        ORDER BY pl.code LIMIT $${values.length + 1}`, [...values, limit]);
      return res.json({ data: rows });
    } catch (err) { return next(err); }
  });

  router.get('/production-lines/:id', async (req, res, next) => {
    try {
      const line = await pool.query(`
        SELECT pl.*, s.code AS site_code, s.name AS site_name, pa.code AS area_code, pa.name AS area_name, sf.code AS shopfloor_code, sf.name AS shopfloor_name
        FROM md_production_line pl JOIN md_site s ON s.master_id = pl.site_id JOIN md_production_area pa ON pa.master_id = pl.area_id LEFT JOIN md_shopfloor sf ON sf.master_id = pl.shopfloor_id
        WHERE pl.master_id = $1`, [req.params['id']]);
      if (!line.rows[0]) return res.status(404).json({ error: 'PRODUCTION_LINE_NOT_FOUND' });
      const workCenters = await pool.query(`
        SELECT lwc.*, wc.code AS work_center_code, wc.name AS work_center_name, wc.site_id, wc.area_id
        FROM md_production_line_work_center lwc JOIN md_work_center wc ON wc.master_id = lwc.work_center_id
        WHERE lwc.production_line_id = $1 ORDER BY lwc.active_flag DESC, lwc.sequence_no, wc.code`, [req.params['id']]);
      const eligibilities = await pool.query(`
        SELECT e.*, pv.code AS production_version_code, pv.name_i18n AS production_version_name
        FROM md_production_version_line_eligibility e JOIN md_production_version pv ON pv.master_id = e.production_version_id
        WHERE e.production_line_id = $1 ORDER BY e.active_flag DESC, e.priority_no, pv.code`, [req.params['id']]);
      const activeWorkCenterCount = workCenters.rows.filter((row: any) => row.active_flag !== false && (!row.effective_to || new Date(row.effective_to) > new Date())).length;
      const activeEligibilityCount = eligibilities.rows.filter((row: any) => row.active_flag !== false && (!row.effective_to || new Date(row.effective_to) > new Date())).length;
      const blockers = [
        activeWorkCenterCount ? null : { code: 'PRODUCTION_LINE_WORK_CENTER_REQUIRED' },
        activeEligibilityCount ? null : { code: 'PRODUCTION_LINE_ELIGIBILITY_NOT_CONFIGURED' },
      ].filter(Boolean);
      return res.json({ data: { ...line.rows[0], active_work_center_count: activeWorkCenterCount, active_eligibility_count: activeEligibilityCount, readiness_summary: { status: blockers.length ? (activeWorkCenterCount ? 'ReadyWithWarnings' : 'NotReady') : 'Ready', blocker_count: blockers.length, blockers }, work_centers: workCenters.rows, production_version_eligibilities: eligibilities.rows } });
    } catch (err) { return next(err); }
  });

  router.post('/production-lines', async (req, res, next) => {
    const context = getContext(req);
    const body = normalizeLocalizedFields({ resource: 'production-lines', tableName: 'md_production_line' }, normalizeBody(req.body));
    if (!localizedTextSchema.safeParse(body['name']).success) return res.status(422).json({ error: 'PRODUCTION_LINE_NAME_INVALID' });
    if (!body['site_id'] || !body['area_id']) return res.status(422).json({ error: 'PRODUCTION_LINE_SITE_AREA_REQUIRED' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN'); await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [context.userId]);
      const { rows } = await client.query(`
        INSERT INTO md_production_line (code, name, description, site_id, area_id, shopfloor_id, default_shift_id, line_type, lifecycle_status, active_flag, effective_from, effective_to, created_by)
        VALUES ($1,$2::jsonb,$3::jsonb,$4,$5,$6,$7,$8,$9,$10,COALESCE($11::timestamptz, NOW()),$12::timestamptz,$13)
        RETURNING *`,
        [String(body['code'] || '').trim().toUpperCase(), JSON.stringify(body['name']), body['description'] ? JSON.stringify(body['description']) : null, body['site_id'], body['area_id'], body['shopfloor_id'] || null, body['default_shift_id'] || null, body['line_type'] || 'Production', body['lifecycle_status'] || 'Draft', body['active_flag'] !== false, body['effective_from'] || null, body['effective_to'] || null, context.userId]);
      await client.query('COMMIT');
      return res.status(201).json({ data: rows[0] });
    } catch (err: any) {
      await client.query('ROLLBACK');
      const mapped = phase6Error(err); if (mapped) return res.status(mapped.status).json({ error: mapped.code });
      return next(err);
    } finally { client.release(); }
  });

  router.put('/production-lines/:id', async (req, res, next) => {
    const context = getContext(req);
    const body = normalizeLocalizedFields({ resource: 'production-lines', tableName: 'md_production_line' }, normalizeBody(req.body));
    const allowed = ['name', 'description', 'site_id', 'area_id', 'shopfloor_id', 'default_shift_id', 'line_type', 'lifecycle_status', 'active_flag', 'effective_from', 'effective_to'];
    const columns = allowed.filter((column) => body[column] !== undefined);
    if (!columns.length) return res.status(400).json({ error: 'PRODUCTION_LINE_NO_UPDATE_FIELDS' });
    if (body['name'] !== undefined && !localizedTextSchema.safeParse(body['name']).success) return res.status(422).json({ error: 'PRODUCTION_LINE_NAME_INVALID' });
    try {
      const values = columns.map((column) => ['name', 'description'].includes(column) ? JSON.stringify(body[column] ?? null) : body[column]);
      values.push(context.userId, req.params['id']);
      const { rows } = await pool.query(`UPDATE md_production_line SET ${columns.map((column, index) => `${column} = $${index + 1}${['name','description'].includes(column) ? '::jsonb' : ''}`).join(', ')}, updated_by = $${columns.length + 1}, updated_at = NOW() WHERE master_id = $${columns.length + 2} RETURNING *`, values);
      if (!rows[0]) return res.status(404).json({ error: 'PRODUCTION_LINE_NOT_FOUND' });
      return res.json({ data: rows[0] });
    } catch (err: any) {
      const mapped = phase6Error(err); if (mapped) return res.status(mapped.status).json({ error: mapped.code });
      return next(err);
    }
  });

  router.delete('/production-lines/:id', async (req, res, next) => {
    try {
      const dependency = await pool.query(`SELECT
        (SELECT COUNT(*)::INT FROM md_production_line_work_center WHERE production_line_id = $1) AS work_center_count,
        (SELECT COUNT(*)::INT FROM md_production_line_resource_scope WHERE production_line_id = $1) AS resource_scope_count,
        (SELECT COUNT(*)::INT FROM md_production_version_line_eligibility WHERE production_line_id = $1) AS eligibility_count`, [req.params['id']]);
      const counts = dependency.rows[0] || {};
      const total = Number(counts.work_center_count || 0) + Number(counts.resource_scope_count || 0) + Number(counts.eligibility_count || 0);
      if (total > 0) return res.status(409).json({ error: 'PRODUCTION_LINE_DELETE_DEPENDENCY_EXISTS', details: counts });
      const deleted = await pool.query(`DELETE FROM md_production_line WHERE master_id = $1 RETURNING master_id`, [req.params['id']]);
      if (!deleted.rows[0]) return res.status(404).json({ error: 'PRODUCTION_LINE_NOT_FOUND' });
      return res.json({ deleted: true, production_line_id: req.params['id'] });
    } catch (err) { return next(err); }
  });

  router.get('/production-lines/:id/work-centers', async (req, res, next) => {
    try {
      const { rows } = await pool.query(`
        SELECT lwc.*, wc.code AS work_center_code, wc.name AS work_center_name
        FROM md_production_line_work_center lwc JOIN md_work_center wc ON wc.master_id = lwc.work_center_id
        WHERE lwc.production_line_id = $1 ORDER BY lwc.active_flag DESC, lwc.sequence_no, wc.code`, [req.params['id']]);
      return res.json({ data: rows });
    } catch (err) { return next(err); }
  });

  router.put('/production-lines/:id/work-centers', async (req, res, next) => {
    const context = getContext(req);
    const items = Array.isArray(req.body?.work_centers) ? req.body.work_centers : [];
    const client = await pool.connect();
    try {
      await client.query('BEGIN'); await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [context.userId]);
      const line = await client.query(`SELECT master_id FROM md_production_line WHERE master_id = $1 FOR UPDATE`, [req.params['id']]);
      if (!line.rows[0]) throw Object.assign(new Error('PRODUCTION_LINE_NOT_FOUND'), { statusCode: 404 });
      await client.query(`UPDATE md_production_line_work_center SET active_flag = FALSE, effective_to = NOW(), updated_by = $2, updated_at = NOW() WHERE production_line_id = $1 AND active_flag = TRUE AND effective_to IS NULL`, [req.params['id'], context.userId]);
      const rows: any[] = [];
      for (const [index, item] of items.entries()) {
        const result = await client.query(`
          INSERT INTO md_production_line_work_center (production_line_id, work_center_id, sequence_no, mandatory_flag, effective_from, effective_to, active_flag, created_by)
          VALUES ($1,$2,$3,$4,COALESCE($5::timestamptz, NOW()),$6::timestamptz,TRUE,$7) RETURNING *`,
          [req.params['id'], item.work_center_id, Number(item.sequence_no || index + 1), item.mandatory_flag !== false, item.effective_from || null, item.effective_to || null, context.userId]);
        rows.push(result.rows[0]);
      }
      const eventType = 'MES.MasterData.ProductionLineWorkCenterAssigned.v1';
      await writeToOutbox(client, { topic: eventType, envelope: createEventEnvelope({ event_type: eventType, source_service: SERVICE_NAME, trace_id: context.traceId, payload: { production_line_id: req.params['id'], work_centers: rows } }) });
      await client.query('COMMIT');
      return res.json({ data: rows });
    } catch (err: any) {
      await client.query('ROLLBACK');
      const mapped = phase6Error(err); if (mapped) return res.status(mapped.status).json({ error: mapped.code });
      return res.status(err?.statusCode || 500).json({ error: err?.message || 'PRODUCTION_LINE_WORK_CENTER_SAVE_FAILED' });
    } finally { client.release(); }
  });

  router.get('/production-versions/:id/line-eligibility', async (req, res, next) => {
    try {
      const { rows } = await pool.query(`
        SELECT e.*, pl.code AS production_line_code, pl.name AS production_line_name, pl.site_id
        FROM md_production_version_line_eligibility e JOIN md_production_line pl ON pl.master_id = e.production_line_id
        WHERE e.production_version_id = $1 ORDER BY e.active_flag DESC, e.priority_no, pl.code`, [req.params['id']]);
      return res.json({ data: rows });
    } catch (err) { return next(err); }
  });

  router.put('/production-versions/:id/line-eligibility', async (req, res, next) => {
    const context = getContext(req);
    const lines = Array.isArray(req.body?.lines) ? req.body.lines : [];
    if (!lines.length) return res.status(422).json({ error: 'PRODUCTION_VERSION_LINE_ELIGIBILITY_REQUIRED' });
    if (lines.filter((line: any) => line.is_primary === true).length !== 1) return res.status(422).json({ error: 'PRODUCTION_VERSION_LINE_PRIMARY_REQUIRED' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN'); await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [context.userId]);
      const pv = await client.query(`SELECT master_id FROM md_production_version WHERE master_id = $1 FOR UPDATE`, [req.params['id']]);
      if (!pv.rows[0]) throw Object.assign(new Error('PRODUCTION_VERSION_NOT_FOUND'), { statusCode: 404 });
      await client.query(`UPDATE md_production_version_line_eligibility SET active_flag = FALSE, effective_to = NOW(), updated_by = $2, updated_at = NOW() WHERE production_version_id = $1 AND active_flag = TRUE AND effective_to IS NULL`, [req.params['id'], context.userId]);
      const rows: any[] = [];
      for (const [index, line] of lines.entries()) {
        const result = await client.query(`
          INSERT INTO md_production_version_line_eligibility (production_version_id, production_line_id, is_primary, priority_no, efficiency_factor, selection_mode, selection_policy, lifecycle_status, effective_from, effective_to, active_flag, created_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7,'Released',COALESCE($8::timestamptz, NOW()),$9::timestamptz,TRUE,$10) RETURNING *`,
          [req.params['id'], line.production_line_id, line.is_primary === true, Number(line.priority_no || index + 1), Number(line.efficiency_factor || 1), line.selection_mode || 'AutoPrimaryThenBackup', line.selection_policy || 'PrimaryThenBackup', line.effective_from || null, line.effective_to || null, context.userId]);
        rows.push(result.rows[0]);
      }
      const eventType = 'MES.MasterData.ProductionVersionLineEligibilityReleased.v1';
      await writeToOutbox(client, { topic: eventType, envelope: createEventEnvelope({ event_type: eventType, source_service: SERVICE_NAME, trace_id: context.traceId, payload: { production_version_id: req.params['id'], lines: rows } }) });
      await client.query('COMMIT');
      return res.json({ data: rows });
    } catch (err: any) {
      await client.query('ROLLBACK');
      const mapped = phase6Error(err); if (mapped) return res.status(mapped.status).json({ error: mapped.code });
      return res.status(err?.statusCode || 500).json({ error: err?.message || 'PRODUCTION_VERSION_LINE_ELIGIBILITY_SAVE_FAILED' });
    } finally { client.release(); }
  });

  router.post('/production-versions/:id/line-readiness-preview', async (req, res, next) => {
    try {
      const effectiveAt = req.body?.effective_at || new Date().toISOString();
      const result = await pool.query(`
        WITH ops AS (
          SELECT ro.master_id AS routing_operation_id, ro.operation_id, ro.work_center_id, ro.seq, op.code AS operation_code, op.name AS operation_name, op.is_schedulable
          FROM md_production_version pv
          JOIN md_routing_operation ro ON ro.routing_header_id = pv.routing_header_id
          JOIN md_operation op ON op.master_id = ro.operation_id
          WHERE pv.master_id = $1 AND ro.effective_to IS NULL AND ro.lifecycle_status NOT IN ('Inactive','Obsolete') AND op.is_schedulable = TRUE
        ), eligible AS (
          SELECT e.*, pl.code AS line_code, pl.name AS line_name
          FROM md_production_version_line_eligibility e JOIN md_production_line pl ON pl.master_id = e.production_line_id
          WHERE e.production_version_id = $1 AND e.active_flag = TRUE AND e.effective_from <= $2::timestamptz AND (e.effective_to IS NULL OR e.effective_to > $2::timestamptz)
        )
        SELECT eligible.*, COALESCE(jsonb_agg(jsonb_build_object(
          'routing_operation_id', ops.routing_operation_id,
          'operation_code', ops.operation_code,
          'work_center_id', ops.work_center_id,
          'line_work_center_ready', EXISTS (SELECT 1 FROM md_production_line_work_center lwc WHERE lwc.production_line_id = eligible.production_line_id AND lwc.active_flag = TRUE AND lwc.effective_from <= $2::timestamptz AND (lwc.effective_to IS NULL OR lwc.effective_to > $2::timestamptz)),
          'capability_ready', EXISTS (SELECT 1 FROM md_production_line_work_center lwc JOIN md_resource_capability rc ON rc.work_center_id = lwc.work_center_id AND rc.operation_id = ops.operation_id AND rc.eligibility = TRUE AND rc.active_flag = TRUE AND rc.lifecycle_status = 'Released' WHERE lwc.production_line_id = eligible.production_line_id AND lwc.active_flag = TRUE AND lwc.effective_from <= $2::timestamptz AND (lwc.effective_to IS NULL OR lwc.effective_to > $2::timestamptz)),
          'resource_scope_count', (SELECT COUNT(*)::INT FROM md_production_line_resource_scope scope WHERE scope.production_line_id = eligible.production_line_id AND scope.active_flag = TRUE AND scope.effective_from <= $2::timestamptz AND (scope.effective_to IS NULL OR scope.effective_to > $2::timestamptz))
        ) ORDER BY ops.seq), '[]'::jsonb) AS operations
        FROM eligible CROSS JOIN ops
        GROUP BY eligible.eligibility_id, eligible.production_version_id, eligible.production_line_id, eligible.is_primary, eligible.priority_no, eligible.efficiency_factor, eligible.selection_mode, eligible.selection_policy, eligible.lifecycle_status, eligible.effective_from, eligible.effective_to, eligible.active_flag, eligible.created_by, eligible.created_at, eligible.updated_by, eligible.updated_at, eligible.row_version, eligible.attributes, eligible.line_code, eligible.line_name
        ORDER BY eligible.is_primary DESC, eligible.priority_no, eligible.line_code`, [req.params['id'], effectiveAt]);
      const lines = result.rows.map((line: any) => {
        const blockers = (line.operations || []).flatMap((operation: any) => [
          operation.line_work_center_ready ? null : { code: 'LINE_WORK_CENTER_NOT_SCOPED', routing_operation_id: operation.routing_operation_id, work_center_id: operation.work_center_id },
          operation.capability_ready ? null : { code: 'LINE_OPERATION_CAPABILITY_MISSING', routing_operation_id: operation.routing_operation_id, work_center_id: operation.work_center_id },
        ].filter(Boolean));
        return { ...line, readiness_status: blockers.length ? 'NotReady' : 'Ready', blockers };
      });
      return res.json({ data: { production_version_id: req.params['id'], effective_at: effectiveAt, lines } });
    } catch (err) { return next(err); }
  });

  router.post('/ebom-headers/:id/create-mbom-draft', async (req, res, next) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const header = await client.query('SELECT * FROM md_ebom_header WHERE master_id = $1 AND lifecycle_status = \'Released\'', [req.params['id']]);
      if (!header.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Released EBOM not found' }); }
      const ebom = header.rows[0];
      const mbom = await client.query(`INSERT INTO md_mbom_header (code, name, description, site_id, business_version, purpose, base_quantity, base_uom_id, item_revision_id, effective_from, created_by)
        SELECT $1, e.name, e.description, r.site_id, '1', 'Standard', 1, i.base_uom_id, e.item_revision_id, NOW(), $2
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

  router.get('/ebom-headers', async (req, res, next) => {
    try {
      const params: unknown[] = [];
      const filters: string[] = [];
      if (typeof req.query['item_revision_id'] === 'string' && req.query['item_revision_id']) { params.push(req.query['item_revision_id']); filters.push(`e.item_revision_id = $${params.length}`); }
      if (typeof req.query['lifecycle_status'] === 'string' && req.query['lifecycle_status']) { params.push(req.query['lifecycle_status']); filters.push(`e.lifecycle_status = $${params.length}`); }
      if (typeof req.query['effective_at'] === 'string' && req.query['effective_at']) {
        const at = new Date(String(req.query['effective_at']));
        if (Number.isNaN(at.getTime())) return res.status(422).json({ error: 'EFFECTIVE_AT_INVALID' });
        params.push(at.toISOString());
        filters.push(`e.effective_from <= $${params.length}::timestamptz AND (e.effective_to IS NULL OR $${params.length}::timestamptz < e.effective_to)`);
      }
      const { rows } = await pool.query(`SELECT e.*, r.revision_code, r.item_id, i.code AS item_code, i.name AS item_name,
        (SELECT COUNT(*)::int FROM md_ebom_line l WHERE l.ebom_header_id = e.master_id AND l.lifecycle_status NOT IN ('Inactive','Obsolete') AND l.effective_to IS NULL) AS current_line_count
        FROM md_ebom_header e JOIN md_item_revision r ON r.master_id = e.item_revision_id JOIN md_item i ON i.master_id = r.item_id
        ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''} ORDER BY e.code, e.version_no`, params);
      return res.json({ data: rows });
    } catch (err) { return next(err); }
  });

  router.get('/ebom-headers/:id', async (req, res, next) => {
    try {
      const header = await pool.query(`SELECT e.*, r.revision_code, i.code AS item_code, i.name AS item_name FROM md_ebom_header e JOIN md_item_revision r ON r.master_id = e.item_revision_id JOIN md_item i ON i.master_id = r.item_id WHERE e.master_id = $1`, [req.params['id']]);
      if (!header.rows[0]) return res.status(404).json({ error: 'EBOM_NOT_FOUND' });
      const lines = await pool.query(`SELECT l.*, r.item_id AS component_item_id, r.revision_code AS component_revision_code, i.code AS component_item_code, i.name AS component_item_name, u.code AS uom_code, u.name AS uom_name
        FROM md_ebom_line l JOIN md_item_revision r ON r.master_id = l.component_revision_id JOIN md_item i ON i.master_id = r.item_id JOIN md_uom u ON u.master_id = l.uom_id
        WHERE l.ebom_header_id = $1 AND l.lifecycle_status NOT IN ('Inactive','Obsolete') AND l.effective_to IS NULL ORDER BY l.parent_line_id NULLS FIRST, l.seq, l.code`, [req.params['id']]);
      return res.json({ data: { ...header.rows[0], lines: lines.rows, current_line_count: lines.rows.length } });
    } catch (err) { return next(err); }
  });

  router.put('/ebom-headers/:id/design-tree', async (req, res, next) => {
    const context = getContext(req); const submitted = (Array.isArray(req.body?.lines) ? req.body.lines as Record<string, any>[] : []).map((line) => ({ ...line, parent_line_id: null })) as Record<string, any>[]; const client = await pool.connect();
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
        if (!Number.isInteger(seq) || seq <= 0) throw Object.assign(new Error('EBOM_SEQUENCE_INVALID'), { statusCode: 422 });
        if (!Number.isFinite(Number(line.quantity_per)) || Number(line.quantity_per) <= 0) throw Object.assign(new Error('EBOM_QUANTITY_INVALID'), { statusCode: 422 });
        const siblingKey = `${parent || '__root__'}:${seq}`; if (siblingSeq.has(siblingKey)) throw Object.assign(new Error('EBOM_SEQUENCE_DUPLICATE'), { statusCode: 422 }); siblingSeq.add(siblingKey);
        const componentKey = `${parent || '__root__'}:${line.component_revision_id}`; if (componentByParent.has(componentKey)) throw Object.assign(new Error('EBOM_COMPONENT_DUPLICATE'), { statusCode: 422 }); componentByParent.add(componentKey); parentByKey.set(key, parent);
      }
      for (const key of keys) { const visited = new Set<string>(); let cursor: string | null = key; while (cursor) { if (visited.has(cursor)) throw Object.assign(new Error('EBOM_HIERARCHY_CYCLE'), { statusCode: 422 }); visited.add(cursor); cursor = parentByKey.get(cursor) || null; } }
      for (const line of submitted) {
        const revision = await client.query(`SELECT r.master_id, r.base_uom_id FROM md_item_revision r WHERE r.master_id = $1 AND r.lifecycle_status NOT IN ('Inactive','Obsolete')`, [line.component_revision_id]);
        if (!revision.rows[0] || !revision.rows[0].base_uom_id) throw Object.assign(new Error('EBOM_COMPONENT_REVISION_INVALID'), { statusCode: 422 });
        const derivedUomId = String(revision.rows[0].base_uom_id);
        const uom = await client.query(`SELECT master_id FROM md_uom WHERE master_id = $1 AND lifecycle_status = 'Released'`, [derivedUomId]);
        if (!uom.rows[0]) throw Object.assign(new Error('EBOM_UOM_INVALID'), { statusCode: 422 });
        line.uom_id = derivedUomId;
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

  router.get(['/production-ready-versions', '/production-ready-item-revisions'], async (req, res, next) => {
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
        // Validity is date-based for planning. A revision released at any
        // time during the selected date is valid for that date's planning
        // window; comparing a timestamptz to midnight incorrectly hid it.
        `r.effective_from < ($1::DATE + INTERVAL '1 day') AND (r.effective_to IS NULL OR r.effective_to > $1::DATE)`,
        `pv.lifecycle_status = 'Released'`,
        `pv.effective_from < ($1::DATE + INTERVAL '1 day') AND (pv.effective_to IS NULL OR pv.effective_to > $1::DATE)`,
        `mb.lifecycle_status = 'Released'`,
        `mb.effective_from < ($1::DATE + INTERVAL '1 day') AND (mb.effective_to IS NULL OR mb.effective_to > $1::DATE)`,
        `rt.lifecycle_status = 'Released'`,
        `rt.effective_from < ($1::DATE + INTERVAL '1 day') AND (rt.effective_to IS NULL OR rt.effective_to > $1::DATE)`,
      ];
      if (siteId) { values.push(siteId); filters.push(`pv.site_id = $${values.length}`); }
      if (search) {
        values.push(`%${search}%`);
        filters.push(`(i.code ILIKE $${values.length} OR r.name::text ILIKE $${values.length} OR r.revision_code ILIKE $${values.length} OR pv.code ILIKE $${values.length})`);
      }
      const candidates = await pool.query(
        `SELECT pv.name_i18n AS production_version_name, pv.min_lot_size, pv.max_lot_size,
                i.master_id AS item_id, i.code AS item_code, r.name AS item_name,
                r.master_id AS item_revision_id, r.revision_code, r.lifecycle_status AS revision_status,
                r.effective_from AS revision_effective_from, r.effective_to AS revision_effective_to,
                u.code AS base_uom_code, u.master_id AS base_uom_id, u.decimal_precision AS base_uom_decimal_precision, u.allow_fraction AS base_uom_allow_fraction,
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
        ready.push({ ...candidate,
          production_version_id: candidate['production_version_id'],
          production_version_code: candidate['production_version_code'],
          production_version_name: candidate['production_version_name'],
          item_revision: { id: candidate['item_revision_id'], code: candidate['revision_code'], name: candidate['item_name'] },
          mbom: { id: candidate['mbom_header_id'], code: candidate['mbom_code'], name: candidate['mbom_name'] },
          routing: { id: candidate['routing_header_id'], code: candidate['routing_code'], name: candidate['routing_name'] },
          site: { id: candidate['site_id'], code: candidate['site_code'] },
          base_uom: { id: candidate['base_uom_id'], code: candidate['base_uom_code'], decimal_precision: candidate['base_uom_decimal_precision'], allow_fraction: candidate['base_uom_allow_fraction'], lifecycle_status: 'Released' },
          valid_from: candidate['revision_effective_from'], valid_to: candidate['revision_effective_to'],
          ready: true, warnings: [], display_code: `${candidate['item_code']}-${candidate['revision_code']}`, readiness_status: 'Ready' });
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
         WHERE es.employee_id = $1
           AND s.scope = 'Employee' AND s.legacy_flag = FALSE
         ORDER BY es.active_flag DESC, s.code, es.effective_from DESC`,
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
        COALESCE(dep.active_assignment_count, 0) AS active_assignment_count,
        COALESCE(dep.operation_requirement_count, 0) AS operation_requirement_count,
        COALESCE(dep.production_standard_count, 0) AS production_standard_count,
        (COALESCE(dep.active_assignment_count, 0) + COALESCE(dep.operation_requirement_count, 0) + COALESCE(dep.production_standard_count, 0)) AS dependency_count
        FROM md_skill s LEFT JOIN md_skill_group sg ON sg.skill_group_id = s.skill_group_id
        LEFT JOIN LATERAL (
          SELECT
            (SELECT COUNT(*)::int FROM md_employee_skill es WHERE es.skill_id = s.master_id AND es.active_flag = TRUE AND es.effective_to IS NULL) AS active_assignment_count,
            (SELECT COUNT(*)::int FROM md_operation_skill_requirement osr WHERE osr.skill_id = s.master_id AND osr.active_flag = TRUE AND (osr.effective_to IS NULL OR osr.effective_to > NOW())) AS operation_requirement_count,
            (SELECT COUNT(*)::int FROM md_production_standard ps WHERE ps.skill_id = s.master_id AND ps.lifecycle_status NOT IN ('Inactive','Obsolete') AND (ps.valid_to IS NULL OR ps.valid_to > NOW())) AS production_standard_count
        ) dep ON TRUE
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
        pool.query(`SELECT COUNT(*)::int AS count FROM md_production_standard WHERE skill_id = $1 AND lifecycle_status NOT IN ('Inactive','Obsolete') AND (valid_to IS NULL OR valid_to > NOW())`, [req.params['id']]).catch(() => ({ rows: [{ count: 0 }] })),
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
        pool.query(`SELECT COUNT(*)::int AS count FROM md_production_standard WHERE skill_id = $1 AND lifecycle_status NOT IN ('Inactive','Obsolete') AND (valid_to IS NULL OR valid_to > NOW())`, [req.params['id']]).catch(() => ({ rows: [{ count: 0 }] })),
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
    if (!body['base_uom_id']) return res.status(422).json({ error: 'BASE_UOM_REQUIRED' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [context.userId]);
      const materialGroup = await client.query(`SELECT master_id, code FROM md_material_group WHERE master_id = $1 OR UPPER(code) = UPPER($2)`, [body['material_group_id'] || null, body['item_group'] || null]);
      if (!materialGroup.rows[0]) throw Object.assign(new Error('MATERIAL_GROUP_REQUIRED'), { statusCode: 422 });
      const materialGroupId = materialGroup.rows[0].master_id; const materialGroupCode = materialGroup.rows[0].code;
      const uom = await client.query(`SELECT master_id FROM md_uom WHERE master_id = $1 AND lifecycle_status = 'Released'`, [body['base_uom_id']]);
      if (!uom.rows[0]) throw Object.assign(new Error('UOM_NOT_RELEASED'), { statusCode: 422 });
      const siteResult = await client.query(`SELECT master_id FROM md_site WHERE lifecycle_status = 'Released' ORDER BY code LIMIT 1`);
      const siteId = String(body['site_id'] || siteResult.rows[0]?.master_id || '');
      if (!siteId) throw Object.assign(new Error('A released site is required to create an Item Revision'), { statusCode: 422 });
      const itemResult = await client.query(`
        INSERT INTO md_item (code, name, item_group, material_group_id, item_type, base_uom_id, effective_from, created_by)
        VALUES ($1, $2::jsonb, $3, $4, $5, $6, COALESCE($7::timestamptz, NOW()), $8)
        RETURNING *
      `, [code, JSON.stringify(name), materialGroupCode, materialGroupId, body['item_type'] || 'FG', body['base_uom_id'], body['effective_from'] || null, context.userId]);
      const item = itemResult.rows[0] as Record<string, unknown>;
      const allocation = await allocateItemRevisionCode(client, String(item['master_id']), code);
      const revisionResult = await client.query(`
        INSERT INTO md_item_revision (
          code, name, version_no, lifecycle_status, effective_from, created_by, item_id, revision_code, site_id,
          is_default, item_group, material_group_id, base_uom_id, planning_strategy, procurement_type, tracking_level, default_scrap_rate,
          specification_ref, change_reason
        ) VALUES ($1, $2::jsonb, $3, 'Draft', $4::timestamptz, $5, $6, $7, $8, TRUE, $9, $10, $11, $12, $13, $14, $15, $16, NULL)
        RETURNING *
        `, [allocation.revisionCode, JSON.stringify(name), allocation.revisionNo, body['effective_from'] || new Date().toISOString(), context.userId, item['master_id'], allocation.revisionCode, siteId, materialGroupCode, materialGroupId, body['base_uom_id'], body['planning_strategy'] || 'MakeToStock', body['procurement_type'] || (body['item_type'] === 'RM' ? 'Buy' : 'Make'), body['tracking_level'] || 'None', body['default_scrap_rate'] || 0, body['specification_ref'] || null]);
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
    let effectiveFrom: Date;
    try { effectiveFrom = parseRevisionEffectiveFrom(body['effective_from']); }
    catch (error: any) { return res.status(422).json({ error: error.code || 'ITEM_REVISION_EFFECTIVE_FROM_INVALID', message: error.message }); }
    if (!changeReason) return res.status(400).json({ error: 'change_reason is required for a successor revision' });
    if (effectiveFrom.getTime() < Date.now()) return res.status(422).json({ error: 'ITEM_REVISION_EFFECTIVE_FROM_PAST', message: 'A new revision cannot start in the past.' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [context.userId]);
      const itemResult = await client.query(`SELECT master_id, code FROM md_item WHERE master_id = $1 FOR UPDATE`, [req.params['id']]);
      if (!itemResult.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'ITEM_NOT_FOUND' }); }
      const existingRevisionResult = await client.query(`SELECT r.*, i.code AS item_code FROM md_item_revision r JOIN md_item i ON i.master_id = r.item_id WHERE r.item_id = $1 ORDER BY r.effective_from, r.version_no FOR UPDATE`, [req.params['id']]);
      const revisions = existingRevisionResult.rows as Array<Record<string, any>>;
      const current = revisions.find((revision) => {
        const from = new Date(String(revision.effective_from));
        const to = revision.effective_to ? new Date(String(revision.effective_to)) : null;
        return from <= new Date() && (!to || new Date() < to);
      });
      if (!current || current.lifecycle_status !== 'Released') { await client.query('ROLLBACK'); return res.status(409).json({ error: 'ITEM_REVISION_SUCCESSOR_REQUIRES_RELEASED_CURRENT' }); }
      const sameStart = revisions.find((revision) => new Date(String(revision.effective_from)).getTime() === effectiveFrom.getTime());
      if (sameStart) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'ITEM_REVISION_EFFECTIVE_FROM_CONFLICT', message: 'Another revision already starts at this exact instant.' }); }
      const previous = [...revisions].reverse().find((revision) => new Date(String(revision.effective_from)) < effectiveFrom);
      if (body['name'] !== undefined && !localizedTextSchema.safeParse(body['name']).success) { await client.query('ROLLBACK'); return res.status(422).json({ error: 'ITEM_REVISION_NAME_INVALID' }); }
      if (body['base_uom_id']) {
        const uom = await client.query(`SELECT master_id FROM md_uom WHERE master_id = $1 AND lifecycle_status = 'Released'`, [body['base_uom_id']]);
        if (!uom.rows[0]) { await client.query('ROLLBACK'); return res.status(422).json({ error: 'UOM_NOT_RELEASED' }); }
      }
      const allocation = await allocateItemRevisionCode(client, String(req.params['id']), String(itemResult.rows[0].code));
      // Revisions own independent intervals. A new revision must not mutate
      // the previous revision's explicit effective_to; overlap is valid when
      // the user intentionally configures it.
      const revisionResult = await client.query(`
        INSERT INTO md_item_revision (code, name, version_no, lifecycle_status, effective_from, effective_to, created_by, item_id, revision_code, site_id, is_default, item_group, material_group_id, base_uom_id, planning_strategy, procurement_type, tracking_level, default_scrap_rate, specification_ref, change_reason, previous_revision_id)
        VALUES ($1, $2::jsonb, $3, 'Draft', $4, $5, $6, $7, $8, $9, FALSE, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        RETURNING *
      `, [allocation.revisionCode, JSON.stringify(body['name'] || current['name']), allocation.revisionNo, effectiveFrom.toISOString(), null, context.userId, current['item_id'], allocation.revisionCode, current['site_id'], body['item_group'] || current['item_group'], body['material_group_id'] || current['material_group_id'], body['base_uom_id'] || current['base_uom_id'], body['planning_strategy'] || current['planning_strategy'], body['procurement_type'] || current['procurement_type'], body['tracking_level'] || current['tracking_level'], body['default_scrap_rate'] ?? current['default_scrap_rate'], body['specification_ref'] || current['specification_ref'] || null, changeReason, previous?.master_id || null]);
      await client.query(`INSERT INTO md_item_revision_temporal_audit (item_id, revision_id, old_effective_from, new_effective_from, old_effective_to, new_effective_to, change_reason, triggered_by_revision_id, changed_by, correlation_id) VALUES ($1,$2,NULL,$3,NULL,$4,'REVISION_CREATED',$5,$6,$7)`, [current['item_id'], revisionResult.rows[0].master_id, effectiveFrom.toISOString(), null, previous?.master_id || null, context.userId, context.traceId]);
      await client.query('COMMIT');
      return res.status(201).json({ data: revisionResult.rows[0], previous_revision_id: previous?.master_id || null, next_revision_id: null });
    } catch (err: any) { await client.query('ROLLBACK'); if (err?.code === '23505') return res.status(409).json({ error: 'ITEM_REVISION_EFFECTIVE_FROM_CONFLICT' }); return next(err); } finally { client.release(); }
  });

  router.get('/items/:id/effective-revision', async (req, res, next) => {
    try {
      const atRaw = req.query['at'] ? String(req.query['at']) : new Date().toISOString();
      const at = new Date(atRaw);
      if (Number.isNaN(at.getTime())) return res.status(422).json({ error: 'ITEM_REVISION_EFFECTIVE_FROM_INVALID' });
      const result = await pool.query(`SELECT r.*, s.timezone AS site_timezone, i.code AS item_code, i.name AS item_name,
        CASE WHEN r.effective_from > $2::timestamptz THEN 'Scheduled'
             WHEN r.effective_to IS NOT NULL AND r.effective_to <= $2::timestamptz THEN 'Historical'
             ELSE 'Current' END AS temporal_status
        FROM md_item_revision r JOIN md_item i ON i.master_id = r.item_id LEFT JOIN md_site s ON s.master_id = r.site_id
        WHERE r.item_id = $1 AND r.effective_from <= $2::timestamptz AND (r.effective_to IS NULL OR $2::timestamptz < r.effective_to)`, [req.params['id'], atRaw]);
      if (result.rows.length > 1) return res.status(500).json({ error: 'ITEM_REVISION_OVERLAP_DETECTED' });
      if (!result.rows[0]) return res.status(404).json({ error: 'ITEM_REVISION_NOT_EFFECTIVE' });
      return res.json({ data: result.rows[0], effective_at: atRaw });
    } catch (err) { return next(err); }
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
      const { rows } = await pool.query(`SELECT mu.*, eq.code AS machine_code, eq.name AS machine_name,
        ra.master_id AS current_assignment_id, ra.work_center_id AS current_work_center_id,
        ra.workstation_id AS current_workstation_id, wc.code AS current_work_center_code,
        ws.code AS current_workstation_code,
        (SELECT COUNT(*)::INT FROM md_resource_assignment history_ra WHERE history_ra.machine_unit_id = mu.machine_unit_id) AS assignment_count,
        (SELECT COUNT(*)::INT FROM md_workstation_machine_requirement requirement
          WHERE requirement.pinned_machine_unit_ids @> jsonb_build_array(mu.machine_unit_id::text)) AS workstation_requirement_count
        FROM md_machine_unit mu JOIN md_equipment eq ON eq.master_id = mu.machine_id
        LEFT JOIN md_resource_assignment ra ON ra.machine_unit_id = mu.machine_unit_id
          AND ra.effective_from <= NOW() AND (ra.effective_to IS NULL OR ra.effective_to > NOW())
          AND ra.lifecycle_status NOT IN ('Inactive','Obsolete')
        LEFT JOIN md_work_center wc ON wc.master_id = ra.work_center_id
        LEFT JOIN md_workstation ws ON ws.master_id = ra.workstation_id
        WHERE mu.machine_id = $1 ORDER BY mu.unit_sequence`, [req.params['id']]);
      for (const row of rows) row.can_delete = Number(row.assignment_count || 0) === 0 && Number(row.workstation_requirement_count || 0) === 0;
      return res.json({ data: rows });
    } catch (err) { return next(err); }
  });

  router.post('/machines/:id/units', async (req, res, next) => {
    const context = getContext(req);
    const serial = String(req.body?.serial_number || '').trim();
    if (!serial) return res.status(422).json({ error: 'MACHINE_UNIT_IDENTITY_REQUIRED' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const machine = await client.query(`SELECT master_id, code, site_id, active_flag, planning_resource_flag, execution_status FROM md_equipment WHERE master_id = $1 FOR UPDATE`, [req.params['id']]);
      if (!machine.rows[0]) throw Object.assign(new Error('MACHINE_NOT_FOUND'), { statusCode: 404 });
      const sequence = Number(req.body?.unit_sequence || (await client.query(`SELECT COALESCE(MAX(unit_sequence),0)+1 AS next_sequence FROM md_machine_unit WHERE machine_id = $1`, [req.params['id']])).rows[0].next_sequence);
      if (!Number.isInteger(sequence) || sequence < 1) throw Object.assign(new Error('MACHINE_UNIT_SEQUENCE_INVALID'), { statusCode: 422 });
      const code = String(req.body?.code || `${machine.rows[0].code}-${String(sequence).padStart(2, '0')}`);
      const unit = await client.query(`INSERT INTO md_machine_unit (machine_id, code, unit_sequence, serial_number, lifecycle_status, physical_identity_status, planning_resource_flag, execution_status, active_flag) VALUES ($1,$2,$3,$4,'Released','Identified',$5,'Available',TRUE) RETURNING *`, [req.params['id'], code, sequence, serial, machine.rows[0].planning_resource_flag === true && machine.rows[0].active_flag === true && machine.rows[0].execution_status === 'Available']);
      await client.query(`UPDATE md_equipment SET quantity = GREATEST(quantity, $1), serial_number = NULL, updated_by = $2, updated_at = NOW() WHERE master_id = $3`, [sequence, context.userId, req.params['id']]);
      await client.query('COMMIT');
      return res.status(201).json({ data: unit.rows[0] });
    } catch (err: any) {
      await client.query('ROLLBACK');
      if (err?.code === '23505') return res.status(409).json({ error: 'MACHINE_UNIT_IDENTITY_DUPLICATE', message: 'Unit code, sequence, or serial number is already used.' });
      return res.status(err?.statusCode || 500).json({ error: err?.message || 'MACHINE_UNIT_CREATE_FAILED' });
    } finally { client.release(); }
  });

  router.get('/machine-units/:id', async (req, res, next) => {
    try {
      const unit = await pool.query(`SELECT mu.*, eq.code AS machine_code, eq.name AS machine_name, eq.site_id,
        ra.master_id AS current_assignment_id, ra.work_center_id AS current_work_center_id, ra.workstation_id AS current_workstation_id,
        wc.code AS current_work_center_code, ws.code AS current_workstation_code
        FROM md_machine_unit mu JOIN md_equipment eq ON eq.master_id = mu.machine_id
        LEFT JOIN md_resource_assignment ra ON ra.machine_unit_id = mu.machine_unit_id AND ra.effective_from <= NOW() AND (ra.effective_to IS NULL OR ra.effective_to > NOW()) AND ra.lifecycle_status NOT IN ('Inactive','Obsolete')
        LEFT JOIN md_work_center wc ON wc.master_id = ra.work_center_id LEFT JOIN md_workstation ws ON ws.master_id = ra.workstation_id WHERE mu.machine_unit_id = $1`, [req.params['id']]);
      if (!unit.rows[0]) return res.status(404).json({ error: 'MACHINE_UNIT_NOT_FOUND' });
      const history = await pool.query(`SELECT ra.*, wc.code AS work_center_code, ws.code AS workstation_code FROM md_resource_assignment ra LEFT JOIN md_work_center wc ON wc.master_id = ra.work_center_id LEFT JOIN md_workstation ws ON ws.master_id = ra.workstation_id WHERE ra.machine_unit_id = $1 ORDER BY ra.effective_from DESC`, [req.params['id']]);
      return res.json({ data: { ...unit.rows[0], assignment_history: history.rows } });
    } catch (err) { return next(err); }
  });

  router.delete('/machine-units/:id', async (req, res, next) => {
    const context = getContext(req);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [context.userId]);
      const unit = await client.query(`SELECT machine_unit_id FROM md_machine_unit WHERE machine_unit_id = $1 FOR UPDATE`, [req.params['id']]);
      if (!unit.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'MACHINE_UNIT_NOT_FOUND' });
      }
      const blockers = await client.query(`SELECT
        (SELECT COUNT(*)::INT FROM md_resource_assignment WHERE machine_unit_id = $1) AS assignment_count,
        (SELECT COUNT(*)::INT FROM md_workstation_machine_requirement WHERE pinned_machine_unit_ids @> jsonb_build_array($1::text)) AS workstation_requirement_count`, [req.params['id']]);
      const blocker = blockers.rows[0];
      if (Number(blocker.assignment_count) > 0 || Number(blocker.workstation_requirement_count) > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'MACHINE_UNIT_DELETE_DEPENDENCY_EXISTS', details: { assignment_count: Number(blocker.assignment_count), workstation_requirement_count: Number(blocker.workstation_requirement_count) } });
      }
      await client.query(`DELETE FROM md_machine_unit WHERE machine_unit_id = $1`, [req.params['id']]);
      await client.query('COMMIT');
      return res.json({ deleted: true, machine_unit_id: req.params['id'] });
    } catch (err: any) {
      await client.query('ROLLBACK');
      if (err?.code === '23503') return res.status(409).json({ error: 'MACHINE_UNIT_DELETE_DEPENDENCY_EXISTS' });
      return next(err);
    } finally { client.release(); }
  });

  router.put('/machine-units/:id', async (req, res, next) => {
    const body = normalizeBody(req.body);
    try {
      const current = await pool.query(`SELECT mu.*, eq.active_flag AS machine_active, eq.planning_resource_flag AS machine_planning_resource FROM md_machine_unit mu JOIN md_equipment eq ON eq.master_id = mu.machine_id WHERE mu.machine_unit_id = $1`, [req.params['id']]);
      if (!current.rows[0]) return res.status(404).json({ error: 'MACHINE_UNIT_NOT_FOUND' });
      const allowed = ['code', 'serial_number', 'execution_status', 'active_flag', 'lifecycle_status'];
      const updates = allowed.filter((column) => body[column] !== undefined);
      if (body.serial_number !== undefined && !String(body.serial_number).trim()) return res.status(422).json({ error: 'MACHINE_UNIT_IDENTITY_REQUIRED' });
      if (body.execution_status && !['Available','Maintenance','OutOfService'].includes(String(body.execution_status))) return res.status(422).json({ error: 'MACHINE_UNIT_STATUS_INVALID' });
      if (body.lifecycle_status && !['Draft','Released','Inactive','Obsolete'].includes(String(body.lifecycle_status))) return res.status(422).json({ error: 'MACHINE_UNIT_LIFECYCLE_INVALID' });
      if (!updates.length) return res.status(400).json({ error: 'MACHINE_UNIT_NO_UPDATE' });
      if ((body.execution_status && body.execution_status !== 'Available') || body.active_flag === false || body.lifecycle_status === 'Inactive') {
        const activeAssignment = await pool.query(`SELECT 1 FROM md_resource_assignment WHERE machine_unit_id = $1 AND effective_from <= NOW() AND (effective_to IS NULL OR effective_to > NOW()) AND lifecycle_status NOT IN ('Inactive','Obsolete')`, [req.params['id']]);
        if (activeAssignment.rows[0]) return res.status(409).json({ error: 'MACHINE_UNIT_ACTIVE_ASSIGNMENT' });
      }
      const values = updates.map((column) => body[column]);
      const nextSerial = body.serial_number !== undefined ? String(body.serial_number).trim() : String(current.rows[0].serial_number || '').trim();
      const nextActive = body.active_flag !== undefined ? body.active_flag === true : current.rows[0].active_flag === true;
      const nextExecutionStatus = String(body.execution_status ?? current.rows[0].execution_status);
      const nextLifecycleStatus = String(body.lifecycle_status ?? current.rows[0].lifecycle_status);
      const nextPlanning = Boolean(nextSerial && nextActive && nextExecutionStatus === 'Available' && nextLifecycleStatus === 'Released' && current.rows[0].machine_active === true && current.rows[0].machine_planning_resource === true);
      const sets = updates.map((column, index) => `${column} = $${index + 1}`);
      sets.push(`physical_identity_status = $${updates.length + 1}`, `planning_resource_flag = $${updates.length + 2}`, 'updated_at = NOW()');
      const { rows } = await pool.query(`UPDATE md_machine_unit SET ${sets.join(', ')} WHERE machine_unit_id = $${updates.length + 3} RETURNING *`, [...values, nextSerial ? 'Identified' : 'PendingIdentification', nextPlanning, req.params['id']]);
      return res.json({ data: rows[0] });
    } catch (err: any) {
      if (err?.code === '23505') return res.status(409).json({ error: 'MACHINE_UNIT_IDENTITY_DUPLICATE', message: 'Unit code or serial number is already used.' });
      return next(err);
    }
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
        // Composition records describe the Work Center hierarchy only. The
        // Routing Operation owns the authoritative Operation -> Workstation
        // assignment, so composition must not require a legacy capability row.
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
        JOIN md_workstation ws
          ON ws.work_center_id = wc.master_id
         AND ws.active_flag = TRUE
         AND ws.lifecycle_status NOT IN ('Inactive', 'Obsolete')
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
      const effectiveFrom = new Date(String(body['effective_from'] || new Date().toISOString())).toISOString();
      const requirementType = body['requirement_type'] === 'Optional' ? 'Optional' : 'Required';
      const row = await client.query(`INSERT INTO md_resource_assignment (code, name, site_id, work_center_id, workstation_id, equipment_id, machine_group_id, machine_unit_id, assignment_type, assignment_role, requirement_type, sequence_no, scheduling_flag, oee_aggregation_flag, effective_from, effective_to, created_by) VALUES ($1,$2::jsonb,$3,$4,$5,$6,$7,$8,'MachineGroupMember',$9,$10,$11,TRUE,$12,$13,$14,$15) RETURNING *`, [`RA-${group.rows[0].code}-${Number(count.rows[0].count) + 1}`, JSON.stringify({ vi: 'Thành viên nhóm máy', en: 'Machine group member' }), group.rows[0].site_id, group.rows[0].work_center_id, group.rows[0].workstation_id, body['machine_id'], req.params['groupId'], unit.machine_unit_id, role, requirementType, Number(count.rows[0].count) + 1, role === 'Primary' || requirementType !== 'Optional', effectiveFrom, group.rows[0].effective_to || null, context.userId]);
      await addMachineGroupRequirementForAssignment(client, group.rows[0], machine.rows[0], unit, role, requirementType, effectiveFrom, context);
      await client.query('COMMIT'); return res.status(201).json({ data: { ...row.rows[0], machine_unit_code: unit.code, machine_code: machine.rows[0].code, machine_name: machine.rows[0].name } });
    } catch (err) { await client.query('ROLLBACK'); return next(err); } finally { client.release(); }
  });

  router.post('/workstations/:id/machine-groups/:groupId/members/:memberId/end', async (req, res, next) => {
    const effectiveTo = new Date(String(req.body?.effective_to || new Date().toISOString())); const client = await pool.connect();
    try { await client.query('BEGIN'); const group = await client.query(`SELECT COUNT(*)::int AS count FROM md_resource_assignment WHERE machine_group_id = $1 AND effective_to IS NULL AND master_id <> $2`, [req.params['groupId'], req.params['memberId']]); if (Number(group.rows[0]?.count || 0) < 1) throw Object.assign(new Error('MACHINE_GROUP_MEMBER_REQUIRED'), { statusCode: 422 }); const current = await client.query(`SELECT * FROM md_resource_assignment WHERE master_id = $1 AND machine_group_id = $2 AND (effective_to IS NULL OR effective_to > $3) FOR UPDATE`, [req.params['memberId'], req.params['groupId'], effectiveTo.toISOString()]); if (!current.rows[0]) throw Object.assign(new Error('MACHINE_GROUP_MEMBER_NOT_FOUND'), { statusCode: 404 }); const row = await client.query(`UPDATE md_resource_assignment SET effective_to = $1, updated_at = NOW() WHERE master_id = $2 AND machine_group_id = $3 AND (effective_to IS NULL OR effective_to > $1) RETURNING *`, [effectiveTo.toISOString(), req.params['memberId'], req.params['groupId']]); if (!row.rows[0]) throw Object.assign(new Error('MACHINE_GROUP_MEMBER_NOT_FOUND'), { statusCode: 404 }); await endMachineGroupRequirementForAssignment(client, current.rows[0], effectiveTo.toISOString(), { userId: getContext(req).userId }); await client.query('COMMIT'); return res.json({ data: row.rows[0] }); }
    catch (err) { await client.query('ROLLBACK'); return next(err); } finally { client.release(); }
  });

  router.post('/workstations/:id/machine-groups/:groupId/replace-primary', async (req, res, next) => {
    const context = getContext(req); const body = normalizeBody(req.body); const client = await pool.connect();
    try { await client.query('BEGIN'); const current = await client.query(`SELECT * FROM md_resource_assignment WHERE machine_group_id = $1 AND assignment_role = 'Primary' AND effective_to IS NULL FOR UPDATE`, [req.params['groupId']]); if (!current.rows[0]) throw Object.assign(new Error('MACHINE_GROUP_NO_PRIMARY'), { statusCode: 422 }); const end = new Date(String(body['effective_from'] || new Date().toISOString())); const group = await client.query(`SELECT * FROM md_workstation_machine_group WHERE master_id = $1 AND workstation_id = $2 AND lifecycle_status NOT IN ('Inactive','Obsolete')`, [req.params['groupId'], req.params['id']]); if (!group.rows[0]) throw Object.assign(new Error('MACHINE_GROUP_NOT_FOUND'), { statusCode: 404 }); if (!body['machine_id']) throw Object.assign(new Error('MACHINE_GROUP_MACHINE_REQUIRED'), { statusCode: 422 }); const machine = await client.query(`SELECT master_id, code, name, site_id, active_flag, execution_status FROM md_equipment WHERE master_id = $1 FOR UPDATE`, [body['machine_id']]); if (!machine.rows[0] || machine.rows[0].site_id !== group.rows[0].site_id || machine.rows[0].active_flag !== true || machine.rows[0].execution_status !== 'Available') throw Object.assign(new Error('MACHINE_HIERARCHY_OR_STATUS_INVALID'), { statusCode: 422 }); const unit = await resolveMachineUnit(client, String(body['machine_id']), body['machine_unit_id'] as string | undefined); await client.query(`UPDATE md_resource_assignment SET effective_to = $1 WHERE master_id = $2`, [end.toISOString(), current.rows[0].master_id]); await endMachineGroupRequirementForAssignment(client, current.rows[0], end.toISOString(), context); const next = await client.query(`INSERT INTO md_resource_assignment (code, name, site_id, work_center_id, workstation_id, equipment_id, machine_group_id, machine_unit_id, assignment_type, assignment_role, requirement_type, sequence_no, scheduling_flag, oee_aggregation_flag, effective_from, created_by) VALUES ($1,$2::jsonb,$3,$4,$5,$6,$7,$8,'MachineGroupMember','Primary','Required',1,TRUE,TRUE,$9,$10) RETURNING *`, [`RA-${group.rows[0].code}-${Date.now()}`, JSON.stringify({ vi: 'Thay máy chính', en: 'Replace primary machine', ja: '主機械を交換', ko: '주 머신 교체' }), group.rows[0].site_id, group.rows[0].work_center_id, group.rows[0].workstation_id, machine.rows[0].master_id, group.rows[0].master_id, unit.machine_unit_id, end.toISOString(), context.userId]); await addMachineGroupRequirementForAssignment(client, group.rows[0], machine.rows[0], unit, 'Primary', 'Required', end.toISOString(), context); await client.query('COMMIT'); return res.status(201).json({ data: { ...next.rows[0], machine_code: machine.rows[0].code, machine_name: machine.rows[0].name, machine_unit_code: unit.code }, replaced_member_id: current.rows[0].master_id }); }
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
      const workstation = await client.query(`SELECT master_id, site_id, work_center_id, active_flag FROM md_workstation WHERE master_id = $1 FOR UPDATE`, [body['workstation_id']]);
      if (!workstation.rows[0] || workstation.rows[0].active_flag !== true) throw Object.assign(new Error('RESOURCE_ASSIGNMENT_WORKSTATION_MISMATCH'), { statusCode: 422 });
      if (String(body['site_id']) !== String(workstation.rows[0].site_id) || String(body['work_center_id']) !== String(workstation.rows[0].work_center_id)) throw Object.assign(new Error('RESOURCE_ASSIGNMENT_WORKSTATION_MISMATCH'), { statusCode: 422 });
      if (body['machine_group_id']) {
        const group = await client.query(`SELECT master_id, workstation_id, site_id, work_center_id, lifecycle_status FROM md_workstation_machine_group WHERE master_id = $1 FOR UPDATE`, [body['machine_group_id']]);
        if (!group.rows[0] || String(group.rows[0].workstation_id) !== String(body['workstation_id']) || String(group.rows[0].site_id) !== String(body['site_id']) || String(group.rows[0].work_center_id) !== String(body['work_center_id']) || ['Inactive', 'Obsolete'].includes(String(group.rows[0].lifecycle_status))) throw Object.assign(new Error('RESOURCE_ASSIGNMENT_WORKSTATION_MISMATCH'), { statusCode: 422 });
      }
      if (body['equipment_id']) {
        const equipment = await client.query(`SELECT master_id, site_id, active_flag, execution_status FROM md_equipment WHERE master_id = $1 FOR UPDATE`, [body['equipment_id']]);
        if (!equipment.rows[0] || String(equipment.rows[0].site_id) !== String(body['site_id']) || equipment.rows[0].active_flag !== true || equipment.rows[0].execution_status === 'OutOfService') throw Object.assign(new Error('RESOURCE_ASSIGNMENT_EQUIPMENT_INVALID'), { statusCode: 422 });
        if (body['machine_unit_id']) {
          const unit = await client.query(`SELECT machine_unit_id, machine_id, active_flag, execution_status FROM md_machine_unit WHERE machine_unit_id = $1 FOR UPDATE`, [body['machine_unit_id']]);
          if (!unit.rows[0] || String(unit.rows[0].machine_id) !== String(body['equipment_id']) || unit.rows[0].active_flag !== true || unit.rows[0].execution_status !== 'Available') throw Object.assign(new Error('RESOURCE_ASSIGNMENT_MACHINE_UNIT_INVALID'), { statusCode: 422 });
        }
      } else if (body['machine_unit_id']) {
        throw Object.assign(new Error('RESOURCE_ASSIGNMENT_MACHINE_UNIT_INVALID'), { statusCode: 422 });
      }
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
      const nextWorkstationId = body['workstation_id'] || current['workstation_id'];
      const nextWorkCenterId = body['work_center_id'] || current['work_center_id'];
      const nextSiteId = body['site_id'] || current['site_id'];
      const nextEquipmentId = body['equipment_id'] === undefined ? current['equipment_id'] : (body['equipment_id'] || null);
      const workstation = await client.query(`SELECT site_id, work_center_id, active_flag FROM md_workstation WHERE master_id = $1 FOR UPDATE`, [nextWorkstationId]);
      if (!workstation.rows[0] || workstation.rows[0].active_flag !== true || String(workstation.rows[0].site_id) !== String(nextSiteId) || String(workstation.rows[0].work_center_id) !== String(nextWorkCenterId)) throw Object.assign(new Error('RESOURCE_ASSIGNMENT_WORKSTATION_MISMATCH'), { statusCode: 422 });
      if (nextEquipmentId) {
        const equipment = await client.query(`SELECT site_id, active_flag, execution_status FROM md_equipment WHERE master_id = $1 FOR UPDATE`, [nextEquipmentId]);
        if (!equipment.rows[0] || String(equipment.rows[0].site_id) !== String(nextSiteId) || equipment.rows[0].active_flag !== true || equipment.rows[0].execution_status === 'OutOfService') throw Object.assign(new Error('RESOURCE_ASSIGNMENT_EQUIPMENT_INVALID'), { statusCode: 422 });
      }
      if (current['machine_unit_id']) {
        const unit = await client.query(`SELECT machine_id, active_flag, execution_status FROM md_machine_unit WHERE machine_unit_id = $1 FOR UPDATE`, [current['machine_unit_id']]);
        if (!unit.rows[0] || String(unit.rows[0].machine_id) !== String(nextEquipmentId) || unit.rows[0].active_flag !== true || unit.rows[0].execution_status !== 'Available') throw Object.assign(new Error('RESOURCE_ASSIGNMENT_MACHINE_UNIT_INVALID'), { statusCode: 422 });
      }
      const closed = await client.query('UPDATE md_resource_assignment SET effective_to = $1 WHERE master_id = $2 RETURNING *', [effectiveFrom.toISOString(), current['master_id']]);
      const next = await client.query(`
        INSERT INTO md_resource_assignment
          (code, name, site_id, work_center_id, workstation_id, equipment_id, machine_group_id, machine_unit_id,
           assignment_type, assignment_role, requirement_type, sequence_no, scheduling_flag, oee_aggregation_flag, effective_from, effective_to, created_by)
        VALUES ($1, $2::jsonb, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        RETURNING *`, [
        body['code'] || `MOVE-${String(current['code']).slice(0, 24)}-${effectiveFrom.getTime()}`,
        JSON.stringify(body['name'] || current['name']), nextSiteId, nextWorkCenterId, nextWorkstationId, nextEquipmentId,
        current['machine_group_id'], current['machine_unit_id'], current['assignment_type'], current['assignment_role'], current['requirement_type'], current['sequence_no'], current['scheduling_flag'], current['oee_aggregation_flag'],
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
      const [workstations, assignments, capabilities, calendars, productionStandards, lineMemberships] = await Promise.all([
        pool.query(`SELECT ws.*, a.code AS area_code, a.name AS area_name FROM md_workstation ws LEFT JOIN md_production_area a ON a.master_id = ws.area_id WHERE ws.work_center_id = $1 ORDER BY ws.code`, [req.params['id']]),
        pool.query(`SELECT ra.*, ws.code AS workstation_code, ws.name AS workstation_name, eq.code AS equipment_code, eq.name AS equipment_name FROM md_resource_assignment ra LEFT JOIN md_workstation ws ON ws.master_id = ra.workstation_id LEFT JOIN md_equipment eq ON eq.master_id = ra.equipment_id WHERE ra.work_center_id = $1 ORDER BY ra.effective_from DESC`, [req.params['id']]),
        pool.query(`SELECT rc.*, op.code AS operation_code, op.name AS operation_name, eq.code AS equipment_code, eq.name AS equipment_name FROM md_resource_capability rc JOIN md_operation op ON op.master_id = rc.operation_id LEFT JOIN md_equipment eq ON eq.master_id = rc.equipment_id WHERE rc.work_center_id = $1 ORDER BY rc.active_flag DESC, op.code, eq.code NULLS FIRST`, [req.params['id']]),
        pool.query(`SELECT cal.*, sh.code AS shift_code, sh.name AS shift_name FROM md_resource_calendar cal LEFT JOIN md_shift sh ON sh.master_id = cal.shift_id WHERE cal.resource_type = 'WorkCenter' AND cal.resource_id = $1 ORDER BY cal.calendar_date DESC, sh.code`, [req.params['id']]),
        pool.query(`SELECT ps.*, ro.seq AS routing_seq, op.code AS operation_code, op.name AS operation_name, eq.code AS equipment_code, eq.name AS equipment_name FROM md_production_standard ps LEFT JOIN md_routing_operation ro ON ro.master_id = ps.routing_operation_id LEFT JOIN md_operation op ON op.master_id = COALESCE(ps.operation_id, ro.operation_id) LEFT JOIN md_equipment eq ON eq.master_id = ps.equipment_id WHERE ps.work_center_id = $1 ORDER BY ps.active_flag DESC, ps.valid_from DESC NULLS LAST, op.code`, [req.params['id']]),
        pool.query(`SELECT lwc.*, pl.code AS production_line_code, pl.name AS production_line_name FROM md_production_line_work_center lwc JOIN md_production_line pl ON pl.master_id = lwc.production_line_id WHERE lwc.work_center_id = $1 ORDER BY lwc.active_flag DESC, lwc.sequence_no, pl.code`, [req.params['id']]),
      ]);
      return res.json({ data: { ...detail.rows[0], workstations: workstations.rows, assignments: assignments.rows, operation_capabilities: capabilities.rows, calendars: calendars.rows, production_standards: productionStandards.rows, line_memberships: lineMemberships.rows } });
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
               COUNT(mu.machine_unit_id) FILTER (WHERE mu.active_flag = TRUE AND mu.execution_status = 'Available' AND mu.physical_identity_status = 'Identified' AND mu.planning_resource_flag = TRUE
                 AND NOT EXISTS (
                   SELECT 1 FROM md_resource_assignment ra
                   WHERE ra.machine_unit_id = mu.machine_unit_id
                     AND ra.assignment_role = 'Primary'
                     AND ra.workstation_id IS DISTINCT FROM $3::uuid
                     AND ra.effective_from < $2::timestamptz
                     AND $1::timestamptz < COALESCE(ra.effective_to, 'infinity'::timestamptz)
                 )) AS available_unit_count,
               COALESCE(jsonb_agg(jsonb_build_object('machine_unit_id', mu.machine_unit_id, 'code', mu.code, 'execution_status', mu.execution_status, 'serial_number', mu.serial_number)) FILTER (WHERE mu.active_flag = TRUE AND mu.execution_status = 'Available' AND mu.physical_identity_status = 'Identified' AND mu.planning_resource_flag = TRUE
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
      const [capabilities, calendars, productionStandards] = await Promise.all([
        pool.query(`SELECT rc.*, op.code AS operation_code, op.name AS operation_name, eq.code AS equipment_code, eq.name AS equipment_name FROM md_resource_capability rc JOIN md_operation op ON op.master_id = rc.operation_id LEFT JOIN md_equipment eq ON eq.master_id = rc.equipment_id WHERE rc.work_center_id = $1 AND (rc.equipment_id IS NULL OR rc.equipment_id IN (SELECT equipment_id FROM md_resource_assignment WHERE workstation_id = $2 AND equipment_id IS NOT NULL)) ORDER BY rc.active_flag DESC, op.code, eq.code NULLS FIRST`, [detail.rows[0].work_center_id, req.params['id']]),
        pool.query(`SELECT cal.*, sh.code AS shift_code, sh.name AS shift_name FROM md_resource_calendar cal LEFT JOIN md_shift sh ON sh.master_id = cal.shift_id WHERE (cal.resource_type = 'Workstation' AND cal.resource_id = $1) OR (cal.resource_type = 'WorkCenter' AND cal.resource_id = $2) ORDER BY cal.calendar_date DESC, sh.code`, [req.params['id'], detail.rows[0].work_center_id]),
        pool.query(`SELECT ps.*, ro.seq AS routing_seq, op.code AS operation_code, op.name AS operation_name, eq.code AS equipment_code, eq.name AS equipment_name FROM md_production_standard ps LEFT JOIN md_routing_operation ro ON ro.master_id = ps.routing_operation_id LEFT JOIN md_operation op ON op.master_id = COALESCE(ps.operation_id, ro.operation_id) LEFT JOIN md_equipment eq ON eq.master_id = ps.equipment_id WHERE ps.work_center_id = $1 ORDER BY ps.active_flag DESC, ps.valid_from DESC NULLS LAST, op.code`, [detail.rows[0].work_center_id]),
      ]);
      const printStationIntegration = await pool.query(`SELECT b.binding_id, b.allocated_printer_quantity, ps.master_id AS print_station_id, ps.code AS print_station_code, ps.name AS print_station_name, ps.status AS lifecycle_status,
        rt.adapter_id, rt.runtime_status, rt.kafka_status, rt.registered_printer_count, rt.ready_printer_count, rt.active_for_work_printer_count, rt.last_heartbeat_at, rt.last_error,
        COALESCE(rt.printer_snapshot, '[]'::jsonb) AS printers,
        CASE WHEN rt.active_for_work_printer_count IS NULL AND ps.configured_allocation_limit IS NULL THEN NULL ELSE LEAST(COALESCE(ps.configured_allocation_limit, rt.active_for_work_printer_count), COALESCE(rt.active_for_work_printer_count, ps.configured_allocation_limit)) END AS effective_allocation_capacity,
        (SELECT COALESCE(SUM(other.allocated_printer_quantity), 0)::INT FROM md_workstation_print_station_binding other WHERE other.print_station_id = ps.master_id AND other.is_active = TRUE AND other.effective_to IS NULL) AS total_allocated_quantity
        FROM md_workstation_print_station_binding b JOIN md_print_station ps ON ps.master_id = b.print_station_id LEFT JOIN md_print_station_runtime_projection rt ON rt.print_station_id = ps.master_id
        WHERE b.workstation_id = $1 AND b.is_active = TRUE AND b.effective_to IS NULL LIMIT 1`, [req.params['id']]);
      for (const group of groups.rows) {
        group.members = assignments.rows.filter((assignment) => assignment.machine_group_id === group.master_id);
        const requirements = await pool.query(`SELECT r.*, eq.code AS machine_code, eq.name AS machine_name FROM md_workstation_machine_requirement r JOIN md_equipment eq ON eq.master_id = r.machine_id WHERE r.machine_group_id = $1 ORDER BY r.sequence_no`, [group.master_id]);
        group.requirements = requirements.rows;
      }
      return res.json({ data: { ...detail.rows[0], assignments: assignments.rows, machine_groups: groups.rows, operation_capabilities: capabilities.rows, calendars: calendars.rows, production_standards: productionStandards.rows, print_station_integration: printStationIntegration.rows[0] ?? null } });
    } catch (err) { return next(err); }
  });

  router.get(['/equipment/:id', '/machines/:id'], async (req, res, next) => {
    try {
      const detail = await pool.query(`SELECT eq.*, s.code AS site_code, s.name AS site_name, wc.code AS work_center_code, wc.name AS work_center_name FROM md_equipment eq JOIN md_site s ON s.master_id = eq.site_id LEFT JOIN md_work_center wc ON wc.master_id = eq.work_center_id WHERE eq.master_id = $1`, [req.params['id']]);
      if (!detail.rows[0]) return res.status(404).json({ error: 'Not Found' });
      const assignments = await pool.query(`SELECT ra.*, wc.code AS work_center_code, wc.name AS work_center_name, ws.code AS workstation_code, ws.name AS workstation_name, mg.code AS machine_group_code, mu.code AS machine_unit_code FROM md_resource_assignment ra JOIN md_work_center wc ON wc.master_id = ra.work_center_id LEFT JOIN md_workstation ws ON ws.master_id = ra.workstation_id LEFT JOIN md_workstation_machine_group mg ON mg.master_id = ra.machine_group_id LEFT JOIN md_machine_unit mu ON mu.machine_unit_id = ra.machine_unit_id WHERE ra.equipment_id = $1 ORDER BY ra.effective_from DESC`, [req.params['id']]);
      const units = await pool.query(`SELECT * FROM md_machine_unit WHERE machine_id = $1 ORDER BY unit_sequence`, [req.params['id']]);
      const skills = await pool.query(`SELECT rsa.assignment_id, rsa.minimum_level, rsa.required_flag, rsa.effective_from, rsa.effective_to, s.code AS skill_code, s.name AS skill_name, s.scope AS skill_scope FROM md_resource_skill_assignment rsa JOIN md_skill s ON s.master_id = rsa.skill_id WHERE rsa.resource_type = 'Machine' AND rsa.resource_id = $1 AND rsa.active_flag = TRUE AND rsa.effective_to IS NULL ORDER BY s.code`, [req.params['id']]);
      const capabilities = await pool.query(`SELECT rc.master_id AS capability_id, rc.code, rc.operation_id, op.code AS operation_code, op.name AS operation_name,
          rc.product_revision_id, r.revision_code, i.code AS item_code, i.name AS item_name, rc.item_group, rc.eligibility, rc.priority_no,
          rc.speed_factor, rc.min_lot_size, rc.max_lot_size, rc.effective_from, rc.effective_to
        FROM md_resource_capability rc LEFT JOIN md_operation op ON op.master_id = rc.operation_id
        LEFT JOIN md_item_revision r ON r.master_id = rc.product_revision_id LEFT JOIN md_item i ON i.master_id = r.item_id
        WHERE rc.equipment_id = $1 AND rc.active_flag = TRUE AND rc.effective_to IS NULL ORDER BY op.code, rc.priority_no`, [req.params['id']]);
      const calendars = await pool.query(`SELECT c.master_id AS calendar_id, c.calendar_date, c.shift_id, sh.code AS shift_code, sh.name AS shift_name,
          c.resource_type, c.availability_status, c.available_minutes, c.capacity_factor, c.available_from, c.available_to
        FROM md_resource_calendar c LEFT JOIN md_shift sh ON sh.master_id = c.shift_id
        WHERE c.equipment_id = $1 OR (c.resource_type = 'Equipment' AND c.resource_id = $1)
        ORDER BY c.calendar_date DESC NULLS LAST, c.available_from DESC LIMIT 50`, [req.params['id']]);
      const equipment = detail.rows[0];
      const availableUnitCount = units.rows.filter((unit) => unit.active_flag && unit.execution_status === 'Available').length;
      const activeAssignments = assignments.rows.filter((assignment) => assignment.active_flag !== false && (!assignment.effective_to || new Date(assignment.effective_to) > new Date()));
      const blockingErrors: Array<Record<string, any>> = [];
      const warnings: Array<Record<string, any>> = [];
      if (equipment.active_flag !== true) blockingErrors.push({ code: 'EQUIPMENT_INACTIVE' });
      if (equipment.execution_status === 'OutOfService') blockingErrors.push({ code: 'EQUIPMENT_OUT_OF_SERVICE' });
      if (equipment.planning_resource_flag !== true) warnings.push({ code: 'EQUIPMENT_NOT_PLANNING_RESOURCE' });
      if (!availableUnitCount) blockingErrors.push({ code: 'EQUIPMENT_MACHINE_UNIT_UNAVAILABLE' });
      if (!activeAssignments.length) warnings.push({ code: 'EQUIPMENT_ASSIGNMENT_INVALID' });
      return res.json({ data: { ...equipment, assignments: assignments.rows, units: units.rows, skills: skills.rows, capabilities: capabilities.rows, calendars: calendars.rows, available_unit_count: availableUnitCount, readiness: {
        status: blockingErrors.length ? 'Blocked' : 'Unknown', evaluated_at: new Date().toISOString(),
        equipment: { id: equipment.master_id, code: equipment.code, name: equipment.name, lifecycle_status: equipment.lifecycle_status, active_flag: equipment.active_flag, execution_status: equipment.execution_status, planning_resource_flag: equipment.planning_resource_flag },
        machine_unit: { status: availableUnitCount > 0 ? 'Available' : 'Unavailable', available: availableUnitCount, total: units.rows.length },
        assignment: { status: activeAssignments.length ? 'Valid' : 'Unknown', active_count: activeAssignments.length },
        capability: { status: capabilities.rows.length ? 'Configured' : 'Unknown', count: capabilities.rows.length },
        calendar: { status: calendars.rows.length ? 'Configured' : 'Unknown', count: calendars.rows.length },
        capacity: { status: 'Unknown', reason: 'Capacity reservations are owned by MES Execution and require a Work Order context.' },
        maintenance: { status: 'Unknown', reason: 'No authoritative CMMS maintenance projection is configured.' }, calibration: { status: 'Unknown', reason: 'No authoritative calibration projection is configured.' },
        operational_state: { status: equipment.execution_status || 'Unknown', state_source: 'md_equipment', observed_at: equipment.updated_at || null, freshness: 'Unknown' },
        blocking_errors: blockingErrors, warnings: [...warnings, { code: 'EQUIPMENT_READINESS_UNKNOWN' }, { code: 'EQUIPMENT_STATE_STALE' }],
      } } });
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
      const workerResult = await evaluateWorkerReadiness(pool, { operationId: context.operation_id, routingOperationId, siteId, workCenterId, shiftId, plannedDate });
      const assignments = await pool.query(`
        SELECT ra.master_id AS assignment_id, ra.assignment_role, ra.effective_from, ra.effective_to,
               ws.master_id AS workstation_id, ws.code AS workstation_code, ws.name AS workstation_name, ws.active_flag AS workstation_active,
               eq.master_id AS equipment_id, eq.code AS equipment_code, eq.name AS equipment_name, eq.active_flag AS equipment_active,
               eq.lifecycle_status AS equipment_lifecycle_status, eq.site_id AS equipment_site_id, eq.work_center_id AS equipment_work_center_id,
               eq.execution_status, eq.planning_resource_flag, eq.default_efficiency,
               COUNT(mu.machine_unit_id) FILTER (WHERE mu.active_flag = TRUE AND mu.execution_status = 'Available' AND mu.physical_identity_status = 'Identified' AND mu.planning_resource_flag = TRUE)::INT AS available_unit_count,
               COUNT(mu.machine_unit_id)::INT AS machine_unit_count
        FROM md_resource_assignment ra
        JOIN md_workstation ws ON ws.master_id = ra.workstation_id
        LEFT JOIN md_equipment eq ON eq.master_id = ra.equipment_id
        LEFT JOIN md_machine_unit mu ON mu.machine_id = eq.master_id
        WHERE ra.site_id = $1 AND ra.work_center_id = $2 AND ra.scheduling_flag = TRUE
          AND ra.lifecycle_status NOT IN ('Inactive','Obsolete')
          AND ra.machine_group_id IS NULL
          AND ra.effective_from < ($3::date + INTERVAL '1 day') AND (ra.effective_to IS NULL OR ra.effective_to > $3::date)
        GROUP BY ra.master_id, ra.assignment_role, ra.effective_from, ra.effective_to, ws.master_id, ws.code, ws.name, ws.active_flag,
          eq.master_id, eq.code, eq.name, eq.active_flag, eq.lifecycle_status, eq.site_id, eq.work_center_id, eq.execution_status, eq.planning_resource_flag, eq.default_efficiency
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
        if (assignment.equipment_id) {
          candidateWarnings.push({ code: 'EQUIPMENT_MAINTENANCE_STATE_UNKNOWN' }, { code: 'EQUIPMENT_CALIBRATION_STATE_UNKNOWN' }, { code: 'EQUIPMENT_STATE_STALE' });
        }
        if (!capability) candidateErrors.push({ code: 'NO_EFFECTIVE_CAPABILITY' });
        else if (!capability.eligibility) candidateErrors.push({ code: 'CAPABILITY_EXPLICIT_DENY' });
        else {
          if (capability.min_lot_size !== null && quantity < Number(capability.min_lot_size)) candidateErrors.push({ code: 'LOT_SIZE_BELOW_MINIMUM', min_lot_size: capability.min_lot_size });
          if (capability.max_lot_size !== null && quantity > Number(capability.max_lot_size)) candidateErrors.push({ code: 'LOT_SIZE_ABOVE_MAXIMUM', max_lot_size: capability.max_lot_size });
        }
        if (!assignment.workstation_active) candidateErrors.push({ code: 'WORKSTATION_INACTIVE' });
        if (assignment.equipment_id && assignment.equipment_site_id !== siteId) candidateErrors.push({ code: 'EQUIPMENT_ASSIGNMENT_INVALID', reason: 'Equipment site does not match the planning site.' });
        if (assignment.equipment_id && assignment.equipment_work_center_id && assignment.equipment_work_center_id !== workCenterId) candidateErrors.push({ code: 'EQUIPMENT_ASSIGNMENT_INVALID', reason: 'Equipment Work Center does not match the planning Work Center.' });
        if (assignment.equipment_id && ['Inactive', 'Obsolete'].includes(assignment.equipment_lifecycle_status)) candidateErrors.push({ code: 'EQUIPMENT_INACTIVE' });
        if (assignment.equipment_id && (!assignment.equipment_active || assignment.execution_status !== 'Available')) candidateErrors.push({ code: assignment.execution_status === 'OutOfService' ? 'EQUIPMENT_OUT_OF_SERVICE' : 'EQUIPMENT_NOT_AVAILABLE' });
        if (assignment.equipment_id && Number(assignment.available_unit_count || 0) < 1) candidateErrors.push({ code: 'EQUIPMENT_MACHINE_UNIT_UNAVAILABLE', available: Number(assignment.available_unit_count || 0), total: Number(assignment.machine_unit_count || 0) });
        if (assignment.equipment_id && !assignment.planning_resource_flag) candidateErrors.push({ code: 'EQUIPMENT_NOT_PLANNING_RESOURCE' });
        const resourceCalendar = await pool.query(`
          SELECT c.* FROM md_resource_calendar c
          WHERE c.site_id = $1 AND c.calendar_date = $2::date AND c.shift_id = $3
            AND ((c.resource_type = 'Equipment' AND c.resource_id = $4)
              OR (c.resource_type = 'Workstation' AND c.resource_id = $5)
              OR (c.resource_type = 'WorkCenter' AND c.resource_id = $6))
          ORDER BY CASE c.resource_type WHEN 'Equipment' THEN 1 WHEN 'Workstation' THEN 2 ELSE 3 END LIMIT 1`, [siteId, plannedDate, shiftId, equipmentId, assignment.workstation_id, workCenterId]);
        const calendar = resourceCalendar.rows[0] as Record<string, any> | undefined;
        if (!calendar) candidateErrors.push({ code: 'CALENDAR_NOT_CONFIGURED', message: 'No effective resource calendar exists for the requested date and shift.' });
        else if (calendar.availability_status !== 'Available' || Number(calendar.available_minutes) <= 0 || Number(calendar.capacity_factor) <= 0) candidateErrors.push({ code: calendar.availability_status === 'Holiday' ? 'CALENDAR_HOLIDAY' : calendar.availability_status === 'PlannedDown' ? 'RESOURCE_PLANNED_DOWN' : 'CALENDAR_UNAVAILABLE' });
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
        const calendarMinutes = calendar ? Number(calendar.available_minutes) : 0;
        const calendarFactor = calendar ? Number(calendar.capacity_factor) : 0;
        const standardEfficiency = standard ? Number(standard.efficiency_factor || 1) : 1;
        const capabilitySpeed = capability ? Number(capability.speed_factor || 1) : 1;
        const equipmentEfficiency = Number(assignment.default_efficiency || 1);
        const baseQuantity = standard ? Number(standard.base_quantity || 1) : 1;
        const adjustedCycleTime = standard && calendarFactor > 0 ? Number(standard.cycle_time_sec) / capabilitySpeed / standardEfficiency / equipmentEfficiency / calendarFactor : null;
        const runDuration = adjustedCycleTime === null ? null : (quantity / baseQuantity) * adjustedCycleTime / 60;
        const estimatedDuration = runDuration === null ? null : Number((Number(standard?.setup_time_min || 0) + runDuration + Number(context.queue_time_min || 0) + Number(context.move_time_min || 0)).toFixed(3));
        if (estimatedDuration !== null && calendar && estimatedDuration > calendarMinutes) candidateErrors.push({ code: 'INSUFFICIENT_CAPACITY', available_minutes: calendarMinutes, required_minutes: estimatedDuration });
        candidates.push({
          workstation: { id: assignment.workstation_id, code: assignment.workstation_code, name: assignment.workstation_name },
          equipment: assignment.equipment_id ? { id: assignment.equipment_id, code: assignment.equipment_code, name: assignment.equipment_name, execution_status: assignment.execution_status } : null,
          assignment: { id: assignment.assignment_id, role: assignment.assignment_role },
          capability: capability ? { id: capability.master_id, code: capability.code, priority_no: capability.priority_no, speed_factor: capability.speed_factor, specificity: capability.equipment_id ? 'Equipment' : 'WorkCenter' } : null,
          calendar: calendar ? { id: calendar.master_id, resource_type: calendar.resource_type, resource_id: calendar.resource_id, source_type: calendar.resource_type, source_id: calendar.resource_id, availability_status: calendar.availability_status, available_minutes: calendar.available_minutes, capacity_factor: calendar.capacity_factor } : null,
          production_standard: standard ? { id: standard.master_id, code: standard.code, level: standard.equipment_id ? 'Equipment' : 'WorkCenter', base_quantity: standard.base_quantity, setup_time_min: standard.setup_time_min, cycle_time_sec: standard.cycle_time_sec, labor_count: standard.labor_count, efficiency_factor: standard.efficiency_factor } : null,
          skill_requirements: skillResult.rows,
          estimated_duration_min: estimatedDuration,
          calculation: { adjusted_cycle_time_sec: adjustedCycleTime, run_duration_min: runDuration, setup_time_min: Number(standard?.setup_time_min || 0), queue_time_min: Number(context.queue_time_min || 0), move_time_min: Number(context.move_time_min || 0), formula: 'setup + ((quantity / baseQuantity) * cycleSec / capabilitySpeed / standardEfficiency / equipmentEfficiency / calendarCapacityFactor) / 60 + queue + move' },
          readiness: candidateErrors.length ? 'Blocked' : candidateWarnings.length ? 'ReadyWithWarnings' : 'Ready',
          equipment_readiness: {
            status: candidateErrors.length ? 'Blocked' : 'ReadyWithWarnings', evaluated_at: new Date().toISOString(),
            equipment: assignment.equipment_id ? { id: assignment.equipment_id, code: assignment.equipment_code, name: assignment.equipment_name, lifecycle_status: assignment.equipment_lifecycle_status, execution_status: assignment.execution_status } : null,
            machine_unit: assignment.equipment_id ? { status: Number(assignment.available_unit_count || 0) > 0 ? 'Available' : 'Unavailable', available: Number(assignment.available_unit_count || 0), total: Number(assignment.machine_unit_count || 0) } : { status: 'NotApplicable' },
            assignment: { status: 'Valid', id: assignment.assignment_id, role: assignment.assignment_role }, capability: { status: capability ? (capability.eligibility ? 'Matched' : 'Denied') : 'Missing', id: capability?.master_id || null },
            calendar: { status: calendar && calendar.availability_status === 'Available' && Number(calendar.available_minutes) > 0 ? 'Available' : calendar ? 'Unavailable' : 'Missing', id: calendar?.master_id || null }, capacity: { status: 'PendingExecutionCheck' },
            maintenance: { status: 'Unknown' }, calibration: { status: 'Unknown' }, operational_state: { status: assignment.execution_status || 'Unknown', state_source: 'md_equipment', freshness: 'Unknown' },
            blocking_errors: candidateErrors, warnings: [...candidateWarnings, { code: 'EQUIPMENT_MAINTENANCE_STATE_UNKNOWN' }, { code: 'EQUIPMENT_CALIBRATION_STATE_UNKNOWN' }, { code: 'EQUIPMENT_STATE_STALE' }],
          },
          blocking_errors: candidateErrors,
          warnings: candidateWarnings,
        });
      }
      const groupRows = await pool.query(`SELECT mg.*, ws.code AS workstation_code, ws.name AS workstation_name FROM md_workstation_machine_group mg JOIN md_workstation ws ON ws.master_id = mg.workstation_id WHERE mg.site_id = $1 AND mg.work_center_id = $2 AND mg.lifecycle_status = 'Released' AND ws.lifecycle_status = 'Released' AND mg.effective_from < ($3::date + INTERVAL '1 day') AND (mg.effective_to IS NULL OR mg.effective_to > $3::date) ORDER BY mg.code`, [siteId, workCenterId, plannedDate]);
      for (const group of groupRows.rows as Array<Record<string, any>>) {
        const [memberRows, requirementRows] = await Promise.all([
          pool.query(`SELECT ra.master_id AS assignment_id, ra.assignment_role AS role, ra.requirement_type, ra.effective_from, ra.effective_to, eq.master_id AS machine_id, eq.code AS machine_code, eq.name AS machine_name, eq.active_flag AS machine_active, eq.lifecycle_status AS machine_lifecycle_status, eq.site_id AS machine_site_id, eq.work_center_id AS machine_work_center_id, eq.execution_status AS machine_execution_status, eq.planning_resource_flag, eq.default_efficiency, mu.machine_unit_id, mu.code AS machine_unit_code, mu.active_flag AS unit_active, mu.execution_status AS unit_execution_status, mu.physical_identity_status AS unit_physical_identity_status, mu.planning_resource_flag AS unit_planning_resource_flag FROM md_resource_assignment ra JOIN md_equipment eq ON eq.master_id = ra.equipment_id LEFT JOIN md_machine_unit mu ON mu.machine_unit_id = ra.machine_unit_id WHERE ra.machine_group_id = $1 AND ra.lifecycle_status NOT IN ('Inactive','Obsolete') AND ra.effective_from < ($2::date + INTERVAL '1 day') AND (ra.effective_to IS NULL OR ra.effective_to > $2::date) ORDER BY ra.sequence_no`, [group.master_id, plannedDate]),
          pool.query(`SELECT requirement_id, machine_id, role, required_quantity, requirement_type, pinned_machine_unit_ids FROM md_workstation_machine_requirement WHERE machine_group_id = $1 AND active_flag = TRUE AND effective_from < ($2::date + INTERVAL '1 day') AND (effective_to IS NULL OR effective_to > $2::date) ORDER BY sequence_no`, [group.master_id, plannedDate]),
        ]);
        const members = memberRows.rows as Array<Record<string, any>>;
        const requirements = requirementRows.rows as Array<Record<string, any>>;
        const primary = members.filter((member) => member.role === 'Primary');
        const candidateErrors: Array<Record<string, any>> = [];
        const candidateWarnings: Array<Record<string, any>> = [];
        candidateWarnings.push({ code: 'EQUIPMENT_MAINTENANCE_STATE_UNKNOWN' }, { code: 'EQUIPMENT_CALIBRATION_STATE_UNKNOWN' }, { code: 'EQUIPMENT_STATE_STALE' });
        if (!requirements.length) candidateErrors.push({ code: 'WORKSTATION_MACHINE_REQUIREMENT_UNSATISFIED', message: 'No active machine requirement is configured for this machine group.' });
        const assignedUnitIds = new Set<string>();
        for (const member of members) {
          if (member.machine_unit_id && assignedUnitIds.has(String(member.machine_unit_id))) candidateErrors.push({ code: 'MACHINE_UNIT_ALREADY_RESERVED', machine_unit_code: member.machine_unit_code });
          if (member.machine_unit_id) assignedUnitIds.add(String(member.machine_unit_id));
        }
        for (const requirement of requirements) {
          const matching = members.filter((member) => String(member.machine_id) === String(requirement.machine_id) && member.role === requirement.role);
          const requiredQuantity = Number(requirement.required_quantity || 1);
          if (matching.length < requiredQuantity) {
            const code = requirement.role === 'Primary' ? 'WORKSTATION_PRIMARY_MACHINE_MISSING' : requirement.requirement_type === 'Optional' ? 'WORKSTATION_SUPPORTING_MACHINE_MISSING' : 'WORKSTATION_MACHINE_QUANTITY_INSUFFICIENT';
            if (requirement.requirement_type === 'Optional' && requirement.role !== 'Primary') candidateWarnings.push({ code, machine_id: requirement.machine_id, required_quantity: requiredQuantity, assigned_quantity: matching.length });
            else candidateErrors.push({ code, machine_id: requirement.machine_id, required_quantity: requiredQuantity, assigned_quantity: matching.length });
          }
          const pinned = Array.isArray(requirement.pinned_machine_unit_ids) ? requirement.pinned_machine_unit_ids.map(String) : [];
          const assignedPinned = matching.map((member) => String(member.machine_unit_id || '')).filter(Boolean);
          const missingPinned = pinned.filter((unitId: string) => !assignedPinned.includes(unitId));
          if (missingPinned.length) candidateErrors.push({ code: 'MACHINE_UNIT_UNAVAILABLE', machine_id: requirement.machine_id, machine_unit_ids: missingPinned });
        }
        if (!members.length) candidateErrors.push({ code: 'MACHINE_GROUP_INSUFFICIENT_ACTIVE_MEMBERS' });
        if (primary.length === 0) candidateErrors.push({ code: 'MACHINE_GROUP_NO_PRIMARY' });
        if (primary.length > 1) candidateErrors.push({ code: 'MACHINE_GROUP_MULTIPLE_PRIMARY' });
        if (members.length < Number(group.minimum_required_machines || 1)) candidateErrors.push({ code: 'MACHINE_GROUP_INSUFFICIENT_ACTIVE_MEMBERS' });
        const primaryMember = primary[0];
        if (primaryMember && String(primaryMember.machine_site_id) !== String(siteId)) candidateErrors.push({ code: 'EQUIPMENT_ASSIGNMENT_INVALID', reason: 'Equipment site does not match the planning site.' });
        if (primaryMember && primaryMember.machine_work_center_id && String(primaryMember.machine_work_center_id) !== String(workCenterId)) candidateErrors.push({ code: 'EQUIPMENT_ASSIGNMENT_INVALID', reason: 'Equipment Work Center does not match the planning Work Center.' });
        if (primaryMember && ['Inactive', 'Obsolete'].includes(primaryMember.machine_lifecycle_status)) candidateErrors.push({ code: 'EQUIPMENT_INACTIVE' });
        if (primaryMember && !primaryMember.planning_resource_flag) candidateErrors.push({ code: 'EQUIPMENT_NOT_PLANNING_RESOURCE' });
        if (primaryMember && (!primaryMember.machine_unit_id || !primaryMember.unit_active || primaryMember.unit_execution_status !== 'Available' || primaryMember.unit_physical_identity_status !== 'Identified' || !primaryMember.unit_planning_resource_flag)) candidateErrors.push({ code: 'MACHINE_UNIT_UNAVAILABLE', machine_code: primaryMember.machine_code, machine_unit_code: primaryMember.machine_unit_code });
        if (primaryMember && (!primaryMember.machine_active || primaryMember.machine_execution_status !== 'Available')) candidateErrors.push({ code: primaryMember.machine_execution_status === 'OutOfService' ? 'EQUIPMENT_OUT_OF_SERVICE' : primaryMember.machine_execution_status === 'Maintenance' ? 'EQUIPMENT_UNDER_MAINTENANCE' : 'EQUIPMENT_NOT_AVAILABLE' });
        for (const member of members.filter((item) => item.role === 'Supporting')) {
          const invalidAssignment = String(member.machine_site_id) !== String(siteId) || (member.machine_work_center_id && String(member.machine_work_center_id) !== String(workCenterId));
          const unavailable = invalidAssignment || !member.machine_active || ['Inactive', 'Obsolete'].includes(member.machine_lifecycle_status) || member.machine_execution_status !== 'Available' || !member.planning_resource_flag || !member.machine_unit_id || !member.unit_active || member.unit_execution_status !== 'Available' || member.unit_physical_identity_status !== 'Identified' || !member.unit_planning_resource_flag;
          if (unavailable && member.requirement_type === 'Required') candidateErrors.push({ code: 'REQUIRED_SUPPORTING_MACHINE_UNAVAILABLE', machine_code: member.machine_code });
          if (unavailable && member.requirement_type === 'Optional') candidateWarnings.push({ code: 'OPTIONAL_SUPPORTING_MACHINE_UNAVAILABLE', machine_code: member.machine_code });
        }
        if (!primaryMember) {
          candidates.push({ workstation: { id: group.workstation_id, code: null, name: null }, machine_group: { id: group.master_id, code: group.code, name: group.name }, machine_requirements: requirements, primary_machine: null, supporting_machines: [], equipment: null, readiness: 'Blocked', blocking_errors: candidateErrors, warnings: candidateWarnings });
          continue;
        }
        const primaryId = primaryMember.machine_id;
        const capabilityResult = await pool.query(`SELECT rc.* FROM md_resource_capability rc WHERE rc.site_id = $1 AND rc.operation_id = $2 AND rc.active_flag = TRUE AND rc.effective_from < ($3::date + INTERVAL '1 day') AND (rc.effective_to IS NULL OR rc.effective_to > $3::date) AND (rc.product_revision_id = $4 OR (rc.product_revision_id IS NULL AND rc.item_group = $5)) AND (rc.equipment_id IS NULL OR rc.equipment_id = $6) ORDER BY CASE WHEN rc.product_revision_id = $4 AND rc.equipment_id = $6 THEN 1 WHEN rc.product_revision_id = $4 AND rc.equipment_id IS NULL THEN 2 ELSE 3 END, rc.priority_no LIMIT 1`, [siteId, context.operation_id, plannedDate, productRevisionId, context.item_group, primaryId]);
        const capability = capabilityResult.rows[0] as Record<string, any> | undefined;
        if (!capability) candidateErrors.push({ code: 'NO_EFFECTIVE_CAPABILITY' }); else if (!capability.eligibility) candidateErrors.push({ code: 'CAPABILITY_EXPLICIT_DENY' });
        const calendarResult = await pool.query(`SELECT c.* FROM md_resource_calendar c WHERE c.site_id = $1 AND c.calendar_date = $2::date AND c.shift_id = $3 AND ((c.resource_type = 'Equipment' AND c.resource_id = $4) OR (c.resource_type = 'Workstation' AND c.resource_id = $5) OR (c.resource_type = 'WorkCenter' AND c.resource_id = $6)) ORDER BY CASE c.resource_type WHEN 'Equipment' THEN 1 WHEN 'Workstation' THEN 2 ELSE 3 END LIMIT 1`, [siteId, plannedDate, shiftId, primaryId, group.workstation_id, workCenterId]);
        const calendar = calendarResult.rows[0] as Record<string, any> | undefined;
        if (!calendar) candidateErrors.push({ code: 'CALENDAR_NOT_CONFIGURED', message: 'No effective resource calendar exists for the requested date and shift.' }); else if (calendar.availability_status !== 'Available' || Number(calendar.available_minutes) <= 0 || Number(calendar.capacity_factor) <= 0) candidateErrors.push({ code: calendar.availability_status === 'Holiday' ? 'CALENDAR_HOLIDAY' : calendar.availability_status === 'PlannedDown' ? 'RESOURCE_PLANNED_DOWN' : 'CALENDAR_UNAVAILABLE' });
        for (const member of members.filter((item) => item.role === 'Supporting' && item.requirement_type === 'Required')) {
          const memberCalendar = await pool.query(`SELECT 1 FROM md_resource_calendar c WHERE c.site_id = $1 AND c.calendar_date = $2::date AND c.shift_id = $3 AND c.resource_type = 'Equipment' AND c.resource_id = $4 AND c.availability_status = 'Available' AND c.available_minutes > 0 AND c.capacity_factor > 0 LIMIT 1`, [siteId, plannedDate, shiftId, member.machine_id]);
          if (!memberCalendar.rows[0]) candidateErrors.push({ code: 'REQUIRED_SUPPORTING_MACHINE_UNAVAILABLE', machine_code: member.machine_code });
        }
        const standardResult = await pool.query(`SELECT ps.* FROM md_production_standard ps WHERE ps.site_id = $1 AND ps.item_revision_id = $2 AND ps.work_center_id = $3 AND (ps.routing_operation_id = $4 OR (ps.routing_operation_id IS NULL AND ps.operation_id = $5)) AND ps.lifecycle_status = 'Released' AND ps.valid_from <= ($6::date + INTERVAL '1 day') AND (ps.valid_to IS NULL OR ps.valid_to > $6::date) AND (ps.equipment_id IS NULL OR ps.equipment_id = $7) ORDER BY CASE WHEN ps.equipment_id = $7 THEN 1 ELSE 2 END, ps.valid_from DESC LIMIT 1`, [siteId, productRevisionId, workCenterId, routingOperationId, context.operation_id, plannedDate, primaryId]);
        const standard = standardResult.rows[0] as Record<string, any> | undefined;
        if (!standard) candidateErrors.push({ code: 'NO_EFFECTIVE_PRODUCTION_STANDARD' });
        const standardRow = standard || {};
        const calendarMinutes = calendar ? Number(calendar.available_minutes) : 0; const calendarFactor = calendar ? Number(calendar.capacity_factor) : 0; const adjustedCycleTime = standard && calendarFactor > 0 ? Number(standardRow.cycle_time_sec) / Number(capability?.speed_factor || 1) / Number(standardRow.efficiency_factor || 1) / Number(primaryMember.default_efficiency || 1) / calendarFactor : null; const runDuration = adjustedCycleTime === null ? null : (quantity / Number(standardRow.base_quantity || 1)) * adjustedCycleTime / 60; const estimatedDuration = runDuration === null ? null : Number((Number(standardRow.setup_time_min || 0) + runDuration + Number(context.queue_time_min || 0) + Number(context.move_time_min || 0)).toFixed(3));
        if (estimatedDuration !== null && calendar && estimatedDuration > calendarMinutes) candidateErrors.push({ code: 'INSUFFICIENT_CAPACITY', available_minutes: calendarMinutes, required_minutes: estimatedDuration });
        candidates.push({ workstation: { id: group.workstation_id, code: group.workstation_code, name: group.workstation_name }, machine_group: { id: group.master_id, code: group.code, name: group.name, minimum_required_machines: group.minimum_required_machines }, primary_machine: { id: primaryMember.machine_id, code: primaryMember.machine_code, name: primaryMember.machine_name, unit_id: primaryMember.machine_unit_id, unit_code: primaryMember.machine_unit_code }, supporting_machines: members.filter((member) => member.role === 'Supporting').map((member) => ({ id: member.machine_id, code: member.machine_code, name: member.machine_name, unit_id: member.machine_unit_id, unit_code: member.machine_unit_code, required: member.requirement_type === 'Required', readiness: member.machine_execution_status === 'Available' && member.unit_execution_status === 'Available' ? 'Available' : 'Unavailable' })), equipment: { id: primaryMember.machine_id, code: primaryMember.machine_code, name: primaryMember.machine_name, execution_status: primaryMember.machine_execution_status }, assignment: { id: primaryMember.assignment_id, role: 'Primary' }, capability: capability ? { id: capability.master_id, code: capability.code, priority_no: capability.priority_no, speed_factor: capability.speed_factor, specificity: capability.equipment_id ? 'Equipment' : 'WorkCenter' } : null, calendar: calendar ? { id: calendar.master_id, resource_type: calendar.resource_type, resource_id: calendar.resource_id, source_type: calendar.resource_type, source_id: calendar.resource_id, availability_status: calendar.availability_status, available_minutes: calendar.available_minutes, capacity_factor: calendar.capacity_factor } : null, production_standard: standard ? { id: standard.master_id, code: standard.code, level: standard.equipment_id ? 'Equipment' : 'WorkCenter' } : null, estimated_duration_min: estimatedDuration, calculation: { adjusted_cycle_time_sec: adjustedCycleTime, run_duration_min: runDuration, setup_time_min: Number(standard?.setup_time_min || 0), queue_time_min: Number(context.queue_time_min || 0), formula: 'group primary standard plus required supporting availability' }, readiness: candidateErrors.length ? 'Blocked' : candidateWarnings.length ? 'ReadyWithWarnings' : 'Ready', equipment_readiness: { status: candidateErrors.length ? 'Blocked' : 'ReadyWithWarnings', evaluated_at: new Date().toISOString(), equipment: { id: primaryMember.machine_id, code: primaryMember.machine_code, name: primaryMember.machine_name, execution_status: primaryMember.machine_execution_status }, machine_unit: { status: primaryMember.unit_execution_status === 'Available' ? 'Available' : 'Unavailable', unit_id: primaryMember.machine_unit_id, unit_code: primaryMember.machine_unit_code }, assignment: { status: 'Valid', id: primaryMember.assignment_id, role: 'Primary' }, capability: { status: capability ? (capability.eligibility ? 'Matched' : 'Denied') : 'Missing' }, calendar: { status: calendar?.availability_status === 'Available' ? 'Available' : calendar ? 'Unavailable' : 'Missing' }, capacity: { status: 'PendingExecutionCheck' }, maintenance: { status: 'Unknown' }, calibration: { status: 'Unknown' }, operational_state: { status: primaryMember.machine_execution_status || 'Unknown', state_source: 'md_equipment', freshness: 'Unknown' }, blocking_errors: candidateErrors, warnings: [...candidateWarnings, { code: 'EQUIPMENT_MAINTENANCE_STATE_UNKNOWN' }, { code: 'EQUIPMENT_CALIBRATION_STATE_UNKNOWN' }, { code: 'EQUIPMENT_STATE_STALE' }] }, blocking_errors: candidateErrors, warnings: candidateWarnings });
      }
      for (const candidate of candidates) {
        candidate.worker_readiness = workerResult.readiness;
        candidate.blocking_errors = [...(candidate.blocking_errors || []), ...workerResult.blockingErrors];
        if (workerResult.blockingErrors.length) candidate.readiness = 'Blocked';
      }
      candidates.sort((a, b) => {
        const readinessRank = (value: string) => value === 'Ready' || value === 'Eligible' ? 0 : value === 'ReadyWithWarnings' ? 1 : 2;
        return readinessRank(a.readiness) - readinessRank(b.readiness) || Number(a.capability?.priority_no || 999999) - Number(b.capability?.priority_no || 999999) || Number(b.capability?.speed_factor || 0) - Number(a.capability?.speed_factor || 0) || String(a.equipment?.code || a.workstation?.code || '').localeCompare(String(b.equipment?.code || b.workstation?.code || ''));
      });
      const eligible = candidates.filter((candidate) => candidate.readiness === 'Ready' || candidate.readiness === 'Eligible');
      const warningCandidates = candidates.filter((candidate) => candidate.readiness === 'ReadyWithWarnings');
      if (!assignments.rows.length && !groupRows.rows.length) blockingErrors.push({ code: 'NO_EFFECTIVE_ASSIGNMENT' });
      const status = blockingErrors.length || workerResult.blockingErrors.length || (!eligible.length && !warningCandidates.length) ? 'Blocked' : warningCandidates.length ? 'ReadyWithWarnings' : 'Ready';
      return res.json({ status, work_center: { id: context.work_center_id, code: context.work_center_code, name: context.work_center_name }, operation: { id: routingOperationId, code: context.operation_code, name: context.operation_name, sequence: context.seq }, worker_readiness: workerResult.readiness, candidates, blocking_errors: [...blockingErrors, ...workerResult.blockingErrors], warnings });
    } catch (err) { return next(err); }
  });

  // Print Stations are integration resources, not generic master rows. Keep
  // their lifecycle and binding validation explicit at this boundary.
  router.get('/print-stations', async (req, res, next) => {
    try {
      const values: unknown[] = [];
      const filters: string[] = [];
      if (typeof req.query['site_id'] === 'string' && req.query['site_id']) { values.push(req.query['site_id']); filters.push(`ps.site_id = $${values.length}`); }
      if (typeof req.query['status'] === 'string' && req.query['status']) { values.push(req.query['status'].toUpperCase()); filters.push(`ps.status = $${values.length}`); }
      const result = await pool.query(`
        SELECT ps.*, s.code AS site_code, s.name AS site_name, sf.code AS shopfloor_code, sf.name AS shopfloor_name,
               (SELECT COUNT(*)::INT FROM md_workstation_print_station_binding b WHERE b.print_station_id = ps.master_id AND b.is_active = TRUE AND b.effective_to IS NULL) AS active_binding_count,
               (SELECT COALESCE(SUM(b.allocated_printer_quantity), 0)::INT FROM md_workstation_print_station_binding b WHERE b.print_station_id = ps.master_id AND b.is_active = TRUE AND b.effective_to IS NULL) AS allocated_printer_quantity,
               rt.registered_printer_count, rt.active_for_work_printer_count, rt.ready_printer_count, rt.busy_printer_count, rt.offline_printer_count, rt.error_printer_count, rt.runtime_status, rt.kafka_status, rt.last_heartbeat_at,
               CASE WHEN rt.active_for_work_printer_count IS NULL AND ps.configured_allocation_limit IS NULL THEN NULL ELSE LEAST(COALESCE(ps.configured_allocation_limit, rt.active_for_work_printer_count), COALESCE(rt.active_for_work_printer_count, ps.configured_allocation_limit)) END AS effective_allocation_capacity,
               CASE WHEN rt.active_for_work_printer_count IS NULL AND ps.configured_allocation_limit IS NULL THEN NULL ELSE GREATEST(0, LEAST(COALESCE(ps.configured_allocation_limit, rt.active_for_work_printer_count), COALESCE(rt.active_for_work_printer_count, ps.configured_allocation_limit)) - (SELECT COALESCE(SUM(b2.allocated_printer_quantity), 0) FROM md_workstation_print_station_binding b2 WHERE b2.print_station_id = ps.master_id AND b2.is_active = TRUE AND b2.effective_to IS NULL)) END AS remaining_printer_quantity
        FROM md_print_station ps
        JOIN md_site s ON s.master_id = ps.site_id
        LEFT JOIN md_shopfloor sf ON sf.master_id = ps.shopfloor_id
        LEFT JOIN md_print_station_runtime_projection rt ON rt.print_station_id = ps.master_id
        ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
        ORDER BY ps.code`, values);
      for (const row of result.rows) row.allocation_deficit = row.effective_allocation_capacity == null ? null : Math.max(0, Number(row.allocated_printer_quantity || 0) - Number(row.effective_allocation_capacity));
      return res.json({ data: result.rows });
    } catch (err) { return next(err); }
  });

  router.post('/print-stations', async (req, res, next) => {
    const context = getContext(req);
    try {
      const body = req.body || {};
      const code = String(body.code || '').trim();
      if (!code) return res.status(422).json({ error: 'PRINT_STATION_CODE_REQUIRED' });
      const name = localizedTextSchema.safeParse(body.name);
      if (!name.success) return res.status(422).json({ error: 'PRINT_STATION_NAME_INVALID' });
      const mode = String(body.deployment_mode || 'PHYSICAL').toUpperCase();
      const status = String(body.status || 'PENDING').toUpperCase();
      if (!PRINT_STATION_MODES.has(mode)) return res.status(422).json({ error: 'PRINT_STATION_DEPLOYMENT_MODE_INVALID' });
      if (!PRINT_STATION_STATUSES.has(status)) return res.status(422).json({ error: 'PRINT_STATION_STATUS_INVALID' });
      const url = printStationUrl(body.gateway_base_url);
      const capabilities = printStationCapabilities(body.capabilities);
      const siteId = String(body.site_id || '');
      const shopfloorId = body.shopfloor_id ? String(body.shopfloor_id) : null;
      if (!siteId) return res.status(422).json({ error: 'PRINT_STATION_SITE_REQUIRED' });
      const site = await pool.query('SELECT master_id FROM md_site WHERE master_id = $1', [siteId]);
      if (!site.rows[0]) return res.status(422).json({ error: 'PRINT_STATION_SITE_NOT_FOUND' });
      if (shopfloorId) {
        const shopfloor = await pool.query('SELECT master_id FROM md_shopfloor WHERE master_id = $1 AND site_id = $2', [shopfloorId, siteId]);
        if (!shopfloor.rows[0]) return res.status(422).json({ error: 'PRINT_STATION_SHOPFLOOR_SITE_MISMATCH' });
      }
      const result = await pool.query(`INSERT INTO md_print_station (code, name, description, site_id, shopfloor_id, gateway_base_url, deployment_mode, status, capabilities, software_version, is_active, created_by, updated_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12) RETURNING *`, [code, name.data, body.description || null, siteId, shopfloorId, url, mode, status, JSON.stringify(capabilities), body.software_version || null, status !== 'DISABLED', context.userId]);
      return res.status(201).json({ data: result.rows[0] });
    } catch (err: any) {
      if (err?.code === '23505') return res.status(409).json({ error: 'PRINT_STATION_CODE_DUPLICATE' });
      return next(err);
    }
  });

  router.get('/print-stations/:id', async (req, res, next) => {
    try {
      const result = await pool.query(`SELECT ps.*, s.code AS site_code, s.name AS site_name, sf.code AS shopfloor_code, sf.name AS shopfloor_name,
        (SELECT COUNT(*)::INT FROM md_workstation_print_station_binding b WHERE b.print_station_id = ps.master_id AND b.is_active = TRUE AND b.effective_to IS NULL) AS active_binding_count,
        (SELECT COALESCE(SUM(b.allocated_printer_quantity), 0)::INT FROM md_workstation_print_station_binding b WHERE b.print_station_id = ps.master_id AND b.is_active = TRUE AND b.effective_to IS NULL) AS allocated_printer_quantity,
        rt.registered_printer_count, rt.active_for_work_printer_count, rt.ready_printer_count, rt.busy_printer_count, rt.offline_printer_count, rt.error_printer_count, rt.runtime_status, rt.kafka_status, rt.last_heartbeat_at,
        CASE WHEN rt.active_for_work_printer_count IS NULL AND ps.configured_allocation_limit IS NULL THEN NULL ELSE LEAST(COALESCE(ps.configured_allocation_limit, rt.active_for_work_printer_count), COALESCE(rt.active_for_work_printer_count, ps.configured_allocation_limit)) END AS effective_allocation_capacity,
        CASE WHEN rt.active_for_work_printer_count IS NULL AND ps.configured_allocation_limit IS NULL THEN NULL ELSE GREATEST(0, LEAST(COALESCE(ps.configured_allocation_limit, rt.active_for_work_printer_count), COALESCE(rt.active_for_work_printer_count, ps.configured_allocation_limit)) - (SELECT COALESCE(SUM(b2.allocated_printer_quantity), 0) FROM md_workstation_print_station_binding b2 WHERE b2.print_station_id = ps.master_id AND b2.is_active = TRUE AND b2.effective_to IS NULL)) END AS remaining_printer_quantity
        FROM md_print_station ps JOIN md_site s ON s.master_id = ps.site_id LEFT JOIN md_shopfloor sf ON sf.master_id = ps.shopfloor_id LEFT JOIN md_print_station_runtime_projection rt ON rt.print_station_id = ps.master_id WHERE ps.master_id = $1`, [req.params['id']]);
      if (!result.rows[0]) return res.status(404).json({ error: 'PRINT_STATION_NOT_FOUND' });
      const detail = result.rows[0];
      detail.allocation_deficit = detail.effective_allocation_capacity == null ? null : Math.max(0, Number(detail.allocated_printer_quantity || 0) - Number(detail.effective_allocation_capacity));
      return res.json({ data: detail });
    } catch (err) { return next(err); }
  });

  router.patch('/print-stations/:id', async (req, res, next) => {
    const context = getContext(req);
    try {
      const current = await pool.query('SELECT * FROM md_print_station WHERE master_id = $1 FOR UPDATE', [req.params['id']]);
      if (!current.rows[0]) return res.status(404).json({ error: 'PRINT_STATION_NOT_FOUND' });
      const body = req.body || {};
      const sets: string[] = [];
      const values: unknown[] = [];
      const add = (column: string, value: unknown) => { values.push(value); sets.push(`${column} = $${values.length}`); };
      if (body.name !== undefined) { const parsed = localizedTextSchema.safeParse(body.name); if (!parsed.success) return res.status(422).json({ error: 'PRINT_STATION_NAME_INVALID' }); add('name', parsed.data); }
      if (body.description !== undefined) add('description', body.description || null);
      if (body.gateway_base_url !== undefined) add('gateway_base_url', printStationUrl(body.gateway_base_url));
      if (body.capabilities !== undefined) add('capabilities', JSON.stringify(printStationCapabilities(body.capabilities)));
      if (body.deployment_mode !== undefined) { const mode = String(body.deployment_mode).toUpperCase(); if (!PRINT_STATION_MODES.has(mode)) return res.status(422).json({ error: 'PRINT_STATION_DEPLOYMENT_MODE_INVALID' }); add('deployment_mode', mode); }
      if (body.software_version !== undefined) add('software_version', body.software_version || null);
      if (body.status !== undefined) { const status = String(body.status).toUpperCase(); if (!PRINT_STATION_STATUSES.has(status)) return res.status(422).json({ error: 'PRINT_STATION_STATUS_INVALID' }); add('status', status); add('is_active', status !== 'DISABLED'); }
      if (!sets.length) return res.status(400).json({ error: 'PRINT_STATION_NO_UPDATE_FIELDS' });
      add('updated_by', context.userId);
      values.push(req.params['id']);
      const result = await pool.query(`UPDATE md_print_station SET ${sets.join(', ')}, updated_at = NOW() WHERE master_id = $${values.length} RETURNING *`, values);
      return res.json({ data: result.rows[0] });
    } catch (err) { return next(err); }
  });

  router.delete('/print-stations/:id', async (req, res, next) => {
    const context = getContext(req);
    try {
      const bindings = await pool.query(`SELECT 1 FROM md_workstation_print_station_binding WHERE print_station_id = $1 AND is_active = TRUE AND (effective_to IS NULL OR effective_to > NOW()) LIMIT 1`, [req.params['id']]);
      if (bindings.rows[0]) return res.status(409).json({ error: 'PRINT_STATION_HAS_ACTIVE_BINDINGS' });
      const result = await pool.query(`UPDATE md_print_station SET status = 'DISABLED', is_active = FALSE, updated_by = $2, updated_at = NOW() WHERE master_id = $1 RETURNING *`, [req.params['id'], context.userId]);
      if (!result.rows[0]) return res.status(404).json({ error: 'PRINT_STATION_NOT_FOUND' });
      return res.json({ data: result.rows[0] });
    } catch (err) { return next(err); }
  });

  router.post('/print-stations/:id/test-connection', async (req, res, next) => {
    const context = getContext(req);
    try {
      const station = await pool.query('SELECT * FROM md_print_station WHERE master_id = $1', [req.params['id']]);
      if (!station.rows[0]) return res.status(404).json({ error: 'PRINT_STATION_NOT_FOUND' });
      const row = station.rows[0];
      if (row.status === 'DISABLED') return res.status(409).json({ error: 'PRINT_STATION_DISABLED' });
      const checkedAt = new Date();
      let status = 'OFFLINE'; let healthError: string | null = null; let health: Record<string, any> = {};
      try {
        const response = await fetch(`${row.gateway_base_url}/health`, { signal: AbortSignal.timeout(4000) });
        health = (await response.json().catch(() => ({}))) as Record<string, any>;
        if (response.ok && String(health.status || '').toLowerCase() === 'healthy') status = 'ONLINE';
        else if (response.ok) status = 'DEGRADED';
        else healthError = `Station Gateway returned HTTP ${response.status}`;
      } catch (err: any) { healthError = err?.name === 'TimeoutError' ? 'Station Gateway health check timed out' : 'Station Gateway health check failed'; }
      const result = await pool.query(`UPDATE md_print_station SET status = $2::VARCHAR, last_health_check_at = $3::TIMESTAMPTZ, last_heartbeat_at = CASE WHEN $2::VARCHAR = 'ONLINE' THEN $3::TIMESTAMPTZ ELSE last_heartbeat_at END, last_health_error = $4::TEXT, software_version = COALESCE($5::VARCHAR, software_version), updated_by = $6, updated_at = NOW() WHERE master_id = $1 RETURNING *`, [req.params['id'], status, checkedAt.toISOString(), healthError, health.version || null, context.userId]);
      return res.status(status === 'ONLINE' ? 200 : 503).json({ data: result.rows[0], reachable: status !== 'OFFLINE', health });
    } catch (err) { return next(err); }
  });

  router.get('/print-stations/:id/health', async (req, res, next) => {
    try {
      const result = await pool.query(`SELECT master_id, code, status, last_heartbeat_at, last_health_check_at, last_health_error, software_version FROM md_print_station WHERE master_id = $1`, [req.params['id']]);
      if (!result.rows[0]) return res.status(404).json({ error: 'PRINT_STATION_NOT_FOUND' });
      return res.json({ data: result.rows[0] });
    } catch (err) { return next(err); }
  });

  router.get('/print-stations/:id/runtime', async (req, res, next) => {
    try {
      const result = await pool.query(`
        SELECT ps.master_id AS print_station_id, ps.code, ps.status AS lifecycle_status,
               COALESCE(rt.runtime_status, 'UNKNOWN') AS runtime_status,
               COALESCE(rt.kafka_status, 'UNKNOWN') AS kafka_status,
               rt.registered_printer_count, rt.active_for_work_printer_count, rt.ready_printer_count,
               rt.busy_printer_count, rt.offline_printer_count, rt.error_printer_count,
               rt.adapter_id, rt.last_heartbeat_at, rt.last_status_change_at,
               rt.last_event_id, rt.last_event_type, rt.last_error,
               COALESCE(rt.printer_snapshot, '[]'::jsonb) AS printers,
               rt.updated_at,
               ps.configured_allocation_limit,
               (SELECT COALESCE(SUM(b.allocated_printer_quantity), 0)::INT FROM md_workstation_print_station_binding b WHERE b.print_station_id = ps.master_id AND b.is_active = TRUE AND b.effective_to IS NULL) AS allocated_printer_quantity,
               CASE WHEN rt.active_for_work_printer_count IS NULL AND ps.configured_allocation_limit IS NULL THEN NULL ELSE LEAST(COALESCE(ps.configured_allocation_limit, rt.active_for_work_printer_count), COALESCE(rt.active_for_work_printer_count, ps.configured_allocation_limit)) END AS effective_allocation_capacity
        FROM md_print_station ps
        LEFT JOIN md_print_station_runtime_projection rt ON rt.print_station_id = ps.master_id
        WHERE ps.master_id = $1`, [req.params['id']]);
      if (!result.rows[0]) return res.status(404).json({ error: 'PRINT_STATION_NOT_FOUND' });
      const runtimeDetail = result.rows[0];
      const effective = runtimeDetail.effective_allocation_capacity == null ? null : Number(runtimeDetail.effective_allocation_capacity);
      runtimeDetail.remaining_printer_quantity = effective == null ? null : Math.max(0, effective - Number(runtimeDetail.allocated_printer_quantity || 0));
      runtimeDetail.allocation_deficit = effective == null ? null : Math.max(0, Number(runtimeDetail.allocated_printer_quantity || 0) - effective);
      return res.json({ data: runtimeDetail });
    } catch (err) { return next(err); }
  });

  router.get('/print-stations/:id/workstations', async (req, res, next) => {
    try {
      const result = await pool.query(`SELECT b.*, ws.code AS workstation_code, ws.name AS workstation_name, ws.site_id, ps.code AS print_station_code
        FROM md_workstation_print_station_binding b JOIN md_workstation ws ON ws.master_id = b.workstation_id JOIN md_print_station ps ON ps.master_id = b.print_station_id
        WHERE b.print_station_id = $1 AND b.is_active = TRUE AND b.effective_to IS NULL ORDER BY b.role, b.effective_from DESC`, [req.params['id']]);
      return res.json({ data: result.rows });
    } catch (err) { return next(err); }
  });

  router.get('/workstations/:workstationId/print-station-bindings', async (req, res, next) => {
    try {
      const result = await pool.query(`SELECT b.*, ps.code AS print_station_code, ps.name AS print_station_name, ps.gateway_base_url, ps.status AS print_station_status, ps.deployment_mode
        FROM md_workstation_print_station_binding b JOIN md_print_station ps ON ps.master_id = b.print_station_id
        WHERE b.workstation_id = $1 AND b.is_active = TRUE AND b.effective_to IS NULL ORDER BY b.role, b.effective_from DESC`, [req.params['workstationId']]);
      return res.json({ data: result.rows });
    } catch (err) { return next(err); }
  });

  router.get('/print-stations/:id/workstation-candidates', async (req, res, next) => {
    try {
      const station = await pool.query(`SELECT ps.master_id, ps.site_id, ps.shopfloor_id, ps.configured_allocation_limit,
        rt.active_for_work_printer_count, rt.ready_printer_count, rt.runtime_status,
        COALESCE((SELECT SUM(b.allocated_printer_quantity) FROM md_workstation_print_station_binding b WHERE b.print_station_id = ps.master_id AND b.is_active = TRUE AND b.effective_to IS NULL), 0)::INT AS allocated_printer_quantity
        FROM md_print_station ps LEFT JOIN md_print_station_runtime_projection rt ON rt.print_station_id = ps.master_id WHERE ps.master_id = $1`, [req.params['id']]);
      if (!station.rows[0]) return res.status(404).json({ error: 'PRINT_STATION_NOT_FOUND' });
      const row = station.rows[0];
      const capacity = row.active_for_work_printer_count == null && row.configured_allocation_limit == null ? null : Math.min(Number(row.configured_allocation_limit ?? row.active_for_work_printer_count), Number(row.active_for_work_printer_count ?? row.configured_allocation_limit));
      const remaining = capacity == null ? null : Math.max(0, capacity - Number(row.allocated_printer_quantity));
      const result = await pool.query(`SELECT ws.master_id AS workstation_id, ws.code AS workstation_code, ws.name AS workstation_name
        FROM md_workstation ws
        WHERE ws.active_flag = TRUE AND ws.lifecycle_status = 'Released' AND ws.site_id = $1
          AND NOT EXISTS (SELECT 1 FROM md_workstation_print_station_binding b WHERE b.workstation_id = ws.master_id AND b.is_active = TRUE AND b.effective_to IS NULL)
        ORDER BY ws.code`, [row.site_id]);
      return res.json({ data: { capacity: { effective: capacity, allocated: Number(row.allocated_printer_quantity), remaining, ready: row.ready_printer_count == null ? null : Number(row.ready_printer_count), runtimeStatus: row.runtime_status ?? 'UNKNOWN' }, candidates: result.rows.map((candidate) => ({ ...candidate, eligible: remaining != null && remaining > 0, maximumAllocatableQuantity: remaining ?? 0, alreadyBoundToPrintStation: false })) } });
    } catch (err) { return next(err); }
  });

  router.post('/workstations/:workstationId/print-station-bindings', async (req, res, next) => {
    const context = getContext(req);
    const client = await pool.connect();
    let transactionCompleted = false;
    try {
      await client.query('BEGIN');
      const body = req.body || {};
      const role = String(body.role || 'PRIMARY').toUpperCase();
      if (!['PRIMARY', 'BACKUP'].includes(role)) return res.status(422).json({ error: 'PRINT_BINDING_ROLE_INVALID' });
      const workstation = await client.query('SELECT master_id, site_id, shopfloor_id, active_flag FROM md_workstation WHERE master_id = $1 FOR UPDATE', [req.params['workstationId']]);
      const station = await client.query(`SELECT ps.master_id, ps.site_id, ps.shopfloor_id, ps.status, ps.is_active, ps.configured_allocation_limit,
        rt.active_for_work_printer_count, rt.runtime_status
        FROM md_print_station ps LEFT JOIN md_print_station_runtime_projection rt ON rt.print_station_id = ps.master_id
        WHERE ps.master_id = $1 FOR UPDATE OF ps`, [String(body.print_station_id || '')]);
      if (!workstation.rows[0] || workstation.rows[0].active_flag !== true) return res.status(422).json({ error: 'WORKSTATION_NOT_FOUND_OR_INACTIVE' });
      if (!station.rows[0]) return res.status(422).json({ error: 'PRINT_STATION_NOT_FOUND' });
      const ws = workstation.rows[0]; const ps = station.rows[0];
      const allocatedQuantity = Number(body.allocated_printer_quantity);
      if (!Number.isInteger(allocatedQuantity) || allocatedQuantity <= 0) return res.status(422).json({ error: 'INVALID_ALLOCATED_PRINTER_QUANTITY' });
      if (ws.site_id !== ps.site_id) return res.status(422).json({ error: 'PRINT_BINDING_SITE_MISMATCH' });
      if (ws.shopfloor_id && ps.shopfloor_id && ws.shopfloor_id !== ps.shopfloor_id) return res.status(422).json({ error: 'PRINT_BINDING_SHOPFLOOR_MISMATCH' });
      if (ps.status === 'DISABLED' || ps.is_active !== true) return res.status(422).json({ error: 'PRINT_STATION_DISABLED' });
      const effectiveFrom = printStationDate(body.effective_from, new Date());
      const effectiveTo = body.effective_to ? printStationDate(body.effective_to, new Date()) : null;
      if (effectiveTo && effectiveTo <= effectiveFrom) return res.status(422).json({ error: 'PRINT_BINDING_EFFECTIVE_RANGE_INVALID' });
      const existing = await client.query(`SELECT binding_id FROM md_workstation_print_station_binding WHERE workstation_id = $1 AND is_active = TRUE AND effective_to IS NULL FOR UPDATE`, [req.params['workstationId']]);
      if (existing.rows[0]) return res.status(409).json({ error: 'WORKSTATION_ALREADY_HAS_PRINT_STATION' });
      const capacity = ps.active_for_work_printer_count == null ? null : Math.min(Number(ps.configured_allocation_limit ?? ps.active_for_work_printer_count), Number(ps.active_for_work_printer_count));
      if (capacity == null) return res.status(409).json({ error: 'PRINT_STATION_RUNTIME_NOT_AVAILABLE' });
      const allocated = await client.query(`SELECT COALESCE(SUM(allocated_printer_quantity), 0)::INT AS total FROM md_workstation_print_station_binding WHERE print_station_id = $1 AND is_active = TRUE AND effective_to IS NULL`, [ps.master_id]);
      const currentTotal = Number(allocated.rows[0]?.total || 0);
      if (currentTotal + allocatedQuantity > capacity) return res.status(409).json({ error: 'PRINT_STATION_ALLOCATION_EXCEEDS_CAPACITY', details: { capacity, allocated: currentTotal, remaining: Math.max(0, capacity - currentTotal), requested: allocatedQuantity } });
      const result = await client.query(`INSERT INTO md_workstation_print_station_binding (workstation_id, print_station_id, allocated_printer_quantity, role, effective_from, effective_to, created_by, updated_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$7) RETURNING *`, [req.params['workstationId'], ps.master_id, allocatedQuantity, role, effectiveFrom.toISOString(), effectiveTo?.toISOString() || null, context.userId]);
      await client.query('COMMIT');
      transactionCompleted = true;
      return res.status(201).json({ data: result.rows[0] });
    } catch (err: any) { await client.query('ROLLBACK').catch(() => undefined); if (err?.code === '23505') return res.status(409).json({ error: 'WORKSTATION_ALREADY_HAS_PRINT_STATION' }); return next(err); } finally { if (!transactionCompleted) await client.query('ROLLBACK').catch(() => undefined); client.release(); }
  });

  router.delete('/workstation-print-station-bindings/:bindingId', async (req, res, next) => {
    const context = getContext(req);
    try {
      const current = await pool.query('SELECT * FROM md_workstation_print_station_binding WHERE binding_id = $1', [req.params['bindingId']]);
      if (!current.rows[0]) return res.status(404).json({ error: 'PRINT_BINDING_NOT_FOUND' });
      // Removing a binding ends its effective period; the row remains for audit
      // and historical Work Order resolution.
      const result = await pool.query(`UPDATE md_workstation_print_station_binding
        SET is_active = FALSE, effective_to = COALESCE(effective_to, NOW()), ended_by = $2, end_reason = COALESCE($3, end_reason), updated_by = $2, updated_at = NOW()
        WHERE binding_id = $1 AND is_active = TRUE AND effective_to IS NULL RETURNING *`, [req.params['bindingId'], context.userId, req.body?.reason || null]);
      if (!result.rows[0]) return res.status(409).json({ error: 'PRINT_BINDING_ALREADY_ENDED' });
      return res.json({ data: result.rows[0] });
    } catch (err) { return next(err); }
  });

  router.patch('/workstation-print-station-bindings/:bindingId', async (req, res, next) => {
    const context = getContext(req);
    const client = await pool.connect();
    let transactionCompleted = false;
    try {
      await client.query('BEGIN');
      const current = await client.query('SELECT * FROM md_workstation_print_station_binding WHERE binding_id = $1 FOR UPDATE', [req.params['bindingId']]);
      if (!current.rows[0]) return res.status(404).json({ error: 'PRINT_BINDING_NOT_FOUND' });
      const row = current.rows[0];
      const sets: string[] = []; const values: unknown[] = [];
      if (req.body?.allocated_printer_quantity !== undefined) {
        const quantity = Number(req.body.allocated_printer_quantity);
        if (!Number.isInteger(quantity) || quantity <= 0) return res.status(422).json({ error: 'INVALID_ALLOCATED_PRINTER_QUANTITY' });
        const station = await client.query(`SELECT ps.configured_allocation_limit, rt.active_for_work_printer_count FROM md_print_station ps LEFT JOIN md_print_station_runtime_projection rt ON rt.print_station_id = ps.master_id WHERE ps.master_id = $1 FOR UPDATE OF ps`, [row.print_station_id]);
        const capacity = station.rows[0]?.active_for_work_printer_count == null ? null : Math.min(Number(station.rows[0].configured_allocation_limit ?? station.rows[0].active_for_work_printer_count), Number(station.rows[0].active_for_work_printer_count));
        if (capacity == null) return res.status(409).json({ error: 'PRINT_STATION_RUNTIME_NOT_AVAILABLE' });
        const allocated = await client.query(`SELECT COALESCE(SUM(allocated_printer_quantity), 0)::INT AS total FROM md_workstation_print_station_binding WHERE print_station_id = $1 AND is_active = TRUE AND effective_to IS NULL AND binding_id <> $2`, [row.print_station_id, row.binding_id]);
        const total = Number(allocated.rows[0]?.total || 0);
        if (total + quantity > capacity) return res.status(409).json({ error: 'PRINT_STATION_ALLOCATION_EXCEEDS_CAPACITY', details: { capacity, allocated: total, remaining: Math.max(0, capacity - total), requested: quantity } });
        values.push(quantity); sets.push(`allocated_printer_quantity = $${values.length}`);
      }
      if (req.body?.role !== undefined) { const role = String(req.body.role).toUpperCase(); if (!['PRIMARY', 'BACKUP'].includes(role)) return res.status(422).json({ error: 'PRINT_BINDING_ROLE_INVALID' }); values.push(role); sets.push(`role = $${values.length}`); }
      if (req.body?.effective_to !== undefined) { const effectiveTo = printStationDate(req.body.effective_to, new Date()); if (effectiveTo <= new Date(row.effective_from)) return res.status(422).json({ error: 'PRINT_BINDING_EFFECTIVE_RANGE_INVALID' }); values.push(effectiveTo.toISOString()); sets.push(`effective_to = $${values.length}`); }
      if (req.body?.is_active !== undefined) { values.push(Boolean(req.body.is_active)); sets.push(`is_active = $${values.length}`); }
      if (!sets.length) return res.status(400).json({ error: 'PRINT_BINDING_NO_UPDATE_FIELDS' });
      const result = await client.query(`UPDATE md_workstation_print_station_binding SET ${sets.join(', ')}, updated_by = $${values.length + 1}, updated_at = NOW() WHERE binding_id = $${values.length + 2} RETURNING *`, [...values, context.userId, req.params['bindingId']]);
      await client.query('COMMIT');
      transactionCompleted = true;
      return res.json({ data: result.rows[0] });
    } catch (err: any) { await client.query('ROLLBACK').catch(() => undefined); if (err?.code === '23505') return res.status(409).json({ error: 'WORKSTATION_ALREADY_HAS_PRINT_STATION' }); return next(err); } finally { if (!transactionCompleted) await client.query('ROLLBACK').catch(() => undefined); client.release(); }
  });

  router.get('/workstations/:workstationId/resolved-print-station', async (req, res, next) => {
    try {
      const at = req.query['at'] ? new Date(String(req.query['at'])) : new Date();
      if (Number.isNaN(at.getTime())) return res.status(422).json({ error: 'PRINT_RESOLUTION_DATE_INVALID' });
      const result = await pool.query(`SELECT b.*, ps.code AS print_station_code, ps.name AS print_station_name, ps.description AS print_station_description,
        ps.gateway_base_url, ps.status AS print_station_status, ps.deployment_mode, ps.capabilities, ps.site_id, ps.shopfloor_id
        FROM md_workstation_print_station_binding b JOIN md_print_station ps ON ps.master_id = b.print_station_id
        WHERE b.workstation_id = $1 AND b.is_active = TRUE AND ps.is_active = TRUE AND ps.status <> 'DISABLED'
          AND b.effective_from <= $2::timestamptz AND (b.effective_to IS NULL OR b.effective_to > $2::timestamptz)
        ORDER BY CASE WHEN b.role = 'PRIMARY' THEN 0 ELSE 1 END, b.effective_from DESC`, [req.params['workstationId'], at.toISOString()]);
      const selected = result.rows[0];
      if (!selected) return res.status(404).json({ error: 'PRINT_STATION_BINDING_NOT_FOUND' });
      const runtime = await pool.query(`SELECT runtime_status, kafka_status, registered_printer_count, active_for_work_printer_count, ready_printer_count, busy_printer_count, offline_printer_count, error_printer_count, last_heartbeat_at, last_error FROM md_print_station_runtime_projection WHERE print_station_id = $1`, [selected.print_station_id]);
      const projection = runtime.rows[0] ?? { runtime_status: 'UNKNOWN', kafka_status: 'UNKNOWN', registered_printer_count: null, active_for_work_printer_count: null, ready_printer_count: null, busy_printer_count: null, offline_printer_count: null, error_printer_count: null };
      const warnings = [
        ['OFFLINE', 'DEGRADED'].includes(selected.print_station_status) ? 'PRINT_STATION_LIFECYCLE_NOT_READY' : null,
        projection.runtime_status !== 'ONLINE' ? 'PRINT_STATION_RUNTIME_NOT_READY' : null,
        projection.kafka_status !== 'CONNECTED' ? 'PRINT_STATION_KAFKA_NOT_READY' : null,
      ].filter(Boolean);
      return res.json({ data: { ...selected, runtime: projection, warning: warnings[0] ?? null, warnings } });
    } catch (err) { return next(err); }
  });

  router.get('/workstations/:workstationId/print-station-readiness', async (req, res, next) => {
    try {
      const result = await pool.query(`
        SELECT b.binding_id, b.role, ps.master_id AS print_station_id, ps.code AS print_station_code,
               ps.status AS lifecycle_status, ps.is_active,
               COALESCE(rt.runtime_status, 'UNKNOWN') AS runtime_status,
               COALESCE(rt.kafka_status, 'UNKNOWN') AS kafka_status,
               rt.ready_printer_count, rt.active_for_work_printer_count, b.allocated_printer_quantity,
               rt.last_heartbeat_at
        FROM md_workstation_print_station_binding b
        JOIN md_print_station ps ON ps.master_id = b.print_station_id
        LEFT JOIN md_print_station_runtime_projection rt ON rt.print_station_id = ps.master_id
        WHERE b.workstation_id = $1 AND b.role = 'PRIMARY' AND b.is_active = TRUE
          AND b.effective_from <= NOW() AND (b.effective_to IS NULL OR b.effective_to > NOW())
        ORDER BY b.effective_from DESC LIMIT 1`, [req.params['workstationId']]);
      const row = result.rows[0];
      if (!row) return res.json({ ready: false, code: 'PRINT_STATION_BINDING_REQUIRED', data: null });
      const checks = {
        binding: true,
        lifecycle: row.is_active === true && row.lifecycle_status !== 'DISABLED',
        runtime: row.runtime_status === 'ONLINE',
        kafka: row.kafka_status === 'CONNECTED',
        printer: Number(row.ready_printer_count || 0) > 0,
      };
      const failed = Object.entries(checks).filter(([, value]) => !value).map(([key]) => key);
      const firstFailed = failed[0];
      return res.json({ ready: failed.length === 0, code: firstFailed ? `PRINT_STATION_${firstFailed.toUpperCase()}_NOT_READY` : null, failed_checks: failed, checks, data: row });
    } catch (err) { return next(err); }
  });

  router.get('/uoms', async (req, res, next) => {
    try {
      const params: unknown[] = [];
      const filters: string[] = [];
      if (typeof req.query['status'] === 'string' && req.query['status']) { params.push(req.query['status']); filters.push(`u.lifecycle_status = $${params.length}`); }
      if (typeof req.query['type'] === 'string' && req.query['type']) { params.push(req.query['type']); filters.push(`u.uom_class = $${params.length}`); }
      if (typeof req.query['search'] === 'string' && req.query['search']) { params.push(`%${req.query['search']}%`); filters.push(`(u.code ILIKE $${params.length} OR u.name->>'vi' ILIKE $${params.length} OR u.name->>'en' ILIKE $${params.length})`); }
      const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
      const { rows } = await pool.query(`
        SELECT u.*, (
          SELECT COUNT(*)::INT FROM md_item i WHERE i.base_uom_id = u.master_id
        ) + (
          SELECT COUNT(*)::INT FROM md_item_revision r WHERE r.base_uom_id = u.master_id
        ) + (
          SELECT COUNT(*)::INT FROM md_mbom_header h WHERE h.base_uom_id = u.master_id
        ) + (
          SELECT COUNT(*)::INT FROM md_mbom_line l WHERE l.uom_id = u.master_id
        ) + (
          SELECT COUNT(*)::INT FROM md_ebom_line e WHERE e.uom_id = u.master_id
        ) + (
          SELECT COUNT(*)::INT FROM md_uom_conversion c WHERE c.from_uom_id = u.master_id OR c.to_uom_id = u.master_id
        ) AS usage_count
        FROM md_uom u ${where} ORDER BY u.code`, params);
      return res.json({ data: rows });
    } catch (err) { return next(err); }
  });

  router.get('/uoms/:id/usage', async (req, res, next) => {
    try {
      const record = await pool.query('SELECT master_id, code, name, uom_class, lifecycle_status FROM md_uom WHERE master_id = $1', [req.params['id']]);
      if (!record.rows[0]) return res.status(404).json({ error: 'UOM_NOT_FOUND' });
      return res.json({ data: { uom: record.rows[0], usage: await getUomUsage(pool, req.params['id']) } });
    } catch (err) { return next(err); }
  });

  const validateUomPayload = (input: Record<string, unknown>, partial = false) => {
    const body = { ...input };
    if (body['code'] !== undefined) {
      body['code'] = String(body['code']).trim().toUpperCase();
      if (!/^[A-Z0-9][A-Z0-9_-]{0,49}$/.test(String(body['code']))) throw Object.assign(new Error('UOM_CODE_INVALID'), { statusCode: 422 });
    } else if (!partial) throw Object.assign(new Error('UOM_CODE_REQUIRED'), { statusCode: 422 });
    if (typeof body['name'] === 'string') body['name'] = { vi: body['name'] };
    if (body['name'] !== undefined && !localizedTextSchema.safeParse(body['name']).success) throw Object.assign(new Error('UOM_NAME_INVALID'), { statusCode: 422 });
    const type = body['uom_type'] ?? body['uom_class'];
    if (type !== undefined) {
      if (!UOM_TYPES.has(String(type))) throw Object.assign(new Error('UOM_TYPE_INVALID'), { statusCode: 422 });
      body['uom_class'] = type;
      delete body['uom_type'];
    } else if (!partial) throw Object.assign(new Error('UOM_TYPE_REQUIRED'), { statusCode: 422 });
    if (body['decimal_precision'] !== undefined) {
      const precision = Number(body['decimal_precision']);
      if (!Number.isInteger(precision) || precision < 0 || precision > 9) throw Object.assign(new Error('UOM_PRECISION_INVALID'), { statusCode: 422 });
      body['decimal_precision'] = precision;
    }
    if (body['allow_fraction'] !== undefined) body['allow_fraction'] = body['allow_fraction'] === true || body['allow_fraction'] === 'true';
    if (body['allow_fraction'] === false && body['decimal_precision'] !== undefined && body['decimal_precision'] !== 0) throw Object.assign(new Error('UOM_FRACTION_POLICY_INVALID'), { statusCode: 422 });
    if (!partial && body['allow_fraction'] === false && body['decimal_precision'] === undefined) body['decimal_precision'] = 0;
    if (body['description'] !== undefined) {
      if (typeof body['description'] === 'string') body['description'] = { vi: body['description'] };
      if (!localizedTextSchema.safeParse(body['description']).success) throw Object.assign(new Error('UOM_DESCRIPTION_INVALID'), { statusCode: 422 });
    }
    return body;
  };

  router.post('/uoms', async (req, res, next) => {
    const context = getContext(req);
    try {
      const body = validateUomPayload(normalizeBody(req.body));
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [context.userId]);
        const { rows } = await client.query(`INSERT INTO md_uom (code, name, description, version_no, lifecycle_status, effective_from, created_by, uom_class, decimal_precision, allow_fraction) VALUES ($1,$2::jsonb,$3::jsonb,1,$4,NOW(),$5,$6,$7,$8) RETURNING *`, [body['code'], JSON.stringify(body['name']), body['description'] ? JSON.stringify(body['description']) : null, body['lifecycle_status'] || 'Draft', context.userId, body['uom_class'], body['decimal_precision'] ?? 3, body['allow_fraction'] ?? true]);
        await client.query('COMMIT');
        return res.status(201).json(rows[0]);
      } catch (err: any) { await client.query('ROLLBACK'); if (err?.code === '23505') return res.status(409).json({ error: 'UOM_CODE_DUPLICATE' }); throw err; } finally { client.release(); }
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
      if (['md_item_revision', 'md_production_version', 'md_ebom_header', 'md_mbom_header', 'md_routing_header'].includes(table.tableName)) {
        const filters: string[] = [];
        if (table.tableName === 'md_item_revision' && typeof req.query['item_id'] === 'string' && req.query['item_id']) { params.push(req.query['item_id']); filters.push(`md_item_revision.item_id = $${params.length}`); }
        if (table.tableName !== 'md_item_revision' && typeof req.query['item_revision_id'] === 'string' && req.query['item_revision_id']) { params.push(req.query['item_revision_id']); filters.push(`${table.tableName}.item_revision_id = $${params.length}`); }
        if (table.tableName !== 'md_item_revision' && table.tableName !== 'md_routing_header' && typeof req.query['site_id'] === 'string' && req.query['site_id']) { params.push(req.query['site_id']); filters.push(`${table.tableName}.site_id = $${params.length}`); }
        if (typeof req.query['lifecycle_status'] === 'string' && req.query['lifecycle_status']) { params.push(req.query['lifecycle_status']); filters.push(`${table.tableName}.lifecycle_status = $${params.length}`); }
        if (['md_item_revision', 'md_ebom_header', 'md_mbom_header', 'md_routing_header'].includes(table.tableName) && typeof req.query['effective_at'] === 'string' && req.query['effective_at']) {
          const effectiveAt = new Date(String(req.query['effective_at']));
          if (Number.isNaN(effectiveAt.getTime())) return res.status(422).json({ error: 'EFFECTIVE_AT_INVALID' });
          params.push(effectiveAt.toISOString());
          filters.push(`${table.tableName}.effective_from <= $${params.length}::timestamptz AND (${table.tableName}.effective_to IS NULL OR $${params.length}::timestamptz < ${table.tableName}.effective_to)`);
        }
        if (table.tableName === 'md_item_revision') filters.push(`md_item_revision.item_id IN (SELECT master_id FROM md_item WHERE item_type IN ('FG','SFG'))`);
        if (filters.length) where = `WHERE ${filters.join(' AND ')}`;
      }
      let query = `SELECT * FROM ${table.tableName} ${where} ORDER BY code, version_no LIMIT $1`;
      if (table.tableName === 'md_employee') {
        query = `SELECT e.*, s.code AS site_code, s.name AS site_name, wc.code AS default_work_center_code, wc.name AS default_work_center_name,
                        COALESCE(skill_summary.active_skill_count, 0) AS active_skill_count,
                        COALESCE(skill_summary.inactive_skill_count, 0) AS inactive_skill_count,
                        COALESCE(skill_summary.active_skill_summary, '[]'::jsonb) AS active_skill_summary,
                        COALESCE(schedule_summary.today_schedule_count, 0) AS today_schedule_count,
                        COALESCE(schedule_summary.upcoming_schedule_count, 0) AS upcoming_schedule_count,
                        schedule_summary.today_shift_code,
                        schedule_summary.today_shift_name
                 FROM md_employee e
                 LEFT JOIN md_site s ON s.master_id = e.site_id
                 LEFT JOIN md_work_center wc ON wc.master_id = e.default_work_center_id
                 LEFT JOIN LATERAL (
                   SELECT
                     COUNT(*) FILTER (WHERE es.active_flag = TRUE AND es.effective_to IS NULL)::INT AS active_skill_count,
                     COUNT(*) FILTER (WHERE es.active_flag = FALSE OR es.effective_to IS NOT NULL)::INT AS inactive_skill_count,
                     jsonb_agg(jsonb_build_object(
                       'skill_id', es.skill_id,
                       'skill_code', sk.code,
                       'skill_name', sk.name,
                       'level', es.level,
                       'qualification_status', es.qualification_status
                     ) ORDER BY sk.code) FILTER (WHERE es.active_flag = TRUE AND es.effective_to IS NULL) AS active_skill_summary
                   FROM md_employee_skill es
                   JOIN md_skill sk ON sk.master_id = es.skill_id
                   WHERE es.employee_id = e.master_id
                     AND sk.scope = 'Employee'
                     AND sk.legacy_flag = FALSE
                 ) skill_summary ON TRUE
                 LEFT JOIN LATERAL (
                   SELECT
                     COUNT(*) FILTER (WHERE sch.schedule_date = CURRENT_DATE)::INT AS today_schedule_count,
                     COUNT(*) FILTER (WHERE sch.schedule_date >= CURRENT_DATE)::INT AS upcoming_schedule_count,
                     MAX(sh.code) FILTER (WHERE sch.schedule_date = CURRENT_DATE) AS today_shift_code,
                     (MAX(sh.name::text) FILTER (WHERE sch.schedule_date = CURRENT_DATE))::jsonb AS today_shift_name
                   FROM md_employee_shift_schedule sch
                   JOIN md_shift sh ON sh.master_id = sch.shift_id
                   WHERE sch.employee_id = e.master_id
                     AND sch.schedule_status = 'Scheduled'
                 ) schedule_summary ON TRUE
                 ${where.replaceAll('default_work_center_id', 'e.default_work_center_id')}
                 ORDER BY e.code, e.version_no LIMIT $1`;
      } else if (table.tableName === 'md_skill') {
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
        query = `SELECT pv.*, r.item_id, mb.code AS mbom_code, mb.name AS mbom_name,
                        rt.code AS routing_code, rt.name AS routing_name, eb.code AS ebom_code, eb.name AS ebom_name,
                        s.code AS site_code, r.revision_code, i.code AS item_code, i.name AS item_name,
                        COALESCE(line_summary.line_eligibility_count, 0) AS line_eligibility_count,
                        line_summary.primary_line_code, line_summary.primary_line_name,
                        COALESCE(line_summary.backup_line_count, 0) AS backup_line_count,
                        COALESCE(line_summary.line_eligibility_summary, '[]'::jsonb) AS line_eligibility_summary
                 FROM md_production_version pv
                 LEFT JOIN md_mbom_header mb ON mb.master_id = pv.mbom_header_id
                 LEFT JOIN md_routing_header rt ON rt.master_id = pv.routing_header_id
                 LEFT JOIN md_ebom_header eb ON eb.master_id = pv.ebom_header_id
                 LEFT JOIN md_site s ON s.master_id = pv.site_id
                 LEFT JOIN md_item_revision r ON r.master_id = pv.item_revision_id
                 LEFT JOIN md_item i ON i.master_id = r.item_id
                 LEFT JOIN LATERAL (
                   SELECT
                     COUNT(*)::INT AS line_eligibility_count,
                     MAX(pl.code) FILTER (WHERE e.is_primary = TRUE) AS primary_line_code,
                     (MAX(pl.name::text) FILTER (WHERE e.is_primary = TRUE))::jsonb AS primary_line_name,
                     COUNT(*) FILTER (WHERE e.is_primary = FALSE)::INT AS backup_line_count,
                     jsonb_agg(jsonb_build_object(
                       'eligibility_id', e.eligibility_id,
                       'production_line_id', e.production_line_id,
                       'production_line_code', pl.code,
                       'production_line_name', pl.name,
                       'is_primary', e.is_primary,
                       'priority_no', e.priority_no,
                       'efficiency_factor', e.efficiency_factor,
                       'selection_mode', e.selection_mode,
                       'selection_policy', e.selection_policy,
                       'lifecycle_status', e.lifecycle_status,
                       'effective_from', e.effective_from,
                       'effective_to', e.effective_to,
                       'active_flag', e.active_flag
                     ) ORDER BY e.is_primary DESC, e.priority_no, pl.code) AS line_eligibility_summary
                   FROM md_production_version_line_eligibility e
                   JOIN md_production_line pl ON pl.master_id = e.production_line_id
                   WHERE e.production_version_id = pv.master_id
                     AND e.active_flag = TRUE
                     AND (e.effective_to IS NULL OR e.effective_to > NOW())
                 ) line_summary ON TRUE
                 ${where.replaceAll('md_production_version.', 'pv.')} ORDER BY pv.code, pv.version_no LIMIT $1`;
      } else if (table.tableName === 'md_routing_header') {
        query = `SELECT rt.*, r.revision_code, i.code AS item_code, i.name AS item_name,
                        (SELECT COUNT(*)::INT FROM md_routing_operation ro WHERE ro.routing_header_id = rt.master_id) AS operation_count,
                        (SELECT COUNT(DISTINCT wc.site_id)::INT FROM md_routing_operation ro JOIN md_work_center wc ON wc.master_id = ro.work_center_id WHERE ro.routing_header_id = rt.master_id) AS factory_count
                 FROM md_routing_header rt
                 LEFT JOIN md_item_revision r ON r.master_id = rt.item_revision_id
                 LEFT JOIN md_item i ON i.master_id = r.item_id
                 ${where.replaceAll('md_routing_header.', 'rt.')} ORDER BY rt.code, rt.version_no LIMIT $1`;
      } else if (table.tableName === 'md_mbom_header') {
        query = `SELECT mb.*, s.code AS site_code, r.revision_code, i.code AS item_code, i.name AS item_name,
                        u.code AS base_uom_code,
                        (SELECT COUNT(*)::INT FROM md_mbom_line l WHERE l.mbom_header_id = mb.master_id AND l.effective_to IS NULL AND l.lifecycle_status NOT IN ('Inactive','Obsolete')) AS line_count
                 FROM md_mbom_header mb
                 LEFT JOIN md_site s ON s.master_id = mb.site_id
                 LEFT JOIN md_uom u ON u.master_id = mb.base_uom_id
                 LEFT JOIN md_item_revision r ON r.master_id = mb.item_revision_id
                 LEFT JOIN md_item i ON i.master_id = r.item_id
                 ${where.replaceAll('md_mbom_header.', 'mb.')} ORDER BY mb.code, mb.version_no LIMIT $1`;
      } else if (table.tableName === 'md_ebom_header') {
        query = `SELECT eb.*, r.revision_code, r.item_id, i.code AS item_code, i.name AS item_name,
                        (SELECT COUNT(*)::INT FROM md_ebom_line l WHERE l.ebom_header_id = eb.master_id AND l.effective_to IS NULL AND l.lifecycle_status NOT IN ('Inactive','Obsolete')) AS line_count
                 FROM md_ebom_header eb
                 LEFT JOIN md_item_revision r ON r.master_id = eb.item_revision_id
                 LEFT JOIN md_item i ON i.master_id = r.item_id
                 ${where.replaceAll('md_ebom_header.', 'eb.')} ORDER BY eb.code, eb.version_no LIMIT $1`;
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
                        op.code AS operation_code, op.name AS operation_name, sk.code AS skill_code, sk.name AS skill_name,
                        sk.scope AS skill_scope
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
                        (SELECT COUNT(*)::INT FROM md_resource_assignment ra WHERE ra.workstation_id = ws.master_id AND (ra.effective_to IS NULL OR ra.effective_to > NOW())) AS active_assignment_count,
                        ps.code AS print_station_code, b.allocated_printer_quantity AS allocated_printer_quantity,
                        rt.runtime_status AS print_station_runtime_status, rt.ready_printer_count AS print_station_ready_printer_count
                 FROM md_workstation ws JOIN md_site s ON s.master_id = ws.site_id LEFT JOIN md_production_area a ON a.master_id = ws.area_id LEFT JOIN md_work_center wc ON wc.master_id = ws.work_center_id
                 LEFT JOIN md_workstation_print_station_binding b ON b.workstation_id = ws.master_id AND b.is_active = TRUE AND b.effective_to IS NULL
                 LEFT JOIN md_print_station ps ON ps.master_id = b.print_station_id
                 LEFT JOIN md_print_station_runtime_projection rt ON rt.print_station_id = ps.master_id
                 ORDER BY ws.code, ws.version_no LIMIT $1`;
      } else if (table.tableName === 'md_equipment') {
        query = `SELECT eq.*, s.code AS site_code, s.name AS site_name, wc.code AS work_center_code, wc.name AS work_center_name,
                        (SELECT COUNT(*)::INT FROM md_machine_unit mu WHERE mu.machine_id = eq.master_id) AS total_unit_count,
                        (SELECT COUNT(*)::INT FROM md_machine_unit mu WHERE mu.machine_id = eq.master_id AND mu.physical_identity_status = 'Identified') AS identified_unit_count,
                        (SELECT COUNT(*)::INT FROM md_machine_unit mu WHERE mu.machine_id = eq.master_id AND mu.physical_identity_status IN ('PendingIdentification','Ambiguous')) AS pending_identification_unit_count,
                        (SELECT COUNT(*)::INT FROM md_machine_unit mu WHERE mu.machine_id = eq.master_id AND mu.active_flag = TRUE AND mu.execution_status = 'Available' AND mu.physical_identity_status = 'Identified' AND mu.planning_resource_flag = TRUE AND NOT EXISTS (SELECT 1 FROM md_resource_assignment ra WHERE ra.machine_unit_id = mu.machine_unit_id AND ra.effective_from < NOW() AND NOW() < COALESCE(ra.effective_to, 'infinity'::timestamptz) AND ra.lifecycle_status NOT IN ('Inactive','Obsolete'))) AS available_unit_count,
                        (SELECT COUNT(DISTINCT ra.machine_unit_id)::INT FROM md_resource_assignment ra JOIN md_machine_unit mu ON mu.machine_unit_id = ra.machine_unit_id WHERE ra.equipment_id = eq.master_id AND ra.machine_unit_id IS NOT NULL AND ra.effective_from < NOW() AND NOW() < COALESCE(ra.effective_to, 'infinity'::timestamptz) AND ra.lifecycle_status NOT IN ('Inactive','Obsolete')) AS assigned_unit_count,
                        (SELECT COUNT(*)::INT FROM md_machine_unit mu WHERE mu.machine_id = eq.master_id AND mu.execution_status = 'Maintenance') AS maintenance_unit_count,
                        (SELECT COUNT(*)::INT FROM md_machine_unit mu WHERE mu.machine_id = eq.master_id AND mu.execution_status = 'OutOfService') AS out_of_service_unit_count,
                        (SELECT COUNT(*)::INT FROM md_machine_unit mu WHERE mu.machine_id = eq.master_id AND mu.active_flag = TRUE AND mu.physical_identity_status = 'Identified' AND mu.planning_resource_flag = TRUE) AS planning_eligible_unit_count,
                        NULL::INT AS reserved_unit_count,
                        (SELECT COUNT(*)::INT FROM md_resource_assignment ra WHERE ra.equipment_id = eq.master_id AND ra.lifecycle_status NOT IN ('Inactive','Obsolete') AND (ra.effective_to IS NULL OR ra.effective_to > NOW())) AS active_assignment_count,
                        (SELECT COUNT(*)::INT FROM md_resource_capability rc WHERE rc.equipment_id = eq.master_id AND rc.active_flag = TRUE AND (rc.effective_to IS NULL OR rc.effective_to > NOW())) AS active_capability_count,
                        CASE WHEN eq.active_flag = FALSE OR eq.lifecycle_status IN ('Inactive','Obsolete') THEN 'Blocked'
                             WHEN eq.execution_status = 'OutOfService' THEN 'Blocked'
                             WHEN NOT EXISTS (SELECT 1 FROM md_machine_unit mu WHERE mu.machine_id = eq.master_id AND mu.active_flag = TRUE AND mu.execution_status = 'Available' AND mu.physical_identity_status = 'Identified' AND mu.planning_resource_flag = TRUE) THEN 'Blocked'
                             ELSE 'Ready' END AS readiness_status
                 FROM md_equipment eq JOIN md_site s ON s.master_id = eq.site_id LEFT JOIN md_work_center wc ON wc.master_id = eq.work_center_id
                 ORDER BY eq.code, eq.version_no LIMIT $1`;
      } else if (table.tableName === 'md_item_revision') {
        query = `SELECT r.*, i.code AS item_code, i.name AS item_name, mg.code AS material_group_code, mg.name AS material_group_name,
                    s.timezone AS site_timezone,
                    CASE WHEN r.effective_from > NOW() THEN 'Scheduled'
                         WHEN r.effective_to IS NOT NULL AND r.effective_to <= NOW() THEN 'Historical'
                         ELSE 'Current' END AS temporal_status,
                    EXISTS (SELECT 1 FROM md_production_version pv WHERE pv.item_revision_id = r.master_id AND pv.lifecycle_status = 'Released') AS has_production_configuration
                 FROM md_item_revision r
                 LEFT JOIN md_item i ON i.master_id = r.item_id
                 LEFT JOIN md_material_group mg ON mg.master_id = r.material_group_id
                 LEFT JOIN md_site s ON s.master_id = r.site_id
                 ${where.replaceAll('md_item_revision.', 'r.')} ORDER BY r.code, r.version_no LIMIT $1`;
      }
      const { rows } = await pool.query(query, params);
      res.json({ data: rows });
    } catch (err) {
      return next(err);
    }
  });

  router.get('/routing-headers/code-preview', async (_req, res, next) => {
    try {
      res.json(await routingCodePreview(pool));
    } catch (err) {
      next(err);
    }
  });

  router.put('/routing-headers/:id/operations', async (req, res, next) => {
    const context = getContext(req);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [context.userId]);
      const operations = await validateRoutingOperationReplacement(client, req.params['id'], normalizeBody(req.body).operations ?? req.body);
      const routing = await client.query(`SELECT code FROM md_routing_header WHERE master_id = $1`, [req.params['id']]);
      await client.query(`UPDATE md_production_standard SET lifecycle_status = 'Inactive', effective_to = NOW(), valid_to = NOW(), updated_by = $1, updated_at = NOW() WHERE routing_operation_id IN (SELECT master_id FROM md_routing_operation WHERE routing_header_id = $2 AND effective_to IS NULL) AND item_revision_id IS NULL AND effective_to IS NULL AND lifecycle_status NOT IN ('Inactive','Obsolete')`, [context.userId, req.params['id']]);
      await client.query(`UPDATE md_routing_operation SET lifecycle_status = 'Inactive', effective_to = NOW(), updated_by = $1, updated_at = NOW() WHERE routing_header_id = $2 AND effective_to IS NULL AND lifecycle_status NOT IN ('Inactive','Obsolete')`, [context.userId, req.params['id']]);
      for (const row of operations) {
        const operation = await client.query(`SELECT code, name FROM md_operation WHERE master_id = $1`, [row.operation_id]);
        const code = `${routing.rows[0].code}-${String(row.seq).padStart(3, '0')}`;
        const inserted = await client.query(`INSERT INTO md_routing_operation (code, name, version_no, lifecycle_status, effective_from, created_by, routing_header_id, operation_id, work_center_id, workstation_id, seq, predecessor_seq, scheduling_mode, queue_time_min, move_time_min, overlap_allowed, transfer_batch_qty, milestone_flag, planning_mode, units_per_label, label_quantity_method, copies_per_label) VALUES ($1,$2,1,'Draft',NOW(),$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING master_id`, [code, operation.rows[0].name || operation.rows[0].code, context.userId, req.params['id'], row.operation_id, row.work_center_id, row.workstation_id, row.seq, row.predecessor_seq, row.scheduling_mode, row.queue_time_min, row.move_time_min, row.overlap_allowed, row.transfer_batch_qty, row.milestone_flag, row.planning_mode, row.units_per_label || null, row.label_quantity_method || 'CEIL_BY_UNITS_PER_LABEL', row.copies_per_label || 1]);
        const routingSite = await client.query(`SELECT site_id FROM md_work_center WHERE master_id = $1`, [row.work_center_id]);
        if (row.planning_mode === 'ROUTING_OVERRIDE') {
          await client.query(`INSERT INTO md_production_standard (code, name, version_no, lifecycle_status, effective_from, created_by, item_revision_id, operation_id, work_center_id, site_id, routing_operation_id, labor_count, setup_time_min, cycle_time_sec, efficiency_factor, base_quantity, standard_yield, source_method, valid_from) VALUES ($1,$2,1,'Draft',NOW(),$3,NULL,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'Routing',NOW())`, [`${code}-STD`, operation.rows[0].name || operation.rows[0].code, context.userId, row.operation_id, row.work_center_id, routingSite.rows[0]?.site_id, inserted.rows[0].master_id, row.required_workers, row.setup_time_min, row.cycle_time_sec, row.efficiency_factor, row.base_quantity, row.standard_yield]);
        }
      }
      const result = await client.query(`SELECT ro.*, op.code AS operation_code, op.name AS operation_name, op.confirmation_mode, op.quantity_reporting, op.requires_material_scan, op.requires_output_label, op.allow_partial_completion, op.is_schedulable, op.default_cycle_time_sec, op.default_setup_time_min, op.default_base_quantity, op.default_required_persons, op.default_efficiency_factor, op.default_yield, wc.code AS work_center_code, wc.name AS work_center_name,
        CASE WHEN ro.planning_mode = 'ROUTING_OVERRIDE' AND rps.master_id IS NOT NULL THEN 'ROUTING_OVERRIDE' WHEN wps.master_id IS NOT NULL THEN 'WORK_CENTER_STANDARD' WHEN op.default_cycle_time_sec IS NOT NULL THEN 'OPERATION_DEFAULT' ELSE 'UNRESOLVED' END AS resolved_source,
        COALESCE(rps.base_quantity, wps.base_quantity, op.default_base_quantity) AS resolved_base_quantity,
        COALESCE(rps.setup_time_min, wps.setup_time_min, op.default_setup_time_min) AS resolved_setup_time_min,
        COALESCE(rps.cycle_time_sec, wps.cycle_time_sec, op.default_cycle_time_sec) AS resolved_cycle_time_sec,
        COALESCE(rps.labor_count, wps.labor_count, op.default_required_persons) AS resolved_required_workers,
        COALESCE(rps.efficiency_factor, wps.efficiency_factor, op.default_efficiency_factor) AS resolved_efficiency_factor,
        COALESCE(rps.standard_yield, wps.standard_yield, op.default_yield) AS resolved_standard_yield,
        COALESCE(rps.master_id, NULL) AS routing_standard_id,
        COALESCE(cap.candidate_workstation_count, 0) AS candidate_workstation_count,
        COALESCE(cap.candidate_workstation_count, 0) AS supported_workstation_count
        FROM md_routing_operation ro JOIN md_operation op ON op.master_id = ro.operation_id JOIN md_work_center wc ON wc.master_id = ro.work_center_id
        LEFT JOIN LATERAL (SELECT ps0.* FROM md_production_standard ps0 WHERE ps0.routing_operation_id = ro.master_id AND ps0.item_revision_id IS NULL AND ps0.effective_to IS NULL AND ps0.lifecycle_status NOT IN ('Inactive','Obsolete') ORDER BY ps0.valid_from DESC NULLS LAST LIMIT 1) rps ON TRUE
        LEFT JOIN LATERAL (SELECT ps0.* FROM md_production_standard ps0 WHERE ps0.routing_operation_id IS NULL AND ps0.item_revision_id IS NULL AND ps0.operation_id = ro.operation_id AND ps0.work_center_id = ro.work_center_id AND ps0.site_id = wc.site_id AND ps0.source_method = 'WorkCenter' AND ps0.lifecycle_status = 'Released' AND ps0.effective_to IS NULL ORDER BY ps0.valid_from DESC NULLS LAST LIMIT 1) wps ON TRUE
        LEFT JOIN LATERAL (SELECT COUNT(*)::INT AS candidate_workstation_count
          FROM md_workstation candidate
          WHERE candidate.work_center_id = ro.work_center_id
            AND candidate.active_flag = TRUE
            AND candidate.lifecycle_status NOT IN ('Inactive','Obsolete')
            AND candidate.effective_from <= NOW()
            AND (candidate.effective_to IS NULL OR candidate.effective_to > NOW())) cap ON TRUE
        WHERE ro.routing_header_id = $1 AND ro.effective_to IS NULL AND ro.lifecycle_status NOT IN ('Inactive','Obsolete') ORDER BY ro.seq`, [req.params['id']]);
      await client.query('COMMIT');
      return res.json({ data: result.rows });
    } catch (err) {
      await client.query('ROLLBACK');
      return next(err);
    } finally { client.release(); }
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

  router.get('/mbom-headers/:id', async (req, res, next) => {
    try {
      const header = await pool.query(`
        SELECT mb.*, s.code AS site_code, s.name AS site_name, u.code AS base_uom_code,
               r.revision_code AS output_revision_code, i.code AS output_item_code, i.name AS output_item_name,
               (SELECT COUNT(*)::INT FROM md_mbom_line l WHERE l.mbom_header_id = mb.master_id AND l.effective_to IS NULL AND l.lifecycle_status NOT IN ('Inactive','Obsolete')) AS line_count
        FROM md_mbom_header mb
        LEFT JOIN md_site s ON s.master_id = mb.site_id
        LEFT JOIN md_uom u ON u.master_id = mb.base_uom_id
        LEFT JOIN md_item_revision r ON r.master_id = mb.item_revision_id
        LEFT JOIN md_item i ON i.master_id = r.item_id
        WHERE mb.master_id = $1`, [req.params['id']]);
      if (!header.rows[0]) return res.status(404).json({ error: 'MBOM_NOT_FOUND' });
      const lines = await pool.query(`
        SELECT l.*, r.revision_code AS component_revision_code, i.code AS component_item_code, i.name AS component_item_name,
               i.item_type AS component_item_type, u.code AS uom_code, op.code AS issue_operation_code, op.name AS issue_operation_name
        FROM md_mbom_line l
        JOIN md_item_revision r ON r.master_id = l.component_revision_id
        JOIN md_item i ON i.master_id = r.item_id
        JOIN md_uom u ON u.master_id = l.uom_id
        LEFT JOIN md_operation op ON op.master_id = l.issue_operation_id
        WHERE l.mbom_header_id = $1 AND l.effective_to IS NULL AND l.lifecycle_status NOT IN ('Inactive','Obsolete')
        ORDER BY l.parent_line_id NULLS FIRST, l.seq, l.code`, [req.params['id']]);
      const substitutes = await pool.query(`
        SELECT cs.*, r.revision_code AS substitute_revision_code, i.code AS substitute_item_code, i.name AS substitute_item_name
        FROM md_component_substitute cs
        JOIN md_item_revision r ON r.master_id = cs.substitute_revision_id
        JOIN md_item i ON i.master_id = r.item_id
        JOIN md_mbom_line l ON l.master_id = cs.mbom_line_id
        WHERE l.mbom_header_id = $1 AND cs.effective_to IS NULL AND cs.lifecycle_status NOT IN ('Inactive','Obsolete')
        ORDER BY cs.mbom_line_id, cs.priority`, [req.params['id']]);
      return res.json({ data: { ...header.rows[0], lines: lines.rows, substitutes: substitutes.rows } });
    } catch (err) { return next(err); }
  });

  // A released MBOM is immutable. This endpoint creates a new independent
  // draft version and copies only the current structure, never historical rows.
  router.post('/mbom-headers/:id/create-new-version', async (req, res, next) => {
    const context = getContext(req); const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [context.userId]);
      const source = await client.query(`SELECT * FROM md_mbom_header WHERE master_id = $1 FOR SHARE`, [req.params['id']]);
      if (!source.rows[0]) throw Object.assign(new Error('MBOM_NOT_FOUND'), { statusCode: 404 });
      if (source.rows[0].lifecycle_status !== 'Released') throw Object.assign(new Error('MBOM_NEW_VERSION_REQUIRES_RELEASED_SOURCE'), { statusCode: 409 });
      const header = source.rows[0];
      const code = String(req.body?.code || `${header.code}-V${Number(header.version_no || 1) + 1}`);
      const name = req.body?.name || header.name;
      const inserted = await client.query(`
        INSERT INTO md_mbom_header
          (master_id, code, name, description, version_no, lifecycle_status, effective_from, effective_to,
           created_by, attributes, site_id, business_version, purpose, base_quantity, base_uom_id,
           change_reason, engineering_note, reference_document, structure_version)
        VALUES (gen_random_uuid(), $1, $2::jsonb, $3::jsonb, $4, 'Draft', NOW(), NULL, $5, $6::jsonb,
                $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14, 1)
        RETURNING *`, [
        code, JSON.stringify(name), JSON.stringify(header.description || null), Number(header.version_no || 1) + 1,
        context.userId, JSON.stringify(header.attributes || {}), header.site_id, header.business_version, header.purpose,
        header.base_quantity, header.base_uom_id, JSON.stringify(header.change_reason || null),
        JSON.stringify(header.engineering_note || null), header.reference_document,
      ]);
      const lines = await client.query(`SELECT * FROM md_mbom_line WHERE mbom_header_id = $1 AND effective_to IS NULL AND lifecycle_status NOT IN ('Inactive','Obsolete') ORDER BY parent_line_id NULLS FIRST, seq`, [req.params['id']]);
      const lineMap = new Map<string, string>();
      for (const line of lines.rows) lineMap.set(line.master_id, randomUUID());
      for (const line of lines.rows) {
        await client.query(`INSERT INTO md_mbom_line (master_id, code, name, version_no, lifecycle_status, effective_from, created_by, attributes, mbom_header_id, parent_line_id, seq, component_revision_id, quantity_per, uom_id, scrap_rate, issue_operation_id, backflush_flag, phantom_flag, optional_flag) VALUES ($1,$2,$3,1,'Draft',NOW(),$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`, [
          lineMap.get(line.master_id), line.code, line.name, context.userId, JSON.stringify(line.attributes || {}), inserted.rows[0].master_id,
          line.parent_line_id ? lineMap.get(line.parent_line_id) : null, line.seq, line.component_revision_id, line.quantity_per, line.uom_id,
          line.scrap_rate, line.issue_operation_id, line.backflush_flag, line.phantom_flag, line.optional_flag,
        ]);
      }
      const substitutes = await client.query(`SELECT cs.* FROM md_component_substitute cs JOIN md_mbom_line l ON l.master_id = cs.mbom_line_id WHERE l.mbom_header_id = $1 AND cs.effective_to IS NULL AND cs.lifecycle_status NOT IN ('Inactive','Obsolete')`, [req.params['id']]);
      for (const substitute of substitutes.rows) {
        await client.query(`INSERT INTO md_component_substitute (master_id, code, name, version_no, lifecycle_status, effective_from, created_by, attributes, mbom_line_id, substitute_revision_id, priority, conversion_factor, max_usage_percent, requires_approval, approval_status) VALUES ($1,$2,$3,1,'Draft',NOW(),$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12)`, [
          randomUUID(), substitute.code, substitute.name, context.userId, JSON.stringify(substitute.attributes || {}), lineMap.get(substitute.mbom_line_id), substitute.substitute_revision_id,
          substitute.priority, substitute.conversion_factor, substitute.max_usage_percent, substitute.requires_approval, substitute.requires_approval ? 'Pending' : 'NotRequired',
        ]);
      }
      await client.query('COMMIT');
      return res.status(201).json({ data: { ...inserted.rows[0], copied_line_count: lines.rows.length, copied_substitute_count: substitutes.rows.length } });
    } catch (err: any) { await client.query('ROLLBACK'); return res.status(err?.statusCode || 500).json({ error: err?.message || 'MBOM_NEW_VERSION_FAILED' }); } finally { client.release(); }
  });

  router.get('/mbom-headers/:id/lines', async (req, res, next) => {
    try {
      const { rows } = await pool.query(`SELECT l.*, r.revision_code AS component_revision_code, i.code AS component_item_code, i.name AS component_item_name, i.item_type AS component_item_type, u.code AS uom_code FROM md_mbom_line l JOIN md_item_revision r ON r.master_id = l.component_revision_id JOIN md_item i ON i.master_id = r.item_id JOIN md_uom u ON u.master_id = l.uom_id WHERE l.mbom_header_id = $1 AND l.effective_to IS NULL AND l.lifecycle_status NOT IN ('Inactive','Obsolete') ORDER BY l.parent_line_id NULLS FIRST, l.seq, l.code`, [req.params['id']]);
      return res.json({ data: rows });
    } catch (err) { return next(err); }
  });

  router.get('/mbom-lines/:lineId/substitutes', async (req, res, next) => {
    try {
      const { rows } = await pool.query(`SELECT cs.*, r.revision_code AS substitute_revision_code, i.code AS substitute_item_code, i.name AS substitute_item_name FROM md_component_substitute cs JOIN md_item_revision r ON r.master_id = cs.substitute_revision_id JOIN md_item i ON i.master_id = r.item_id WHERE cs.mbom_line_id = $1 AND cs.effective_to IS NULL AND cs.lifecycle_status NOT IN ('Inactive','Obsolete') ORDER BY cs.priority`, [req.params['lineId']]);
      return res.json({ data: rows });
    } catch (err) { return next(err); }
  });

  router.post('/mbom-lines/:lineId/substitutes', async (req, res, next) => {
    const context = getContext(req); const body = normalizeBody(req.body); const client = await pool.connect();
    try {
      await client.query('BEGIN'); await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [context.userId]);
      const source = await client.query(`SELECT l.component_revision_id, l.uom_id, source_uom.code AS component_uom_code, h.lifecycle_status, i.item_group AS component_group FROM md_mbom_line l JOIN md_mbom_header h ON h.master_id = l.mbom_header_id JOIN md_item_revision cr ON cr.master_id = l.component_revision_id JOIN md_item i ON i.master_id = cr.item_id JOIN md_uom source_uom ON source_uom.master_id = l.uom_id WHERE l.master_id = $1 FOR SHARE`, [req.params['lineId']]);
      if (!source.rows[0]) throw Object.assign(new Error('MBOM_LINE_NOT_FOUND'), { statusCode: 404 });
      if (source.rows[0].lifecycle_status === 'Released') throw Object.assign(new Error('MBOM_RELEASED_IMMUTABLE'), { statusCode: 409 });
      if (String(source.rows[0].component_revision_id) === String(body['substitute_revision_id'])) throw Object.assign(new Error('MBOM_SUBSTITUTE_SAME_AS_COMPONENT'), { statusCode: 422 });
      if (!body['substitute_revision_id'] || Number(body['priority'] || 1) <= 0 || Number(body['conversion_factor'] ?? 1) <= 0 || Number(body['max_usage_percent'] ?? 100) <= 0 || Number(body['max_usage_percent'] ?? 100) > 100) throw Object.assign(new Error('MBOM_SUBSTITUTE_PAYLOAD_INVALID'), { statusCode: 422 });
      const effectiveFrom = body['effective_from'] ? new Date(String(body['effective_from'])) : new Date();
      const effectiveTo = body['effective_to'] ? new Date(String(body['effective_to'])) : null;
      if (Number.isNaN(effectiveFrom.getTime()) || (effectiveTo && Number.isNaN(effectiveTo.getTime())) || (effectiveTo && effectiveTo <= effectiveFrom)) throw Object.assign(new Error('MBOM_SUBSTITUTE_EFFECTIVE_DATES_INVALID'), { statusCode: 422 });
      const substitute = await client.query(`SELECT lifecycle_status, effective_from, effective_to, revision_code FROM md_item_revision WHERE master_id = $1`, [body['substitute_revision_id']]);
      const revision = substitute.rows[0];
      const now = new Date();
      const outsideWindow = revision && (new Date(revision.effective_from) > now || (revision.effective_to && new Date(revision.effective_to) <= now));
      if (!revision || revision.lifecycle_status !== 'Released' || outsideWindow) {
        const reason = !revision ? 'NOT_FOUND' : revision.lifecycle_status !== 'Released' ? 'NOT_RELEASED' : 'OUTSIDE_EFFECTIVE_WINDOW';
        throw Object.assign(new Error('MBOM_SUBSTITUTE_REVISION_INVALID'), { statusCode: 422, details: [{ code: 'MBOM_SUBSTITUTE_REVISION_INVALID', reason, revision_code: revision?.revision_code || null, lifecycle_status: revision?.lifecycle_status || null, effective_from: revision?.effective_from || null, effective_to: revision?.effective_to || null }] });
      }
      const substituteContext = await client.query(`SELECT i.item_group, r.base_uom_id, substitute_uom.code AS substitute_uom_code FROM md_item_revision r JOIN md_item i ON i.master_id = r.item_id JOIN md_uom substitute_uom ON substitute_uom.master_id = r.base_uom_id WHERE r.master_id = $1 AND r.effective_from <= NOW() AND (r.effective_to IS NULL OR r.effective_to > NOW())`, [body['substitute_revision_id']]);
      const requestedException = body['compatibility_exception_approved'] === true;
      const sameGroup = substituteContext.rows[0]?.item_group === source.rows[0].component_group;
      const sameUom = substituteContext.rows[0]?.base_uom_id === source.rows[0].uom_id;
      const conversion = await client.query(`SELECT 1 FROM md_uom_conversion WHERE ((from_uom_id = $1 AND to_uom_id = $2) OR (from_uom_id = $2 AND to_uom_id = $1)) AND lifecycle_status = 'Released' AND effective_to IS NULL`, [source.rows[0].uom_id, substituteContext.rows[0]?.base_uom_id]);
      const compatibilityDetails = [];
      if (!sameGroup) compatibilityDetails.push({ code: 'MBOM_SUBSTITUTE_ITEM_GROUP_MISMATCH', expected_group: source.rows[0].component_group, actual_group: substituteContext.rows[0]?.item_group || null });
      if (!sameUom && !conversion.rows[0]) compatibilityDetails.push({ code: 'MBOM_SUBSTITUTE_UOM_CONVERSION_MISSING', component_uom_code: source.rows[0].component_uom_code, substitute_uom_code: substituteContext.rows[0]?.substitute_uom_code || null });
      if (compatibilityDetails.length && !(requestedException && String(body['compatibility_exception_reason'] || '').trim())) {
        throw Object.assign(new Error('MBOM_SUBSTITUTE_COMPATIBILITY_INVALID'), { statusCode: 422, details: compatibilityDetails });
      }
      const requiresApproval = body['requires_approval'] === true || requestedException;
      const { rows } = await client.query(`INSERT INTO md_component_substitute (master_id, code, name, mbom_line_id, substitute_revision_id, priority, conversion_factor, max_usage_percent, requires_approval, approval_status, compatibility_exception_approved, compatibility_exception_reason, requested_by, requested_at, lifecycle_status, effective_from, effective_to, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW(),'Draft',$14,$15,$16) RETURNING *`, [randomUUID(), body['code'] || `SUB-${Date.now()}`, body['name'] || 'Component substitute', req.params['lineId'], body['substitute_revision_id'], Number(body['priority'] || 1), body['conversion_factor'] ?? 1, body['max_usage_percent'] ?? 100, requiresApproval, requiresApproval ? 'Pending' : 'NotRequired', requestedException, body['compatibility_exception_reason'] || null, context.userId, effectiveFrom, effectiveTo, context.userId]);
      await client.query(`INSERT INTO md_component_substitute_approval_audit (substitute_id, previous_status, new_status, reason, actor_id) VALUES ($1, NULL, $2, $3, $4)`, [rows[0].master_id, rows[0].approval_status, body['compatibility_exception_reason'] || null, context.userId]);
      await client.query('COMMIT'); return res.status(201).json({ data: rows[0] });
    } catch (err: any) { await client.query('ROLLBACK'); if (err?.code === '23505') return res.status(409).json({ error: 'MBOM_SUBSTITUTE_DUPLICATE' }); return res.status(err?.statusCode || 500).json({ error: err?.message || 'MBOM_SUBSTITUTE_CREATE_FAILED', details: err?.details }); } finally { client.release(); }
  });

  router.put('/mbom-lines/:lineId/substitutes/replace', async (req, res, next) => {
    const context = getContext(req); const requested = Array.isArray(req.body?.substitutes) ? req.body.substitutes as Array<Record<string, any>> : []; const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [context.userId]);
      const source = await client.query(`SELECT l.component_revision_id, l.uom_id, source_uom.code AS component_uom_code, h.lifecycle_status, i.item_group AS component_group FROM md_mbom_line l JOIN md_mbom_header h ON h.master_id = l.mbom_header_id JOIN md_item_revision cr ON cr.master_id = l.component_revision_id JOIN md_item i ON i.master_id = cr.item_id JOIN md_uom source_uom ON source_uom.master_id = l.uom_id WHERE l.master_id = $1 FOR UPDATE`, [req.params['lineId']]);
      if (!source.rows[0]) throw Object.assign(new Error('MBOM_LINE_NOT_FOUND'), { statusCode: 404 });
      if (source.rows[0].lifecycle_status === 'Released') throw Object.assign(new Error('MBOM_SUBSTITUTE_RELEASED_MBOM_IMMUTABLE'), { statusCode: 409 });
      const active = await client.query(`SELECT cs.master_id, cs.approval_status, cs.lifecycle_status FROM md_component_substitute cs WHERE cs.mbom_line_id = $1 AND cs.effective_to IS NULL AND cs.lifecycle_status NOT IN ('Inactive','Obsolete') FOR UPDATE`, [req.params['lineId']]);
      for (const row of active.rows) {
        const protectedHistory = await client.query(`SELECT 1 FROM md_component_substitute_approval_audit WHERE substitute_id = $1 AND new_status IN ('Approved','Rejected','Ended') LIMIT 1`, [row.master_id]);
        if (row.approval_status === 'Approved' || row.lifecycle_status === 'Released' || protectedHistory.rows[0]) throw Object.assign(new Error('MBOM_SUBSTITUTE_REPLACEMENT_HISTORY_EXISTS'), { statusCode: 409 });
      }
      await client.query(`UPDATE md_component_substitute SET lifecycle_status = 'Inactive', effective_to = COALESCE(effective_to, NOW()), updated_by = $1, updated_at = NOW() WHERE mbom_line_id = $2 AND effective_to IS NULL AND lifecycle_status NOT IN ('Inactive','Obsolete')`, [context.userId, req.params['lineId']]);
      const revisions = new Set<string>(); const priorities = new Set<number>();
      for (const [index, item] of requested.entries()) {
        const revisionId = String(item.substitute_revision_id || ''); const priority = Number(item.priority || 0);
        if (!revisionId || revisionId === String(source.rows[0].component_revision_id) || priority <= 0 || revisions.has(revisionId) || priorities.has(priority)) throw Object.assign(new Error('MBOM_SUBSTITUTE_PAYLOAD_INVALID'), { statusCode: 422 });
        revisions.add(revisionId); priorities.add(priority);
        if (Number(item.conversion_factor ?? 1) <= 0 || Number(item.max_usage_percent ?? 100) <= 0 || Number(item.max_usage_percent ?? 100) > 100) throw Object.assign(new Error('MBOM_SUBSTITUTE_PAYLOAD_INVALID'), { statusCode: 422 });
        const effectiveFrom = item.effective_from ? new Date(String(item.effective_from)) : new Date(); const effectiveTo = item.effective_to ? new Date(String(item.effective_to)) : null;
        if (Number.isNaN(effectiveFrom.getTime()) || (effectiveTo && Number.isNaN(effectiveTo.getTime())) || (effectiveTo && effectiveTo <= effectiveFrom)) throw Object.assign(new Error('MBOM_SUBSTITUTE_EFFECTIVE_DATES_INVALID'), { statusCode: 422 });
        const revision = await client.query(`SELECT lifecycle_status, effective_from, effective_to FROM md_item_revision WHERE master_id = $1`, [revisionId]);
        const current = new Date(); const rev = revision.rows[0];
        if (!rev || rev.lifecycle_status !== 'Released' || new Date(rev.effective_from) > current || (rev.effective_to && new Date(rev.effective_to) <= current)) throw Object.assign(new Error('MBOM_SUBSTITUTE_REVISION_INVALID'), { statusCode: 422 });
        const substituteContext = await client.query(`SELECT i.item_group, r.base_uom_id, substitute_uom.code AS substitute_uom_code FROM md_item_revision r JOIN md_item i ON i.master_id = r.item_id JOIN md_uom substitute_uom ON substitute_uom.master_id = r.base_uom_id WHERE r.master_id = $1`, [revisionId]);
        const sameGroup = substituteContext.rows[0]?.item_group === source.rows[0].component_group; const sameUom = substituteContext.rows[0]?.base_uom_id === source.rows[0].uom_id;
        const conversion = await client.query(`SELECT 1 FROM md_uom_conversion WHERE ((from_uom_id = $1 AND to_uom_id = $2) OR (from_uom_id = $2 AND to_uom_id = $1)) AND lifecycle_status = 'Released' AND effective_to IS NULL`, [source.rows[0].uom_id, substituteContext.rows[0]?.base_uom_id]);
        const details: any[] = []; if (!sameGroup) details.push({ code: 'MBOM_SUBSTITUTE_ITEM_GROUP_MISMATCH', expected_group: source.rows[0].component_group, actual_group: substituteContext.rows[0]?.item_group || null }); if (!sameUom && !conversion.rows[0]) details.push({ code: 'MBOM_SUBSTITUTE_UOM_CONVERSION_MISSING', component_uom_code: source.rows[0].component_uom_code, substitute_uom_code: substituteContext.rows[0]?.substitute_uom_code || null });
        if (details.length && !(item.compatibility_exception_approved === true && String(item.compatibility_exception_reason || '').trim())) throw Object.assign(new Error('MBOM_SUBSTITUTE_COMPATIBILITY_INVALID'), { statusCode: 422, details });
        const requiresApproval = item.requires_approval === true || item.compatibility_exception_approved === true;
        await client.query(`INSERT INTO md_component_substitute (master_id, code, name, version_no, mbom_line_id, substitute_revision_id, priority, conversion_factor, max_usage_percent, requires_approval, approval_status, compatibility_exception_approved, compatibility_exception_reason, requested_by, requested_at, lifecycle_status, effective_from, effective_to, created_by) VALUES ($1,$2,$3,1,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW(),'Draft',$14,$15,$16)`, [randomUUID(), `SUB-${Date.now()}-${index + 1}`, 'Component substitute', req.params['lineId'], revisionId, priority, item.conversion_factor ?? 1, item.max_usage_percent ?? 100, requiresApproval, requiresApproval ? 'Pending' : 'NotRequired', item.compatibility_exception_approved === true, item.compatibility_exception_reason || null, context.userId, effectiveFrom, effectiveTo, context.userId]);
      }
      await client.query('COMMIT'); return res.json({ data: { line_id: req.params['lineId'], substitute_count: requested.length }, replaced: true });
    } catch (err: any) { await client.query('ROLLBACK'); return res.status(err?.statusCode || 500).json({ error: err?.message || 'MBOM_SUBSTITUTE_REPLACEMENT_FAILED', details: err?.details }); } finally { client.release(); }
  });

  router.post('/mbom-lines/:lineId/substitutes/:substituteId/approve', async (req, res, next) => {
    const context = getContext(req); const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const previous = await client.query(`SELECT cs.approval_status, h.lifecycle_status AS header_lifecycle_status FROM md_component_substitute cs JOIN md_mbom_line l ON l.master_id = cs.mbom_line_id JOIN md_mbom_header h ON h.master_id = l.mbom_header_id WHERE cs.master_id = $1 AND cs.mbom_line_id = $2 AND cs.effective_to IS NULL FOR UPDATE`, [req.params['substituteId'], req.params['lineId']]);
      if (previous.rows[0]?.header_lifecycle_status === 'Released') { await client.query('ROLLBACK'); return res.status(409).json({ error: 'MBOM_SUBSTITUTE_RELEASED_MBOM_IMMUTABLE' }); }
      const { rows } = await client.query(`UPDATE md_component_substitute SET approval_status = 'Approved', approved_by = $1, approved_at = NOW(), lifecycle_status = 'Released', updated_by = $1, updated_at = NOW() WHERE master_id = $2 AND mbom_line_id = $3 AND effective_to IS NULL RETURNING *`, [context.userId, req.params['substituteId'], req.params['lineId']]);
      if (!rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'MBOM_SUBSTITUTE_NOT_FOUND' }); }
      await client.query(`INSERT INTO md_component_substitute_approval_audit (substitute_id, previous_status, new_status, reason, actor_id) VALUES ($1, $2, 'Approved', $3, $4)`, [rows[0].master_id, previous.rows[0]?.approval_status || null, req.body?.reason || rows[0].approval_reason || null, context.userId]);
      await client.query('COMMIT');
      return res.json({ data: rows[0] });
    } catch (err) { await client.query('ROLLBACK'); return next(err); } finally { client.release(); }
  });

  router.post('/mbom-lines/:lineId/substitutes/:substituteId/reject', async (req, res, next) => {
    const context = getContext(req); const client = await pool.connect();
    try {
      const reason = String(req.body?.reason || '').trim();
      if (!reason) return res.status(422).json({ error: 'MBOM_SUBSTITUTE_REJECTION_REASON_REQUIRED' });
      await client.query('BEGIN');
      const guard = await client.query(`SELECT h.lifecycle_status FROM md_component_substitute cs JOIN md_mbom_line l ON l.master_id = cs.mbom_line_id JOIN md_mbom_header h ON h.master_id = l.mbom_header_id WHERE cs.master_id = $1 AND cs.mbom_line_id = $2 AND cs.effective_to IS NULL FOR UPDATE`, [req.params['substituteId'], req.params['lineId']]);
      if (guard.rows[0]?.lifecycle_status === 'Released') { await client.query('ROLLBACK'); return res.status(409).json({ error: 'MBOM_SUBSTITUTE_RELEASED_MBOM_IMMUTABLE' }); }
      const { rows } = await client.query(`UPDATE md_component_substitute SET approval_status = 'Rejected', rejection_reason = $1, rejected_by = $2, rejected_at = NOW(), lifecycle_status = 'Inactive', effective_to = NOW(), updated_by = $2, updated_at = NOW() WHERE master_id = $3 AND mbom_line_id = $4 AND effective_to IS NULL RETURNING *`, [reason, context.userId, req.params['substituteId'], req.params['lineId']]);
      if (!rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'MBOM_SUBSTITUTE_NOT_FOUND' }); }
      await client.query(`INSERT INTO md_component_substitute_approval_audit (substitute_id, previous_status, new_status, reason, actor_id) VALUES ($1, $2, 'Rejected', $3, $4)`, [rows[0].master_id, rows[0].approval_status, reason, context.userId]);
      await client.query('COMMIT'); return res.json({ data: rows[0] });
    } catch (err) { await client.query('ROLLBACK'); return next(err); } finally { client.release(); }
  });

  router.put('/mbom-lines/:lineId/substitutes/:substituteId', async (req, res, next) => {
    const context = getContext(req); const body = normalizeBody(req.body);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const ownership = await client.query(`SELECT cs.*, h.lifecycle_status AS header_lifecycle_status FROM md_component_substitute cs JOIN md_mbom_line l ON l.master_id = cs.mbom_line_id JOIN md_mbom_header h ON h.master_id = l.mbom_header_id WHERE cs.master_id = $1 AND cs.mbom_line_id = $2 FOR UPDATE`, [req.params['substituteId'], req.params['lineId']]);
      if (!ownership.rows[0]) throw Object.assign(new Error('MBOM_SUBSTITUTE_NOT_FOUND'), { statusCode: 404 });
      if (ownership.rows[0].header_lifecycle_status === 'Released') throw Object.assign(new Error('MBOM_SUBSTITUTE_RELEASED_MBOM_IMMUTABLE'), { statusCode: 409 });
      const audit = await client.query(`SELECT 1 FROM md_component_substitute_approval_audit WHERE substitute_id = $1 AND new_status IN ('Approved','Rejected','Ended') LIMIT 1`, [req.params['substituteId']]);
      if (ownership.rows[0].approval_status === 'Approved' || ownership.rows[0].lifecycle_status === 'Released' || audit.rows[0]) throw Object.assign(new Error('MBOM_SUBSTITUTE_APPROVAL_HISTORY_EXISTS'), { statusCode: 409 });
      if (body['conversion_factor'] !== undefined && Number(body['conversion_factor']) <= 0) throw Object.assign(new Error('MBOM_SUBSTITUTE_CONVERSION_INVALID'), { statusCode: 422 });
      if (body['max_usage_percent'] !== undefined && (Number(body['max_usage_percent']) <= 0 || Number(body['max_usage_percent']) > 100)) throw Object.assign(new Error('MBOM_SUBSTITUTE_MAX_USAGE_INVALID'), { statusCode: 422 });
      const effectiveFrom = body['effective_from'] === undefined ? null : new Date(String(body['effective_from']));
      const effectiveTo = body['effective_to'] === undefined || body['effective_to'] === null || body['effective_to'] === '' ? null : new Date(String(body['effective_to']));
      if ((effectiveFrom && Number.isNaN(effectiveFrom.getTime())) || (effectiveTo && Number.isNaN(effectiveTo.getTime()))) throw Object.assign(new Error('MBOM_SUBSTITUTE_EFFECTIVE_DATES_INVALID'), { statusCode: 422 });
      if (effectiveFrom && effectiveTo && effectiveTo <= effectiveFrom) throw Object.assign(new Error('MBOM_SUBSTITUTE_EFFECTIVE_DATES_INVALID'), { statusCode: 422 });
      const allowed = ['name', 'priority', 'conversion_factor', 'max_usage_percent', 'requires_approval', 'effective_from', 'effective_to'];
      const columns = allowed.filter((column) => body[column] !== undefined);
      if (!columns.length) throw Object.assign(new Error('MBOM_SUBSTITUTE_UPDATE_FIELDS_REQUIRED'), { statusCode: 400 });
      const sets = columns.map((column, index) => `${column} = $${index + 1}`);
      const { rows } = await client.query(`UPDATE md_component_substitute SET ${sets.join(', ')}, updated_by = $${columns.length + 1}, updated_at = NOW() WHERE master_id = $${columns.length + 2} AND mbom_line_id = $${columns.length + 3} AND effective_to IS NULL RETURNING *`, [...columns.map((column) => body[column]), context.userId, req.params['substituteId'], req.params['lineId']]);
      await client.query('COMMIT'); return res.json({ data: rows[0] });
    } catch (err) { await client.query('ROLLBACK'); return next(err); } finally { client.release(); }
  });

  router.delete('/mbom-lines/:lineId/substitutes/:substituteId', async (req, res, next) => {
    const context = getContext(req);
    try {
      const ownership = await pool.query(`SELECT cs.*, h.lifecycle_status AS header_lifecycle_status FROM md_component_substitute cs JOIN md_mbom_line l ON l.master_id = cs.mbom_line_id JOIN md_mbom_header h ON h.master_id = l.mbom_header_id WHERE cs.master_id = $1 AND cs.mbom_line_id = $2`, [req.params['substituteId'], req.params['lineId']]);
      if (!ownership.rows[0]) return res.status(404).json({ error: 'MBOM_SUBSTITUTE_NOT_FOUND' });
      if (ownership.rows[0].header_lifecycle_status === 'Released') return res.status(409).json({ error: 'MBOM_SUBSTITUTE_RELEASED_MBOM_IMMUTABLE' });
      const audit = await pool.query(`SELECT 1 FROM md_component_substitute_approval_audit WHERE substitute_id = $1 AND new_status IN ('Approved','Rejected','Ended') LIMIT 1`, [req.params['substituteId']]);
      if (ownership.rows[0].approval_status === 'Approved' || audit.rows[0]) return res.status(409).json({ error: 'MBOM_SUBSTITUTE_DELETE_NOT_ALLOWED' });
      const { rows } = await pool.query(`DELETE FROM md_component_substitute WHERE master_id = $1 AND mbom_line_id = $2 AND effective_to IS NULL AND lifecycle_status = 'Draft' RETURNING master_id`, [req.params['substituteId'], req.params['lineId']]);
      return res.json({ deleted: Boolean(rows[0]), master_id: req.params['substituteId'] });
    } catch (err) { return next(err); }
  });

  router.post('/mbom-lines/:lineId/substitutes/:substituteId/end-effectivity', async (req, res, next) => {
    const context = getContext(req); const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const ownership = await client.query(`SELECT cs.*, h.lifecycle_status AS header_lifecycle_status FROM md_component_substitute cs JOIN md_mbom_line l ON l.master_id = cs.mbom_line_id JOIN md_mbom_header h ON h.master_id = l.mbom_header_id WHERE cs.master_id = $1 AND cs.mbom_line_id = $2 FOR UPDATE`, [req.params['substituteId'], req.params['lineId']]);
      if (!ownership.rows[0]) throw Object.assign(new Error('MBOM_SUBSTITUTE_NOT_FOUND'), { statusCode: 404 });
      const row = ownership.rows[0];
      if (row.header_lifecycle_status === 'Released') throw Object.assign(new Error('MBOM_SUBSTITUTE_RELEASED_MBOM_IMMUTABLE'), { statusCode: 409 });
      if (row.effective_to || ['Inactive', 'Obsolete'].includes(row.lifecycle_status)) throw Object.assign(new Error('MBOM_SUBSTITUTE_ALREADY_ENDED'), { statusCode: 409 });
      const boundary = req.body?.effective_to ? new Date(String(req.body.effective_to)) : new Date();
      if (Number.isNaN(boundary.getTime()) || boundary <= new Date(row.effective_from)) throw Object.assign(new Error('MBOM_SUBSTITUTE_EFFECTIVE_DATE_INVALID'), { statusCode: 422 });
      const updated = await client.query(`UPDATE md_component_substitute SET effective_to = $1, lifecycle_status = 'Inactive', updated_by = $2, updated_at = NOW() WHERE master_id = $3 AND mbom_line_id = $4 RETURNING *`, [boundary, context.userId, req.params['substituteId'], req.params['lineId']]);
      await client.query(`INSERT INTO md_component_substitute_approval_audit (substitute_id, previous_status, new_status, reason, actor_id) VALUES ($1, $2, 'Ended', $3, $4)`, [req.params['substituteId'], row.approval_status, 'Effectivity ended', context.userId]);
      await client.query('COMMIT'); return res.json({ data: updated.rows[0] });
    } catch (err: any) { await client.query('ROLLBACK'); return res.status(err?.statusCode || 500).json({ error: err?.message || 'MBOM_SUBSTITUTE_END_EFFECTIVITY_FAILED' }); } finally { client.release(); }
  });

  router.get('/mbom-lines/:lineId/substitutes/:substituteId/audit', async (req, res, next) => {
    try {
      const result = await pool.query(`SELECT a.* FROM md_component_substitute_approval_audit a JOIN md_component_substitute cs ON cs.master_id = a.substitute_id WHERE cs.master_id = $1 AND cs.mbom_line_id = $2 ORDER BY a.occurred_at DESC`, [req.params['substituteId'], req.params['lineId']]);
      return res.json({ data: result.rows });
    } catch (err) { return next(err); }
  });

  router.put('/mbom-headers/:id/lines/:lineId([0-9a-fA-F-]{36})', async (req, res, next) => {
    const context = getContext(req); const body = normalizeBody(req.body); const client = await pool.connect();
    try {
      await client.query('BEGIN'); await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [context.userId]);
      const current = await client.query(`SELECT l.*, h.lifecycle_status AS header_status FROM md_mbom_line l JOIN md_mbom_header h ON h.master_id = l.mbom_header_id WHERE l.master_id = $1 AND l.mbom_header_id = $2 FOR UPDATE`, [req.params['lineId'], req.params['id']]);
      if (!current.rows[0]) throw Object.assign(new Error('MBOM_LINE_NOT_FOUND'), { statusCode: 404 });
      if (current.rows[0].header_status === 'Released') throw Object.assign(new Error('MBOM_RELEASED_IMMUTABLE'), { statusCode: 409 });
      const next = { ...current.rows[0], ...body };
      if (!Number.isInteger(Number(next.seq)) || Number(next.seq) <= 0 || Number(next.quantity_per) <= 0) throw Object.assign(new Error('MBOM_LINE_NUMERIC_INVALID'), { statusCode: 422 });
      if (next.parent_line_id) {
        const parent = await client.query(`SELECT mbom_header_id FROM md_mbom_line WHERE master_id = $1 AND master_id <> $2 AND effective_to IS NULL`, [next.parent_line_id, req.params['lineId']]);
        if (!parent.rows[0] || parent.rows[0].mbom_header_id !== req.params['id']) throw Object.assign(new Error('MBOM_PARENT_LINE_INVALID'), { statusCode: 422 });
        const cycle = await client.query(`WITH RECURSIVE ancestors AS (
          SELECT master_id, parent_line_id FROM md_mbom_line WHERE master_id = $1
          UNION ALL
          SELECT line.master_id, line.parent_line_id
          FROM md_mbom_line line JOIN ancestors a ON line.master_id = a.parent_line_id
        ) SELECT 1 FROM ancestors WHERE master_id = $2 LIMIT 1`, [next.parent_line_id, req.params['lineId']]);
        if (cycle.rows[0]) throw Object.assign(new Error('MBOM_PARENT_LINE_INVALID'), { statusCode: 422 });
      }
      const component = await client.query(`SELECT lifecycle_status, base_uom_id FROM md_item_revision WHERE master_id = $1 AND effective_from <= NOW() AND (effective_to IS NULL OR effective_to > NOW())`, [next.component_revision_id]);
      if (!component.rows[0] || component.rows[0].lifecycle_status !== 'Released') throw Object.assign(new Error('MBOM_COMPONENT_REVISION_INVALID'), { statusCode: 422 });
      next.uom_id = component.rows[0].base_uom_id;
      body['uom_id'] = component.rows[0].base_uom_id;
      const uom = await client.query(`SELECT lifecycle_status, allow_fraction, decimal_precision FROM md_uom WHERE master_id = $1`, [next.uom_id]);
      if (!uom.rows[0] || uom.rows[0].lifecycle_status !== 'Released') throw Object.assign(new Error('MBOM_LINE_UOM_NOT_RELEASED'), { statusCode: 422 });
      validateUomQuantity(next.quantity_per, uom.rows[0]);
      if (next.issue_operation_id) {
        const operation = await client.query(`SELECT lifecycle_status FROM md_operation WHERE master_id = $1`, [next.issue_operation_id]);
        if (!operation.rows[0] || ['Inactive', 'Obsolete'].includes(String(operation.rows[0].lifecycle_status))) throw Object.assign(new Error('MBOM_ISSUE_OPERATION_INVALID'), { statusCode: 422 });
      }
      const effectiveFrom = body['effective_from'] === undefined ? null : new Date(String(body['effective_from']));
      const effectiveTo = body['effective_to'] === undefined || body['effective_to'] === null || body['effective_to'] === '' ? null : new Date(String(body['effective_to']));
      if ((effectiveFrom && Number.isNaN(effectiveFrom.getTime())) || (effectiveTo && Number.isNaN(effectiveTo.getTime())) || (effectiveFrom && effectiveTo && effectiveTo <= effectiveFrom)) throw Object.assign(new Error('MBOM_LINE_EFFECTIVE_DATES_INVALID'), { statusCode: 422 });
      const allowed = ['parent_line_id', 'seq', 'component_revision_id', 'quantity_per', 'uom_id', 'scrap_rate', 'issue_operation_id', 'backflush_flag', 'phantom_flag', 'optional_flag', 'effective_from', 'effective_to'];
      const columns = allowed.filter((column) => body[column] !== undefined);
      if (!columns.length) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'No update fields provided' });
      }
      const values = columns.map((column) => {
        if (column === 'parent_line_id' && body[column] === '') return null;
        if (column === 'effective_to' && (body[column] === '' || body[column] === null)) return null;
        return body[column];
      });
      const sets = columns.map((column, index) => `${column} = $${index + 1}`);
      const { rows } = await client.query(`UPDATE md_mbom_line SET ${sets.join(', ')}, updated_by = $${columns.length + 1}, updated_at = NOW() WHERE master_id = $${columns.length + 2} RETURNING *`, [...values, context.userId, req.params['lineId']]);
      await client.query(`UPDATE md_mbom_header SET structure_version = structure_version + 1, updated_by = $1, updated_at = NOW() WHERE master_id = $2`, [context.userId, req.params['id']]);
      await client.query('COMMIT'); return res.json({ data: rows[0] });
    } catch (err: any) { await client.query('ROLLBACK'); return res.status(err?.statusCode || 500).json({ error: err?.message || 'MBOM_LINE_UPDATE_FAILED' }); } finally { client.release(); }
  });

  router.delete('/mbom-headers/:id/lines/:lineId([0-9a-fA-F-]{36})', async (req, res, next) => {
    const context = getContext(req); const client = await pool.connect();
    try {
      await client.query('BEGIN'); await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [context.userId]);
      const current = await client.query(`SELECT l.master_id, h.lifecycle_status AS header_status FROM md_mbom_line l JOIN md_mbom_header h ON h.master_id = l.mbom_header_id WHERE l.master_id = $1 AND l.mbom_header_id = $2 FOR UPDATE`, [req.params['lineId'], req.params['id']]);
      if (!current.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'MBOM_LINE_NOT_FOUND' }); }
      if (current.rows[0].header_status === 'Released') { await client.query('ROLLBACK'); return res.status(409).json({ error: 'MBOM_RELEASED_IMMUTABLE' }); }
      await client.query(`UPDATE md_component_substitute SET lifecycle_status = 'Inactive', effective_to = NOW(), updated_by = $1, updated_at = NOW() WHERE mbom_line_id = $2 AND effective_to IS NULL`, [context.userId, req.params['lineId']]);
      await client.query(`UPDATE md_mbom_line SET lifecycle_status = 'Inactive', effective_to = NOW(), updated_by = $1, updated_at = NOW() WHERE master_id = $2`, [context.userId, req.params['lineId']]);
      await client.query(`UPDATE md_mbom_header SET structure_version = structure_version + 1, updated_by = $1, updated_at = NOW() WHERE master_id = $2`, [context.userId, req.params['id']]);
      await client.query('COMMIT'); return res.json({ deleted: true, master_id: req.params['lineId'] });
    } catch (err) { await client.query('ROLLBACK'); return next(err); } finally { client.release(); }
  });

  router.post('/mbom-headers/:id/lines/reorder', async (req, res, next) => {
    const context = getContext(req); const submitted = Array.isArray(req.body?.lines) ? req.body.lines as Array<Record<string, any>> : []; const client = await pool.connect();
    try {
      await client.query('BEGIN'); await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [context.userId]);
      const header = await client.query(`SELECT lifecycle_status, structure_version FROM md_mbom_header WHERE master_id = $1 FOR UPDATE`, [req.params['id']]);
      if (!header.rows[0]) throw Object.assign(new Error('MBOM_NOT_FOUND'), { statusCode: 404 });
      if (header.rows[0].lifecycle_status === 'Released') throw Object.assign(new Error('MBOM_RELEASED_IMMUTABLE'), { statusCode: 409 });
      const ids = submitted.map((line) => String(line.line_id));
      const current = await client.query(`SELECT master_id FROM md_mbom_line WHERE mbom_header_id = $1 AND effective_to IS NULL AND lifecycle_status NOT IN ('Inactive','Obsolete')`, [req.params['id']]);
      if (ids.length !== current.rows.length || ids.some((id) => !current.rows.some((row) => row.master_id === id))) throw Object.assign(new Error('MBOM_REORDER_LINES_INVALID'), { statusCode: 422 });
      const siblings = new Set<string>();
      for (const line of submitted) { const key = `${line.parent_line_id || 'root'}:${Number(line.seq)}`; if (siblings.has(key) || !Number.isInteger(Number(line.seq)) || Number(line.seq) <= 0) throw Object.assign(new Error('MBOM_SEQUENCE_DUPLICATE'), { statusCode: 422 }); siblings.add(key); }
      await client.query(`UPDATE md_mbom_line SET seq = -seq, updated_by = $1, updated_at = NOW() WHERE mbom_header_id = $2 AND effective_to IS NULL`, [context.userId, req.params['id']]);
      for (const line of submitted) await client.query(`UPDATE md_mbom_line SET parent_line_id = $1, seq = $2, updated_by = $3, updated_at = NOW() WHERE master_id = $4`, [line.parent_line_id || null, Number(line.seq), context.userId, line.line_id]);
      await client.query(`UPDATE md_mbom_header SET structure_version = structure_version + 1, updated_by = $1, updated_at = NOW() WHERE master_id = $2`, [context.userId, req.params['id']]);
      await client.query('COMMIT'); return res.json({ data: submitted, reordered: true });
    } catch (err: any) { await client.query('ROLLBACK'); return res.status(err?.statusCode || 500).json({ error: err?.message || 'MBOM_REORDER_FAILED' }); } finally { client.release(); }
  });

  router.post('/mbom-headers/:id/validate', async (req, res, next) => {
    try {
      const errors: Array<Record<string, string>> = [];
      const header = await pool.query(`SELECT master_id, site_id, base_quantity, base_uom_id, lifecycle_status FROM md_mbom_header WHERE master_id = $1`, [req.params['id']]);
      if (!header.rows[0]) return res.status(404).json({ error: 'MBOM_NOT_FOUND' });
      if (Number(header.rows[0].base_quantity) <= 0) errors.push({ code: 'MBOM_BASE_QUANTITY_INVALID', path: 'base_quantity', message: 'Base quantity must be greater than zero.' });
      const headerUom = await pool.query(`SELECT lifecycle_status, allow_fraction, decimal_precision FROM md_uom WHERE master_id = $1`, [header.rows[0].base_uom_id]);
      if (!headerUom.rows[0] || headerUom.rows[0].lifecycle_status !== 'Released') errors.push({ code: 'MBOM_BASE_UOM_NOT_RELEASED', path: 'base_uom_id', message: 'Base UOM must be Released.' });
      else { try { validateUomQuantity(header.rows[0].base_quantity, headerUom.rows[0]); } catch (error: any) { errors.push({ code: error.message, path: 'base_quantity', message: 'Base quantity does not match the selected UOM.' }); } }
      // A line UOM is a persisted compatibility snapshot. The authoritative
      // UOM is always the selected Item Revision base UOM.
      const lines = await pool.query(`SELECT l.*, r.lifecycle_status AS component_status, r.base_uom_id AS component_base_uom_id, u.lifecycle_status AS uom_status, u.allow_fraction, u.decimal_precision FROM md_mbom_line l JOIN md_item_revision r ON r.master_id = l.component_revision_id JOIN md_uom u ON u.master_id = r.base_uom_id WHERE l.mbom_header_id = $1 AND l.effective_to IS NULL AND l.lifecycle_status NOT IN ('Inactive','Obsolete')`, [req.params['id']]);
      if (!lines.rows.length) errors.push({ code: 'MBOM_NO_LINES', path: 'lines', message: 'At least one active MBOM line is required.' });
      const keys = new Set<string>();
      for (const line of lines.rows) {
        const sibling = `${line.parent_line_id || 'root'}:${line.seq}`;
        if (keys.has(sibling)) errors.push({ code: 'MBOM_SEQUENCE_DUPLICATE', path: `lines.${line.master_id}.seq`, message: 'Sibling sequence must be unique.' });
        keys.add(sibling);
        if (Number(line.quantity_per) <= 0) errors.push({ code: 'MBOM_LINE_QUANTITY_INVALID', path: `lines.${line.master_id}.quantity_per`, message: 'Quantity per must be greater than zero.' });
        try { validateUomQuantity(line.quantity_per, line); } catch (error: any) { errors.push({ code: error.message, path: `lines.${line.master_id}.quantity_per`, message: 'Quantity does not match the selected UOM.' }); }
        if (line.component_status !== 'Released') errors.push({ code: 'MBOM_COMPONENT_REVISION_INVALID', path: `lines.${line.master_id}.component_revision_id`, message: 'Component Revision must be Released.' });
        if (line.uom_status !== 'Released') errors.push({ code: 'MBOM_LINE_UOM_NOT_RELEASED', path: `lines.${line.master_id}.uom_id`, message: 'Line UOM must be Released.' });
        if (line.parent_line_id && !lines.rows.some((parent: any) => parent.master_id === line.parent_line_id)) errors.push({ code: 'MBOM_PARENT_LINE_INVALID', path: `lines.${line.master_id}.parent_line_id`, message: 'Parent line must belong to the same active MBOM.' });
      }
      if (errors.length) return res.status(422).json({ valid: false, errors, warnings: [] });
      return res.json({ valid: true, errors: [], warnings: [] });
    } catch (err) { return next(err); }
  });

  router.put('/mbom-headers/:id/lines/replace', async (req, res, next) => {
    const context = getContext(req); const submitted = Array.isArray(req.body?.lines) ? req.body.lines as Array<Record<string, any>> : [];
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [context.userId]);
      const header = await client.query(`SELECT master_id, lifecycle_status, structure_version FROM md_mbom_header WHERE master_id = $1 FOR UPDATE`, [req.params['id']]);
      if (!header.rows[0]) throw Object.assign(new Error('MBOM_NOT_FOUND'), { statusCode: 404 });
      if (header.rows[0].lifecycle_status === 'Released') throw Object.assign(new Error('MBOM_RELEASED_IMMUTABLE'), { statusCode: 409 });
      const expectedVersion = Number(req.body?.expected_structure_version);
      if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw Object.assign(new Error('MBOM_STRUCTURE_VERSION_REQUIRED'), { statusCode: 400 });
      if (expectedVersion !== Number(header.rows[0].structure_version)) {
        throw Object.assign(new Error(`MBOM_STRUCTURE_VERSION_CONFLICT:${header.rows[0].structure_version}`), { statusCode: 409 });
      }
      const currentLines = await client.query(`SELECT master_id, code, version_no FROM md_mbom_line WHERE mbom_header_id = $1 AND effective_to IS NULL AND lifecycle_status NOT IN ('Inactive','Obsolete')`, [req.params['id']]);
      const currentById = new Map(currentLines.rows.map((line: any) => [String(line.master_id), line]));
      const keyByInput = new Map<string, string>();
      const seenSibling = new Set<string>();
      for (const [index, line] of submitted.entries()) {
        const key = String(line.line_key || `line-${index + 1}`);
        const parentKey = line.parent_line_key ? String(line.parent_line_key) : '';
        const sibling = `${parentKey || 'root'}:${Number(line.seq)}`;
        if (seenSibling.has(sibling)) throw Object.assign(new Error('MBOM_SEQUENCE_DUPLICATE'), { statusCode: 422 });
        seenSibling.add(sibling); keyByInput.set(key, randomUUID());
      }
      await client.query(`UPDATE md_component_substitute SET lifecycle_status = 'Inactive', effective_to = NOW(), updated_by = $1, updated_at = NOW() WHERE mbom_line_id IN (SELECT master_id FROM md_mbom_line WHERE mbom_header_id = $2 AND effective_to IS NULL) AND lifecycle_status NOT IN ('Inactive','Obsolete')`, [context.userId, req.params['id']]);
      await client.query(`UPDATE md_mbom_line SET lifecycle_status = 'Inactive', effective_to = NOW(), updated_by = $1, updated_at = NOW() WHERE mbom_header_id = $2 AND effective_to IS NULL AND lifecycle_status NOT IN ('Inactive','Obsolete')`, [context.userId, req.params['id']]);
      for (const [index, line] of submitted.entries()) {
        const key = String(line.line_key || `line-${index + 1}`); const parentKey = line.parent_line_key ? String(line.parent_line_key) : null;
        if (parentKey && !keyByInput.has(parentKey)) throw Object.assign(new Error('MBOM_PARENT_LINE_INVALID'), { statusCode: 422 });
        const component = await client.query(`SELECT lifecycle_status, base_uom_id FROM md_item_revision WHERE master_id = $1`, [line.component_revision_id]);
        if (!component.rows[0] || component.rows[0].lifecycle_status !== 'Released') throw Object.assign(new Error('MBOM_COMPONENT_REVISION_INVALID'), { statusCode: 422 });
        const canonicalUomId = component.rows[0].base_uom_id;
        const uom = await client.query(`SELECT lifecycle_status, allow_fraction FROM md_uom WHERE master_id = $1`, [canonicalUomId]);
        if (!uom.rows[0] || uom.rows[0].lifecycle_status !== 'Released') throw Object.assign(new Error('MBOM_LINE_UOM_NOT_RELEASED'), { statusCode: 422 });
        if (!Number.isInteger(Number(line.seq)) || Number(line.seq) <= 0 || Number(line.quantity_per) <= 0) throw Object.assign(new Error('MBOM_LINE_NUMERIC_INVALID'), { statusCode: 422 });
        if (uom.rows[0].allow_fraction === false && !Number.isInteger(Number(line.quantity_per))) throw Object.assign(new Error('MBOM_LINE_FRACTION_NOT_ALLOWED'), { statusCode: 422 });
        if (Number(line.scrap_rate ?? 0) < 0 || Number(line.scrap_rate ?? 0) > 1) throw Object.assign(new Error('MBOM_LINE_SCRAP_INVALID'), { statusCode: 422 });
        const previous = currentById.get(key);
        const code = String(line.code || previous?.code || `MBOM-LINE-${index + 1}`);
        const nextVersion = Number(previous?.version_no || 0) + 1;
        const version = previous ? nextVersion : Number((await client.query(`SELECT COALESCE(MAX(version_no), 0) + 1 AS next_version FROM md_mbom_line WHERE code = $1`, [code])).rows[0].next_version);
        await client.query(`INSERT INTO md_mbom_line (master_id, code, name, version_no, mbom_header_id, parent_line_id, seq, component_revision_id, quantity_per, uom_id, scrap_rate, issue_operation_id, backflush_flag, phantom_flag, optional_flag, lifecycle_status, effective_from, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'Draft',NOW(),$16)`, [keyByInput.get(key), code, line.name || 'MBOM component', version, req.params['id'], parentKey ? keyByInput.get(parentKey) : null, Number(line.seq), line.component_revision_id, line.quantity_per, canonicalUomId, line.scrap_rate ?? 0, line.issue_operation_id || null, line.backflush_flag === true, line.phantom_flag === true, line.optional_flag === true, context.userId]);
      }
      await client.query(`UPDATE md_mbom_header SET structure_version = structure_version + 1, updated_by = $1, updated_at = NOW() WHERE master_id = $2`, [context.userId, req.params['id']]);
      await client.query('COMMIT');
      return res.json({ data: { mbom_id: req.params['id'], line_count: submitted.length, structure_version: Number(header.rows[0].structure_version) + 1 }, replaced: true });
    } catch (err: any) {
      await client.query('ROLLBACK');
      const message = String(err?.message || 'MBOM_LINE_REPLACEMENT_FAILED');
      if (message.startsWith('MBOM_STRUCTURE_VERSION_CONFLICT:')) return res.status(409).json({ error: 'MBOM_STRUCTURE_VERSION_CONFLICT', latest_structure_version: Number(message.split(':')[1]) });
      return res.status(err?.statusCode || 500).json({ error: message });
    } finally { client.release(); }
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
    if (table.tableName === 'md_shopfloor') normalizeShopfloorPayload(body);
    if (table.tableName === 'md_item_revision' && (body['material_group_id'] !== undefined || body['item_group'] !== undefined)) {
      const materialGroup = await pool.query(`SELECT master_id, code FROM md_material_group WHERE master_id = $1 OR UPPER(code) = UPPER($2)`, [body['material_group_id'] || null, body['item_group'] || null]);
      if (!materialGroup.rows[0]) return res.status(422).json({ error: 'MATERIAL_GROUP_REQUIRED' });
      body['material_group_id'] = materialGroup.rows[0].master_id;
      body['item_group'] = materialGroup.rows[0].code;
    }
    validateEngineeringMetadata(table, body, true);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [context.userId]);
      if (['md_item', 'md_item_revision'].includes(table.tableName) && body['base_uom_id']) {
        const uom = await client.query(`SELECT master_id FROM md_uom WHERE master_id = $1 AND lifecycle_status = 'Released'`, [body['base_uom_id']]);
        if (!uom.rows[0]) throw Object.assign(new Error('UOM_NOT_RELEASED'), { statusCode: 422 });
      }
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
      if (table.tableName === 'md_production_version') {
        // Production Version codes are backend-owned, just like Routing and
        // Work Order numbers. The form intentionally does not accept an
        // authoritative code, so allocate one atomically before insertion.
        body['code'] = await allocateResourceCode(client, 'PV');
        const nameI18n = body['name_i18n'] || body['name'];
        if (nameI18n !== undefined && !isProductionVersionNameValid(nameI18n)) throw Object.assign(new Error('PRODUCTION_VERSION_NAME_INVALID'), { statusCode: 422 });
        body['name_i18n'] = nameI18n || await defaultProductionVersionName(client, String(body['item_revision_id'] || ''), String(body['code']));
        body['name'] = String((body['name_i18n'] as Record<string, unknown>).en || (body['name_i18n'] as Record<string, unknown>).vi || body['code']);
        const outputItem = await client.query(`SELECT i.item_type, i.lifecycle_status AS item_lifecycle_status, r.lifecycle_status AS revision_lifecycle_status FROM md_item_revision r JOIN md_item i ON i.master_id = r.item_id WHERE r.master_id = $1`, [body['item_revision_id']]);
        if (!outputItem.rows[0] || outputItem.rows[0].item_lifecycle_status !== 'Released' || outputItem.rows[0].revision_lifecycle_status !== 'Released') throw Object.assign(new Error('PRODUCTION_VERSION_ITEM_REVISION_INVALID'), { statusCode: 422 });
        if (outputItem.rows[0].item_type === 'RM') throw Object.assign(new Error('MBOM_OUTPUT_RAW_MATERIAL'), { statusCode: 422 });
        if (body['min_lot_size'] !== undefined && Number(body['min_lot_size']) <= 0) throw Object.assign(new Error('PRODUCTION_VERSION_LOT_SIZE_INVALID'), { statusCode: 422 });
        if (body['max_lot_size'] !== undefined && body['max_lot_size'] !== null && Number(body['max_lot_size']) < Number(body['min_lot_size'] || 0)) throw Object.assign(new Error('PRODUCTION_VERSION_LOT_SIZE_INVALID'), { statusCode: 422 });
        if (body['ebom_header_id']) {
          const ebom = await client.query(`SELECT item_revision_id, lifecycle_status FROM md_ebom_header WHERE master_id = $1 AND lifecycle_status = 'Released' AND effective_from <= NOW() AND (effective_to IS NULL OR effective_to > NOW())`, [body['ebom_header_id']]);
          if (!ebom.rows[0]) throw Object.assign(new Error('PRODUCTION_VERSION_EBOM_INVALID'), { statusCode: 422 });
          if (String(ebom.rows[0].item_revision_id) !== String(body['item_revision_id'])) throw Object.assign(new Error('PRODUCTION_VERSION_EBOM_REVISION_MISMATCH'), { statusCode: 422 });
        }
        body['site_id'] = await resolveProductionVersionSite(client, String(body['item_revision_id'] || ''), String(body['mbom_header_id'] || ''), String(body['routing_header_id'] || ''));
      }

      if (table.tableName === 'md_mbom_header') {
        await validateStructureOwner(client, table.tableName, body['item_revision_id']);
        if (!localizedTextSchema.safeParse(body['name']).success) throw Object.assign(new Error('MBOM_NAME_REQUIRED'), { statusCode: 422 });
        if (!body['site_id']) throw Object.assign(new Error('MBOM_SITE_REQUIRED'), { statusCode: 422 });
        if (!body['base_uom_id']) throw Object.assign(new Error('MBOM_BASE_UOM_REQUIRED'), { statusCode: 422 });
        if (!Number.isFinite(Number(body['base_quantity'])) || Number(body['base_quantity']) <= 0) throw Object.assign(new Error('MBOM_BASE_QUANTITY_INVALID'), { statusCode: 422 });
        const site = await client.query(`SELECT 1 FROM md_site WHERE master_id = $1 AND lifecycle_status NOT IN ('Inactive','Obsolete')`, [body['site_id']]);
        if (!site.rows[0]) throw Object.assign(new Error('MBOM_SITE_INVALID'), { statusCode: 422 });
        const uom = await client.query(`SELECT master_id, lifecycle_status, allow_fraction, decimal_precision FROM md_uom WHERE master_id = $1`, [body['base_uom_id']]);
        if (!uom.rows[0]) throw Object.assign(new Error('MBOM_BASE_UOM_NOT_RELEASED'), { statusCode: 422 });
        if (uom.rows[0].lifecycle_status !== 'Released') throw Object.assign(new Error('MBOM_BASE_UOM_NOT_RELEASED'), { statusCode: 422 });
        validateUomQuantity(body['base_quantity'], uom.rows[0]);
      }
      if (table.tableName === 'md_routing_header') {
        await validateStructureOwner(client, table.tableName, body['item_revision_id']);
      }
      if (table.tableName === 'md_mbom_line') {
        // Line codes are backend-owned. The editor does not expose this
        // technical identity, so never pass a missing form value through to
        // the NOT NULL database column.
        body['code'] = body['code'] || await allocateResourceCode(client, 'MBOM-LINE');
        // The current console derives the display name from the component
        // revision and intentionally does not ask the user for a second name.
        // Keep the persisted technical name non-null for legacy schema
        // compatibility while preserving an explicitly supplied value.
        body['name'] = body['name'] || body['code'];
        const missingRequiredFields = ['mbom_header_id', 'component_revision_id'].filter((field) => body[field] === undefined || body[field] === null || String(body[field]).trim() === '');
        if (missingRequiredFields.length) throw Object.assign(new Error(`MBOM_LINE_REQUIRED_FIELDS:${missingRequiredFields.join(',')}`), { statusCode: 422 });
        if (!Number.isInteger(Number(body['seq'])) || Number(body['seq']) <= 0) throw Object.assign(new Error('MBOM_LINE_SEQUENCE_INVALID'), { statusCode: 422 });
        if (!Number.isFinite(Number(body['quantity_per'])) || Number(body['quantity_per']) <= 0) throw Object.assign(new Error('MBOM_LINE_QUANTITY_INVALID'), { statusCode: 422 });
        if (Number(body['scrap_rate'] ?? 0) < 0 || Number(body['scrap_rate'] ?? 0) > 1) throw Object.assign(new Error('MBOM_LINE_SCRAP_INVALID'), { statusCode: 422 });
        if ((body['effective_from'] && Number.isNaN(new Date(String(body['effective_from'])).getTime())) || (body['effective_to'] && Number.isNaN(new Date(String(body['effective_to'])).getTime())) || (body['effective_from'] && body['effective_to'] && new Date(String(body['effective_to'])) <= new Date(String(body['effective_from'])))) throw Object.assign(new Error('MBOM_LINE_EFFECTIVE_DATES_INVALID'), { statusCode: 422 });
        const header = await client.query(`SELECT lifecycle_status FROM md_mbom_header WHERE master_id = $1 FOR SHARE`, [body['mbom_header_id']]);
        if (!header.rows[0]) throw Object.assign(new Error('MBOM_NOT_FOUND'), { statusCode: 404 });
        if (header.rows[0].lifecycle_status === 'Released') throw Object.assign(new Error('MBOM_RELEASED_IMMUTABLE'), { statusCode: 409 });
        const component = await client.query(`SELECT lifecycle_status, base_uom_id FROM md_item_revision WHERE master_id = $1 AND effective_from <= NOW() AND (effective_to IS NULL OR effective_to > NOW())`, [body['component_revision_id']]);
        if (!component.rows[0] || component.rows[0].lifecycle_status !== 'Released') throw Object.assign(new Error('MBOM_COMPONENT_REVISION_INVALID'), { statusCode: 422 });
        body['uom_id'] = component.rows[0].base_uom_id;
        const uom = await client.query(`SELECT lifecycle_status, allow_fraction, decimal_precision FROM md_uom WHERE master_id = $1`, [body['uom_id']]);
        if (!uom.rows[0] || uom.rows[0].lifecycle_status !== 'Released') throw Object.assign(new Error('MBOM_LINE_UOM_NOT_RELEASED'), { statusCode: 422 });
        validateUomQuantity(body['quantity_per'], uom.rows[0]);
        if (body['parent_line_id']) {
          const parent = await client.query(`SELECT mbom_header_id FROM md_mbom_line WHERE master_id = $1 AND effective_to IS NULL AND lifecycle_status NOT IN ('Inactive','Obsolete')`, [body['parent_line_id']]);
          if (!parent.rows[0] || parent.rows[0].mbom_header_id !== body['mbom_header_id']) throw Object.assign(new Error('MBOM_PARENT_LINE_INVALID'), { statusCode: 422 });
          if (String(body['parent_line_id']) === String(body['master_id'] || '')) throw Object.assign(new Error('MBOM_LINE_SELF_PARENT'), { statusCode: 422 });
        }
        if (body['issue_operation_id']) {
          const operation = await client.query(`SELECT lifecycle_status FROM md_operation WHERE master_id = $1`, [body['issue_operation_id']]);
          if (!operation.rows[0] || ['Inactive', 'Obsolete'].includes(String(operation.rows[0].lifecycle_status))) throw Object.assign(new Error('MBOM_ISSUE_OPERATION_INVALID'), { statusCode: 422 });
        }
        body['optional_flag'] = body['optional_flag'] === true;
      }
      if (table.tableName === 'md_component_substitute') {
        if (!body['mbom_line_id'] || !body['substitute_revision_id']) throw Object.assign(new Error('MBOM_SUBSTITUTE_REQUIRED_FIELDS'), { statusCode: 422 });
        if (Number(body['priority'] ?? 1) <= 0 || !Number.isInteger(Number(body['priority'] ?? 1))) throw Object.assign(new Error('MBOM_SUBSTITUTE_PRIORITY_INVALID'), { statusCode: 422 });
        if (Number(body['conversion_factor'] ?? 1) <= 0) throw Object.assign(new Error('MBOM_SUBSTITUTE_CONVERSION_INVALID'), { statusCode: 422 });
        if (Number(body['max_usage_percent'] ?? 100) <= 0 || Number(body['max_usage_percent'] ?? 100) > 100) throw Object.assign(new Error('MBOM_SUBSTITUTE_MAX_USAGE_INVALID'), { statusCode: 422 });
        const source = await client.query(`SELECT l.component_revision_id, l.uom_id, h.lifecycle_status, i.item_group AS component_group FROM md_mbom_line l JOIN md_mbom_header h ON h.master_id = l.mbom_header_id JOIN md_item_revision cr ON cr.master_id = l.component_revision_id JOIN md_item i ON i.master_id = cr.item_id WHERE l.master_id = $1`, [body['mbom_line_id']]);
        if (!source.rows[0]) throw Object.assign(new Error('MBOM_LINE_NOT_FOUND'), { statusCode: 404 });
        if (source.rows[0].lifecycle_status === 'Released') throw Object.assign(new Error('MBOM_RELEASED_IMMUTABLE'), { statusCode: 409 });
        if (String(source.rows[0].component_revision_id) === String(body['substitute_revision_id'])) throw Object.assign(new Error('MBOM_SUBSTITUTE_SAME_AS_COMPONENT'), { statusCode: 422 });
        const substitute = await client.query(`SELECT lifecycle_status FROM md_item_revision WHERE master_id = $1 AND effective_from <= NOW() AND (effective_to IS NULL OR effective_to > NOW())`, [body['substitute_revision_id']]);
        if (!substitute.rows[0] || ['Inactive', 'Obsolete'].includes(String(substitute.rows[0].lifecycle_status))) throw Object.assign(new Error('MBOM_SUBSTITUTE_REVISION_INVALID'), { statusCode: 422 });
        const substituteContext = await client.query(`SELECT i.item_group, r.base_uom_id FROM md_item_revision r JOIN md_item i ON i.master_id = r.item_id WHERE r.master_id = $1`, [body['substitute_revision_id']]);
        const sameGroup = substituteContext.rows[0]?.item_group === source.rows[0].component_group;
        const sameUom = substituteContext.rows[0]?.base_uom_id === source.rows[0].uom_id;
        const conversion = await client.query(`SELECT 1 FROM md_uom_conversion WHERE ((from_uom_id = $1 AND to_uom_id = $2) OR (from_uom_id = $2 AND to_uom_id = $1)) AND lifecycle_status = 'Released' AND effective_to IS NULL`, [source.rows[0].uom_id, substituteContext.rows[0]?.base_uom_id]);
        const exception = body['compatibility_exception_approved'] === true && String(body['compatibility_exception_reason'] || '').trim();
        if ((!sameGroup || (!sameUom && !conversion.rows[0])) && !exception) throw Object.assign(new Error('MBOM_SUBSTITUTE_COMPATIBILITY_INVALID'), { statusCode: 422 });
        body['conversion_factor'] = body['conversion_factor'] ?? 1;
        body['max_usage_percent'] = body['max_usage_percent'] ?? 100;
        body['requires_approval'] = body['requires_approval'] === true;
        body['compatibility_exception_approved'] = Boolean(exception);
        body['approval_status'] = body['requires_approval'] ? 'Pending' : 'NotRequired';
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
        if (!body['routing_operation_id'] || !body['work_center_id']) throw Object.assign(new Error('PRODUCTION_STANDARD_REQUIRED_FIELDS'), { statusCode: 422 });
        if (Number(body['base_quantity'] || 1) <= 0 || Number(body['setup_time_min'] || 0) < 0 || Number(body['cycle_time_sec']) <= 0 || Number(body['labor_count'] || 1) <= 0 || Number(body['standard_yield'] || 1) <= 0 || Number(body['efficiency_factor'] || 1) <= 0) throw Object.assign(new Error('PRODUCTION_STANDARD_NUMERIC_RULE_INVALID'), { statusCode: 422 });
        const operation = await client.query(`SELECT ro.operation_id, ro.work_center_id, wc.site_id FROM md_routing_operation ro JOIN md_work_center wc ON wc.master_id = ro.work_center_id WHERE ro.master_id = $1`, [body['routing_operation_id']]);
        if (!operation.rows[0] || operation.rows[0].work_center_id !== body['work_center_id'] || (body['site_id'] && operation.rows[0].site_id !== body['site_id'])) throw Object.assign(new Error('PRODUCTION_STANDARD_ROUTING_CONTEXT_INVALID'), { statusCode: 422 });
        body['operation_id'] = body['operation_id'] || operation.rows[0].operation_id;
        body['site_id'] = body['site_id'] || operation.rows[0].site_id;
        if (body['equipment_id']) {
          const equipmentEligibility = await client.query(`
            SELECT 1 FROM md_resource_assignment ra JOIN md_equipment eq ON eq.master_id = ra.equipment_id
            WHERE ra.work_center_id = $1 AND ra.equipment_id = $2 AND ra.scheduling_flag = TRUE AND eq.planning_resource_flag = TRUE
              AND eq.active_flag = TRUE AND eq.execution_status = 'Available'
              AND tstzrange(ra.effective_from, COALESCE(ra.effective_to, 'infinity'::timestamptz), '[)') && tstzrange($3::timestamptz, COALESCE($4::timestamptz, 'infinity'::timestamptz), '[)')`, [body['work_center_id'], body['equipment_id'], body['valid_from'] || body['effective_from'] || new Date().toISOString(), body['valid_to'] || null]);
          if (!equipmentEligibility.rows[0]) throw Object.assign(new Error('PRODUCTION_STANDARD_EQUIPMENT_ASSIGNMENT_INVALID'), { statusCode: 422 });
          if (body['item_revision_id']) {
            const capability = await client.query(`SELECT 1 FROM md_resource_capability WHERE site_id = $1 AND operation_id = $2 AND work_center_id = $3 AND (equipment_id = $4 OR equipment_id IS NULL) AND product_revision_id = $5 AND eligibility = TRUE AND active_flag = TRUE`, [body['site_id'], body['operation_id'], body['work_center_id'], body['equipment_id'], body['item_revision_id']]);
            if (!capability.rows[0]) throw Object.assign(new Error('PRODUCTION_STANDARD_EQUIPMENT_CAPABILITY_REQUIRED'), { statusCode: 422 });
          }
        }
        body['valid_from'] = body['valid_from'] || body['effective_from'] || new Date().toISOString();
      }
      if (table.tableName === 'md_operation_skill_requirement') {
        const operation = await client.query(`SELECT ro.operation_id, wc.site_id FROM md_routing_operation ro JOIN md_work_center wc ON wc.master_id = ro.work_center_id WHERE ro.master_id = $1`, [body['routing_operation_id']]);
        if (!operation.rows[0] || !body['skill_id']) throw Object.assign(new Error('OPERATION_SKILL_ROUTING_REQUIRED'), { statusCode: 422 });
        const skill = await client.query(`SELECT scope FROM md_skill WHERE master_id = $1 AND lifecycle_status NOT IN ('Inactive','Obsolete')`, [body['skill_id']]);
        if (!skill.rows[0]) throw Object.assign(new Error('OPERATION_SKILL_INACTIVE'), { statusCode: 422 });
        if (skill.rows[0].scope !== 'Employee') throw Object.assign(new Error('OPERATION_WORKER_SKILL_SCOPE_INVALID'), { statusCode: 422 });
        body['operation_id'] = operation.rows[0].operation_id;
        body['site_id'] = body['site_id'] || operation.rows[0].site_id;
        if (body['minimum_level'] !== undefined && !WORKER_SKILL_LEVELS.has(String(body['minimum_level']))) throw Object.assign(new Error('OPERATION_WORKER_SKILL_LEVEL_INVALID'), { statusCode: 422 });
        if (Number(body['required_persons'] || 1) <= 0) throw Object.assign(new Error('OPERATION_SKILL_REQUIRED_PERSONS_INVALID'), { statusCode: 422 });
        if ((body['effective_from'] && Number.isNaN(new Date(String(body['effective_from'])).getTime())) || (body['effective_to'] && Number.isNaN(new Date(String(body['effective_to'])).getTime())) || (body['effective_from'] && body['effective_to'] && new Date(String(body['effective_to'])) <= new Date(String(body['effective_from'])))) throw Object.assign(new Error('OPERATION_WORKER_SKILL_EFFECTIVE_DATES_INVALID'), { statusCode: 422 });
      }
      if (table.tableName === 'md_routing_operation') {
        const operation = await client.query(`SELECT lifecycle_status FROM md_operation WHERE master_id = $1`, [body['operation_id']]);
        if (!operation.rows[0] || ['Inactive', 'Obsolete'].includes(String(operation.rows[0].lifecycle_status))) throw Object.assign(new Error('ROUTING_OPERATION_INACTIVE'), { statusCode: 422 });
        const workCenter = await client.query(`SELECT 1 FROM md_work_center WHERE master_id = $1 AND active_flag = TRUE AND lifecycle_status NOT IN ('Inactive', 'Obsolete')`, [body['work_center_id']]);
        if (!workCenter.rows[0]) throw Object.assign(new Error('ROUTING_WORK_CENTER_INVALID'), { statusCode: 422 });
      }
      const record: Record<string, unknown> = {
        ...body,
        effective_from: body['effective_from'] ?? new Date(),
        created_by: context.userId,
      };
      // HTML date inputs submit an empty optional date as "". PostgreSQL
      // timestamptz columns require NULL for an open-ended effective period.
      for (const dateColumn of ['effective_to', 'valid_to', 'available_to']) {
        if (record[dateColumn] === '') record[dateColumn] = null;
      }
      if (table.tableName === 'md_mbom_line' && record['parent_line_id'] === '') record['parent_line_id'] = null;
      if (table.tableName === 'md_shopfloor' && !record['master_id']) record['master_id'] = randomUUID();
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
          await client.query(`INSERT INTO md_machine_unit (machine_id, code, unit_sequence, lifecycle_status, physical_identity_status, planning_resource_flag, execution_status, active_flag) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [rows[0]['master_id'], `${rows[0]['code']}-${String(unitSequence).padStart(2, '0')}`, unitSequence, 'Draft', 'PendingIdentification', false, rows[0]['execution_status'] || 'Available', rows[0]['active_flag'] !== false]);
        }
      }
      if (table.tableName === 'md_workstation' && Array.isArray(machineGroups)) {
        await persistMachineGroups(client, String(rows[0]['master_id']), machineGroups, context);
      } else if (table.tableName === 'md_workstation' && machineId) {
        const machine = await client.query(`SELECT site_id, active_flag, execution_status FROM md_equipment WHERE master_id = $1 FOR UPDATE`, [machineId]);
        if (!machine.rows[0] || machine.rows[0].site_id !== record['site_id'] || machine.rows[0].active_flag !== true || machine.rows[0].execution_status === 'OutOfService') throw Object.assign(new Error('MACHINE_ASSIGNMENT_INVALID'), { statusCode: 422 });
        await persistMachineGroups(client, String(rows[0]['master_id']), [{ name: { vi: 'Nhóm máy mặc định', en: 'Default machine group', ja: '既定のマシングループ', ko: '기본 머신 그룹' }, primary_machine_id: machineId, minimum_required_machines: 1, effective_from: record['effective_from'] }], context);
      }
      if (table.tableName === 'md_mbom_line') {
        await client.query(`UPDATE md_mbom_header SET structure_version = structure_version + 1, updated_by = $1, updated_at = NOW() WHERE master_id = $2`, [context.userId, body['mbom_header_id']]);
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
      if (err?.code === '23505' && table.tableName === 'md_mbom_line') return res.status(409).json({ error: 'MBOM_SEQUENCE_DUPLICATE', message: 'The sibling sequence is already used in this MBOM.' });
      if (err?.code === '23502' && table.tableName === 'md_mbom_line') return res.status(422).json({ error: 'MBOM_LINE_REQUIRED_FIELDS', message: 'The MBOM line is missing a required field.' });
      if (err?.code === '23505' && table.tableName === 'md_component_substitute') return res.status(409).json({ error: 'MBOM_SUBSTITUTE_DUPLICATE', message: 'The substitute or priority is already active for this MBOM line.' });
      return next(err);
    } finally {
      client.release();
    }
  });

  router.put('/items/:id', async (req, res, next) => {
    const context = getContext(req);
    const body = normalizeBody(req.body);
    const specificationFields = ['name', 'item_group', 'material_group_id', 'base_uom_id', 'planning_strategy', 'tracking_level', 'default_scrap_rate', 'specification_ref'];
    const hasSpecificationChange = Object.keys(body).some((field) => specificationFields.includes(field));
    if (body['name'] !== undefined && !localizedTextSchema.safeParse(body['name']).success) return res.status(422).json({ error: 'ITEM_NAME_INVALID' });
    if (body['lifecycle_status'] !== undefined && !['Draft', 'InReview', 'Released', 'Inactive', 'Obsolete'].includes(String(body['lifecycle_status']))) return res.status(422).json({ error: 'ITEM_LIFECYCLE_STATUS_INVALID' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [context.userId]);
      const itemResult = await client.query(`SELECT * FROM md_item WHERE master_id = $1 FOR UPDATE`, [req.params['id']]);
      if (!itemResult.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'ITEM_NOT_FOUND' }); }
      const currentRevisionResult = await client.query(`SELECT * FROM md_item_revision WHERE item_id = $1 ORDER BY version_no DESC LIMIT 1 FOR UPDATE`, [req.params['id']]);
      const currentRevision = currentRevisionResult.rows[0] as Record<string, unknown> | undefined;
      if (hasSpecificationChange && currentRevision?.lifecycle_status === 'Released') {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'ITEM_RELEASED_SPEC_IMMUTABLE_USE_NEW_REVISION' });
      }
      if (body['base_uom_id']) {
        const uom = await client.query(`SELECT master_id FROM md_uom WHERE master_id = $1 AND lifecycle_status = 'Released'`, [body['base_uom_id']]);
        if (!uom.rows[0]) { await client.query('ROLLBACK'); return res.status(422).json({ error: 'UOM_NOT_RELEASED' }); }
      }
      if (body['material_group_id'] !== undefined || body['item_group'] !== undefined) {
        const materialGroup = await client.query(`SELECT master_id, code FROM md_material_group WHERE master_id = $1 OR UPPER(code) = UPPER($2)`, [body['material_group_id'] || null, body['item_group'] || null]);
        if (!materialGroup.rows[0]) { await client.query('ROLLBACK'); return res.status(422).json({ error: 'MATERIAL_GROUP_REQUIRED' }); }
        body['material_group_id'] = materialGroup.rows[0].master_id;
        body['item_group'] = materialGroup.rows[0].code;
      }
      const itemColumns = ['name', 'item_group', 'material_group_id', 'base_uom_id', 'item_type', 'lifecycle_status'].filter((column) => body[column] !== undefined);
      const itemValues = itemColumns.map((column) => column === 'name' ? JSON.stringify(body[column]) : body[column]);
      if (itemColumns.length) {
        const sets = itemColumns.map((column, index) => `${column} = $${index + 1}${column === 'name' ? '::jsonb' : ''}`);
        await client.query(`UPDATE md_item SET ${sets.join(', ')}, updated_by = $${itemColumns.length + 1}, updated_at = NOW() WHERE master_id = $${itemColumns.length + 2}`, [...itemValues, context.userId, req.params['id']]);
      }
      if (hasSpecificationChange && currentRevision) {
        const revisionColumns = specificationFields.filter((column) => body[column] !== undefined);
        const revisionValues = revisionColumns.map((column) => column === 'name' ? JSON.stringify(body[column]) : body[column]);
        const sets = revisionColumns.map((column, index) => `${column} = $${index + 1}${column === 'name' ? '::jsonb' : ''}`);
        await client.query(`UPDATE md_item_revision SET ${sets.join(', ')}, updated_by = $${revisionColumns.length + 1}, updated_at = NOW() WHERE master_id = $${revisionColumns.length + 2}`, [...revisionValues, context.userId, currentRevision.master_id]);
      }
      const updated = await client.query(`SELECT * FROM md_item WHERE master_id = $1`, [req.params['id']]);
      await client.query('COMMIT');
      return res.json({ data: updated.rows[0], revision_updated: hasSpecificationChange && Boolean(currentRevision) });
    } catch (err) { await client.query('ROLLBACK'); return next(err); } finally { client.release(); }
  });

  router.put('/uoms/:id', async (req, res, next) => {
    const context = getContext(req);
    try {
      const body = validateUomPayload(normalizeBody(req.body), true);
      if (body['code'] !== undefined) {
        const current = await pool.query('SELECT code FROM md_uom WHERE master_id = $1', [req.params['id']]);
        if (!current.rows[0]) return res.status(404).json({ error: 'UOM_NOT_FOUND' });
        if (String(body['code']) !== String(current.rows[0].code)) return res.status(409).json({ error: 'UOM_CODE_IMMUTABLE' });
        delete body['code'];
      }
      const usage = await getUomUsage(pool, req.params['id']);
      const current = await pool.query('SELECT * FROM md_uom WHERE master_id = $1', [req.params['id']]);
      if (!current.rows[0]) return res.status(404).json({ error: 'UOM_NOT_FOUND' });
      if (usage.total > 0 && body['uom_class'] !== undefined && body['uom_class'] !== current.rows[0].uom_class) return res.status(409).json({ error: 'UOM_TYPE_USED_IMMUTABLE' });
      delete body['master_id']; delete body['version_no']; delete body['created_by'];
      const allowed = ['name', 'description', 'uom_class', 'decimal_precision', 'allow_fraction', 'lifecycle_status'];
      const columns = Object.keys(body).filter((column) => allowed.includes(column));
      if (!columns.length) return res.status(400).json({ error: 'No update fields provided' });
      const values = columns.map((column) => ['name', 'description'].includes(column) ? JSON.stringify(body[column]) : body[column]);
      const sets = columns.map((column, index) => `${column} = $${index + 1}${['name', 'description'].includes(column) ? '::jsonb' : ''}`);
      const { rows } = await pool.query(`UPDATE md_uom SET ${sets.join(', ')}, updated_by = $${columns.length + 1}, updated_at = NOW() WHERE master_id = $${columns.length + 2} RETURNING *`, [...values, context.userId, req.params['id']]);
      if (!rows[0]) return res.status(404).json({ error: 'UOM_NOT_FOUND' });
      return res.json(rows[0]);
    } catch (err) { return next(err); }
  });

  router.delete('/uoms/:id', async (req, res, next) => {
    try {
      const usage = await getUomUsage(pool, req.params['id']);
      if (usage.total > 0) return res.status(409).json({ error: 'UOM_IN_USE', usage });
      const result = await pool.query('DELETE FROM md_uom WHERE master_id = $1 RETURNING master_id', [req.params['id']]);
      if (!result.rows[0]) return res.status(404).json({ error: 'UOM_NOT_FOUND' });
      return res.status(204).send();
    } catch (err) { return next(err); }
  });

  router.put('/:resource/:id', async (req, res, next) => {
    const table = requireTable(req.params['resource'] ?? '');
    const context = getContext(req);
    const body = normalizeLocalizedFields(table, normalizeBody(req.body));
    if (table.tableName === 'md_shopfloor') normalizeShopfloorPayload(body);
    if (table.tableName === 'md_production_version') {
      if (body['name_i18n'] !== undefined && !isProductionVersionNameValid(body['name_i18n'])) return res.status(422).json({ error: 'PRODUCTION_VERSION_NAME_INVALID' });
      delete body['code'];
      if (body['min_lot_size'] !== undefined && Number(body['min_lot_size']) <= 0) return res.status(422).json({ error: 'PRODUCTION_VERSION_LOT_SIZE_INVALID' });
      if (body['max_lot_size'] !== undefined && body['max_lot_size'] !== null && Number(body['max_lot_size']) < Number(body['min_lot_size'] || 0)) return res.status(422).json({ error: 'PRODUCTION_VERSION_LOT_SIZE_INVALID' });
      const current = await pool.query(`SELECT item_revision_id, ebom_header_id, mbom_header_id, routing_header_id FROM md_production_version WHERE master_id = $1`, [req.params['id']]);
      if (!current.rows[0]) return res.status(404).json({ error: 'Not Found' });
      const itemRevisionId = body['item_revision_id'] || current.rows[0].item_revision_id;
      const mbomHeaderId = body['mbom_header_id'] || current.rows[0].mbom_header_id;
      const routingHeaderId = body['routing_header_id'] || current.rows[0].routing_header_id;
      const ebomHeaderId = body['ebom_header_id'] || current.rows[0].ebom_header_id;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        if (ebomHeaderId) {
          const ebom = await client.query(`SELECT item_revision_id, lifecycle_status FROM md_ebom_header WHERE master_id = $1 AND lifecycle_status = 'Released' AND effective_from <= NOW() AND (effective_to IS NULL OR effective_to > NOW())`, [ebomHeaderId]);
          if (!ebom.rows[0]) throw Object.assign(new Error('PRODUCTION_VERSION_EBOM_INVALID'), { statusCode: 422 });
          if (String(ebom.rows[0].item_revision_id) !== String(itemRevisionId)) throw Object.assign(new Error('PRODUCTION_VERSION_EBOM_REVISION_MISMATCH'), { statusCode: 422 });
        }
        body['site_id'] = await resolveProductionVersionSite(client, String(itemRevisionId), String(mbomHeaderId), String(routingHeaderId));
        await client.query('COMMIT');
      } catch (error: any) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(error?.statusCode || 422).json({ error: error?.message || 'PRODUCTION_VERSION_INVALID' });
      }
      client.release();
    }
    if (table.protectedAfterRelease) {
      const released = await pool.query(`SELECT lifecycle_status FROM ${table.tableName} WHERE master_id = $1`, [req.params['id']]);
      if (released.rows[0]?.lifecycle_status === 'Released') return res.status(409).json({ error: table.tableName.startsWith('md_ebom') ? 'EBOM_RELEASED_IMMUTABLE' : 'RELEASED_RECORD_IMMUTABLE' });
    }
    if (table.tableName === 'md_routing_operation') {
      const parent = await pool.query(`SELECT rh.lifecycle_status FROM md_routing_operation ro JOIN md_routing_header rh ON rh.master_id = ro.routing_header_id WHERE ro.master_id = $1`, [req.params['id']]);
      if (parent.rows[0]?.lifecycle_status === 'Released') return res.status(409).json({ error: 'ROUTING_RELEASED_IMMUTABLE', message: 'Released Routings cannot be edited; create a new Routing version.' });
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
    if (table.tableName === 'md_mbom_header' || table.tableName === 'md_routing_header') {
      const current = await pool.query(`SELECT item_revision_id, lifecycle_status FROM ${table.tableName} WHERE master_id = $1`, [req.params['id']]);
      if (!current.rows[0]) return res.status(404).json({ error: 'STRUCTURE_NOT_FOUND' });
      if (current.rows[0].lifecycle_status === 'Released' && body['item_revision_id'] !== undefined && String(body['item_revision_id']) !== String(current.rows[0].item_revision_id)) return res.status(409).json({ error: table.tableName === 'md_mbom_header' ? 'RELEASED_MBOM_IMMUTABLE' : 'RELEASED_ROUTING_IMMUTABLE' });
      if (body['item_revision_id'] !== undefined) await validateStructureOwner(pool, table.tableName, body['item_revision_id']);
    }
    if (table.tableName === 'md_operation') {
      delete body['code']; delete body['version_no'];
      // md_operation uses the shared lifecycle_status column; active_flag is a legacy client field.
      delete body['active_flag'];
      if (body['operation_type'] !== undefined && !['Production', 'Inspection', 'Packing', 'Handling'].includes(String(body['operation_type']))) return res.status(422).json({ error: 'OPERATION_TYPE_INVALID' });
      if (body['confirmation_mode'] !== undefined && !['StartFinish', 'QuantityOnly', 'Auto'].includes(String(body['confirmation_mode']))) return res.status(422).json({ error: 'OPERATION_CONFIRMATION_MODE_INVALID' });
      if (body['quantity_reporting'] !== undefined && !['GoodOnly', 'GoodScrap'].includes(String(body['quantity_reporting']))) return res.status(422).json({ error: 'OPERATION_QUANTITY_REPORTING_INVALID' });
    }
    if (table.tableName === 'md_operation_skill_requirement') {
      const current = await pool.query(`SELECT routing_operation_id, skill_id, effective_from, effective_to FROM md_operation_skill_requirement WHERE master_id = $1`, [req.params['id']]);
      if (!current.rows[0]) return res.status(404).json({ error: 'Not Found' });
      const routingOperationId = body['routing_operation_id'] || current.rows[0].routing_operation_id;
      const skillId = body['skill_id'] || current.rows[0].skill_id;
      const operation = await pool.query(`SELECT ro.operation_id, wc.site_id FROM md_routing_operation ro JOIN md_work_center wc ON wc.master_id = ro.work_center_id WHERE ro.master_id = $1`, [routingOperationId]);
      if (!operation.rows[0] || !skillId) return res.status(422).json({ error: 'OPERATION_SKILL_ROUTING_REQUIRED' });
      const skill = await pool.query(`SELECT scope FROM md_skill WHERE master_id = $1 AND lifecycle_status NOT IN ('Inactive','Obsolete')`, [skillId]);
      if (!skill.rows[0]) return res.status(422).json({ error: 'OPERATION_SKILL_INACTIVE' });
      if (skill.rows[0].scope !== 'Employee') return res.status(422).json({ error: 'OPERATION_WORKER_SKILL_SCOPE_INVALID' });
      body['operation_id'] = operation.rows[0].operation_id;
      body['site_id'] = body['site_id'] || operation.rows[0].site_id;
      if (body['minimum_level'] !== undefined && !WORKER_SKILL_LEVELS.has(String(body['minimum_level']))) return res.status(422).json({ error: 'OPERATION_WORKER_SKILL_LEVEL_INVALID' });
      if (body['required_persons'] !== undefined && Number(body['required_persons']) <= 0) return res.status(422).json({ error: 'OPERATION_SKILL_REQUIRED_PERSONS_INVALID' });
      const from = new Date(String(body['effective_from'] || current.rows[0].effective_from || new Date().toISOString()));
      const to = body['effective_to'] !== undefined ? (body['effective_to'] ? new Date(String(body['effective_to'])) : null) : (current.rows[0].effective_to ? new Date(String(current.rows[0].effective_to)) : null);
      if (Number.isNaN(from.getTime()) || (to && (Number.isNaN(to.getTime()) || to <= from))) return res.status(422).json({ error: 'OPERATION_WORKER_SKILL_EFFECTIVE_DATES_INVALID' });
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

  // Draft MBOMs are disposable working copies. Released MBOMs are immutable;
  // a new version is the only supported change path after release.
  router.delete('/mbom-headers/:id', async (req, res, next) => {
    const context = getContext(req);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [context.userId]);
      const header = await client.query(`SELECT lifecycle_status FROM md_mbom_header WHERE master_id = $1 FOR UPDATE`, [req.params['id']]);
      if (!header.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'MBOM_NOT_FOUND' });
      }
      if (header.rows[0].lifecycle_status === 'Released') {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'MBOM_RELEASED_IMMUTABLE' });
      }
      const dependency = await client.query(`SELECT EXISTS (SELECT 1 FROM md_production_version WHERE mbom_header_id = $1) AS used`, [req.params['id']]);
      if (dependency.rows[0]?.used) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'MBOM_DELETE_DEPENDENCY_EXISTS' });
      }
      await client.query(`DELETE FROM md_component_substitute_approval_audit WHERE substitute_id IN (SELECT cs.master_id FROM md_component_substitute cs JOIN md_mbom_line l ON l.master_id = cs.mbom_line_id WHERE l.mbom_header_id = $1)`, [req.params['id']]);
      await client.query(`DELETE FROM md_component_substitute WHERE mbom_line_id IN (SELECT master_id FROM md_mbom_line WHERE mbom_header_id = $1)`, [req.params['id']]);
      await client.query(`UPDATE md_mbom_line SET parent_line_id = NULL WHERE mbom_header_id = $1`, [req.params['id']]);
      await client.query(`DELETE FROM md_mbom_line WHERE mbom_header_id = $1`, [req.params['id']]);
      const deleted = await client.query(`DELETE FROM md_mbom_header WHERE master_id = $1 RETURNING master_id`, [req.params['id']]);
      await client.query('COMMIT');
      return res.json({ deleted: Boolean(deleted.rows[0]), master_id: req.params['id'] });
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
        md_routing_header: `SELECT EXISTS (SELECT 1 FROM md_production_version WHERE routing_header_id=$1) OR EXISTS (SELECT 1 FROM md_production_standard ps JOIN md_routing_operation ro ON ro.master_id = ps.routing_operation_id WHERE ro.routing_header_id=$1) OR EXISTS (SELECT 1 FROM md_operation_skill_requirement osr JOIN md_routing_operation ro ON ro.master_id = osr.routing_operation_id WHERE ro.routing_header_id=$1) AS used`,
        md_routing_operation: `SELECT EXISTS (SELECT 1 FROM md_production_standard WHERE routing_operation_id=$1) OR EXISTS (SELECT 1 FROM md_operation_skill_requirement WHERE routing_operation_id=$1) AS used`,
      };
      const dependencyQuery = dependencyQueries[table.tableName];
      if (dependencyQuery) {
        const dependency = await client.query<{ used: boolean }>(dependencyQuery, [id]);
        if (dependency.rows[0]?.used) return res.status(409).json({ error: table.tableName === 'md_equipment' ? 'MACHINE_REFERENCED' : table.tableName === 'md_workstation' ? 'WORKSTATION_REFERENCED' : table.tableName === 'md_operation' ? 'OPERATION_REFERENCED' : 'RESOURCE_REFERENCED', message: 'Referenced resources cannot be deleted; deactivate or end the configuration instead.' });
      }
      if (table.tableName === 'md_routing_header') {
        const lifecycle = await client.query(`SELECT lifecycle_status FROM md_routing_header WHERE master_id = $1`, [id]);
        if (lifecycle.rows[0]?.lifecycle_status === 'Released') return res.status(409).json({ error: 'ROUTING_RELEASED_IMMUTABLE', message: 'Released Routings cannot be deleted.' });
      }
      if (table.tableName === 'md_routing_operation') {
        const parent = await client.query(`SELECT rh.lifecycle_status FROM md_routing_operation ro JOIN md_routing_header rh ON rh.master_id = ro.routing_header_id WHERE ro.master_id = $1`, [id]);
        if (parent.rows[0]?.lifecycle_status === 'Released') return res.status(409).json({ error: 'ROUTING_RELEASED_IMMUTABLE', message: 'Operations of a Released Routing cannot be deleted.' });
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

      if (table.tableName === 'md_mbom_header') {
        const current = await client.query(`SELECT master_id, lifecycle_status, base_quantity, base_uom_id FROM md_mbom_header WHERE master_id = $1 FOR UPDATE`, [req.params['id']]);
        if (!current.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'MBOM_NOT_FOUND' }); }
        if (current.rows[0].lifecycle_status === 'Released') { await client.query('ROLLBACK'); return res.status(409).json({ error: 'MBOM_RELEASED_IMMUTABLE' }); }
        const lines = await client.query(`SELECT l.master_id, l.parent_line_id, l.seq, l.quantity_per, l.component_revision_id, r.base_uom_id AS uom_id, r.lifecycle_status AS component_status, u.lifecycle_status AS uom_status, u.allow_fraction, u.decimal_precision FROM md_mbom_line l JOIN md_item_revision r ON r.master_id = l.component_revision_id JOIN md_uom u ON u.master_id = r.base_uom_id WHERE l.mbom_header_id = $1 AND l.effective_to IS NULL AND l.lifecycle_status NOT IN ('Inactive','Obsolete') ORDER BY l.seq`, [req.params['id']]);
        const failures: Array<Record<string, unknown>> = [];
        if (!lines.rows.length) failures.push({ code: 'MBOM_RELEASE_REQUIRES_LINES', path: 'lines' });
        if (Number(current.rows[0].base_quantity) <= 0) failures.push({ code: 'MBOM_BASE_QUANTITY_INVALID', path: 'base_quantity' });
        const headerUom = await client.query(`SELECT lifecycle_status, allow_fraction, decimal_precision FROM md_uom WHERE master_id = $1`, [current.rows[0].base_uom_id]);
        if (!headerUom.rows[0] || headerUom.rows[0].lifecycle_status !== 'Released') failures.push({ code: 'MBOM_BASE_UOM_NOT_RELEASED', path: 'base_uom_id' });
        else { try { validateUomQuantity(current.rows[0].base_quantity, headerUom.rows[0]); } catch (error: any) { failures.push({ code: error.message, path: 'base_quantity' }); } }
        const siblingSeq = new Set<string>();
        for (const line of lines.rows) {
          const sibling = `${line.parent_line_id || 'root'}:${line.seq}`;
          if (siblingSeq.has(sibling)) failures.push({ code: 'MBOM_SEQUENCE_DUPLICATE', path: `lines.${line.master_id}.seq` });
          siblingSeq.add(sibling);
          if (line.component_status !== 'Released') failures.push({ code: 'MBOM_COMPONENT_REVISION_INVALID', path: `lines.${line.master_id}.component_revision_id` });
          if (line.uom_status !== 'Released') failures.push({ code: 'MBOM_LINE_UOM_NOT_RELEASED', path: `lines.${line.master_id}.uom_id` });
          try { validateUomQuantity(line.quantity_per, line); } catch (error: any) { failures.push({ code: error.message, path: `lines.${line.master_id}.quantity_per` }); }
          if (line.parent_line_id && !lines.rows.some((parent: any) => parent.master_id === line.parent_line_id)) failures.push({ code: 'MBOM_PARENT_LINE_INVALID', path: `lines.${line.master_id}.parent_line_id` });
        }
        if (failures.length) { await client.query('ROLLBACK'); return res.status(422).json({ valid: false, errors: failures, warnings: [] }); }
        await client.query(`UPDATE md_mbom_line SET lifecycle_status = 'Released', approved_by = $1, approved_at = NOW(), updated_by = $1, updated_at = NOW() WHERE mbom_header_id = $2 AND effective_to IS NULL AND lifecycle_status NOT IN ('Inactive','Obsolete')`, [context.userId, req.params['id']]);
      }

      if (table.tableName === 'md_routing_header') {
        const current = await client.query(`SELECT master_id FROM md_routing_header WHERE master_id = $1 FOR UPDATE`, [req.params['id']]);
        if (!current.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'ROUTING_NOT_FOUND' }); }
        const readiness = await client.query(`
          SELECT ro.master_id, op.is_schedulable, ro.lifecycle_status AS routing_operation_status, op.lifecycle_status AS operation_status,
            CASE WHEN ro.planning_mode = 'ROUTING_OVERRIDE' AND rps.master_id IS NOT NULL THEN 'ROUTING_OVERRIDE'
              WHEN wps.master_id IS NOT NULL THEN 'WORK_CENTER_STANDARD'
              WHEN op.default_cycle_time_sec IS NOT NULL THEN 'OPERATION_DEFAULT' ELSE 'UNRESOLVED' END AS resolved_source,
            COALESCE(rps.base_quantity, wps.base_quantity, op.default_base_quantity) AS resolved_base_quantity,
            COALESCE(rps.setup_time_min, wps.setup_time_min, op.default_setup_time_min) AS resolved_setup_time_min,
            COALESCE(rps.cycle_time_sec, wps.cycle_time_sec, op.default_cycle_time_sec) AS resolved_cycle_time_sec,
            COALESCE(rps.labor_count, wps.labor_count, op.default_required_persons) AS resolved_required_workers,
            COALESCE(rps.efficiency_factor, wps.efficiency_factor, op.default_efficiency_factor) AS resolved_efficiency_factor,
            COALESCE(rps.standard_yield, wps.standard_yield, op.default_yield) AS resolved_standard_yield
          FROM md_routing_operation ro JOIN md_operation op ON op.master_id = ro.operation_id
          JOIN md_work_center wc ON wc.master_id = ro.work_center_id
          LEFT JOIN LATERAL (SELECT ps0.* FROM md_production_standard ps0
            WHERE ps0.routing_operation_id = ro.master_id AND ps0.item_revision_id IS NULL
              AND ps0.lifecycle_status NOT IN ('Inactive','Obsolete') AND ps0.effective_to IS NULL
            ORDER BY ps0.valid_from DESC NULLS LAST LIMIT 1) rps ON TRUE
          LEFT JOIN LATERAL (SELECT ps0.* FROM md_production_standard ps0
            WHERE ps0.routing_operation_id IS NULL AND ps0.item_revision_id IS NULL
              AND ps0.operation_id = ro.operation_id AND ps0.work_center_id = ro.work_center_id
              AND ps0.site_id = wc.site_id AND ps0.source_method = 'WorkCenter'
              AND ps0.lifecycle_status = 'Released' AND ps0.effective_to IS NULL
            ORDER BY ps0.valid_from DESC NULLS LAST LIMIT 1) wps ON TRUE
          WHERE ro.routing_header_id = $1 AND ro.effective_to IS NULL AND ro.lifecycle_status NOT IN ('Inactive','Obsolete')
        `, [req.params['id']]);
        if (!readiness.rows.length) { await client.query('ROLLBACK'); return res.status(422).json({ error: 'ROUTING_RELEASE_REQUIRES_OPERATIONS' }); }
        const inactiveOperations = readiness.rows.filter((row) => row.routing_operation_status !== 'Released' || row.operation_status !== 'Released');
        if (inactiveOperations.length) {
          await client.query('ROLLBACK');
          return res.status(422).json({ error: 'ROUTING_OPERATION_NOT_RELEASED', failures: inactiveOperations.map((row) => ({ routing_operation_id: row.master_id, routing_operation_status: row.routing_operation_status, operation_status: row.operation_status })) });
        }
        const unresolved = readiness.rows.filter((row) => row.is_schedulable && (row.resolved_source === 'UNRESOLVED' || Number(row.resolved_cycle_time_sec) <= 0 || Number(row.resolved_base_quantity) <= 0 || Number(row.resolved_required_workers) < 1 || Number(row.resolved_efficiency_factor) <= 0 || Number(row.resolved_standard_yield) <= 0));
        if (unresolved.length) {
          await client.query('ROLLBACK');
          return res.status(422).json({ error: 'ROUTING_PLANNING_VALUES_UNRESOLVED', failures: unresolved.map((row) => ({ routing_operation_id: row.master_id, source: row.resolved_source })) });
        }
        await client.query(`UPDATE md_routing_operation SET lifecycle_status = 'Released', updated_by = $1, updated_at = NOW() WHERE routing_header_id = $2 AND effective_to IS NULL AND lifecycle_status NOT IN ('Inactive','Obsolete')`, [context.userId, req.params['id']]);
        await client.query(`UPDATE md_production_standard SET lifecycle_status = 'Released', updated_by = $1, updated_at = NOW() WHERE routing_operation_id IN (SELECT master_id FROM md_routing_operation WHERE routing_header_id = $2 AND effective_to IS NULL) AND item_revision_id IS NULL AND effective_to IS NULL AND lifecycle_status NOT IN ('Inactive','Obsolete')`, [context.userId, req.params['id']]);
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
        const currentResult = await client.query(`
          SELECT r.*, u.code AS base_uom_code
          FROM md_item_revision r
          JOIN md_uom u ON u.master_id = r.base_uom_id
          WHERE r.master_id = $1
          FOR UPDATE OF r
        `, [req.params['id']]);
        const current = currentResult.rows[0] as Record<string, unknown> | undefined;
        if (!current) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Record not found' }); }
        if (current['previous_revision_id'] && !String(current['change_reason'] || '').trim()) {
          await client.query('ROLLBACK');
          return res.status(422).json({ error: 'Successor revision requires change_reason' });
        }
        await client.query('ALTER TABLE md_item_revision DISABLE TRIGGER USER');
        await client.query(`UPDATE md_item_revision SET is_default = FALSE WHERE item_id = $1 AND site_id = $2 AND master_id <> $3 AND lifecycle_status = 'Released'`, [current['item_id'], current['site_id'], req.params['id']]);
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

	  if (table.tableName === 'md_item_revision') {
		const uom = await client.query(`SELECT code FROM md_uom WHERE master_id = $1`, [row['base_uom_id']]);
		row['base_uom_code'] = uom.rows[0]?.code ?? null;
	  }

      if (table.eventType) {
        if (table.tableName === 'md_mbom_header') {
          const lines = await client.query(`
            SELECT l.master_id, l.parent_line_id, l.seq, l.component_revision_id, r.revision_code AS component_revision_code,
                   l.quantity_per, l.uom_id, u.code AS uom_code, l.scrap_rate, l.issue_operation_id,
                   l.backflush_flag, l.phantom_flag, l.optional_flag
            FROM md_mbom_line l
            JOIN md_item_revision r ON r.master_id = l.component_revision_id
            JOIN md_uom u ON u.master_id = l.uom_id
            WHERE l.mbom_header_id = $1 AND l.lifecycle_status = 'Released' AND l.effective_to IS NULL
            ORDER BY l.parent_line_id NULLS FIRST, l.seq`, [req.params['id']]);
          const payload = eventPayloadFor(table, row);
          payload['lines'] = lines.rows;
          const envelope = createEventEnvelope({ event_type: table.eventType, source_service: SERVICE_NAME, trace_id: context.traceId, payload });
          await writeToOutbox(client, { topic: table.eventType, envelope });
          await client.query('COMMIT');
          return res.json({ data: row, event_published: true, event_type: table.eventType });
        }
        if (table.tableName === 'md_routing_header') {
          const operations = await client.query(`
			SELECT ro.master_id, ro.operation_id, op.code AS operation_code, ro.work_center_id, ro.seq, ro.predecessor_seq,
              ro.workstation_id, ws.code AS workstation_code, ws.name AS workstation_name, op.requires_output_label,
              ro.planning_mode,
              CASE WHEN ro.planning_mode = 'ROUTING_OVERRIDE' AND rps.master_id IS NOT NULL THEN 'ROUTING_OVERRIDE'
                WHEN wps.master_id IS NOT NULL THEN 'WORK_CENTER_STANDARD' ELSE 'OPERATION_DEFAULT' END AS resolved_source,
              COALESCE(rps.base_quantity, wps.base_quantity, op.default_base_quantity) AS resolved_base_quantity,
              COALESCE(rps.setup_time_min, wps.setup_time_min, op.default_setup_time_min) AS resolved_setup_time_min,
              COALESCE(rps.cycle_time_sec, wps.cycle_time_sec, op.default_cycle_time_sec) AS resolved_cycle_time_sec,
              COALESCE(rps.labor_count, wps.labor_count, op.default_required_persons) AS resolved_required_workers,
              COALESCE(rps.efficiency_factor, wps.efficiency_factor, op.default_efficiency_factor) AS resolved_efficiency_factor,
              COALESCE(rps.standard_yield, wps.standard_yield, op.default_yield) AS resolved_standard_yield
            FROM md_routing_operation ro JOIN md_operation op ON op.master_id = ro.operation_id
            JOIN md_work_center wc ON wc.master_id = ro.work_center_id
            LEFT JOIN md_workstation ws ON ws.master_id = ro.workstation_id
            LEFT JOIN LATERAL (SELECT ps0.* FROM md_production_standard ps0 WHERE ps0.routing_operation_id = ro.master_id AND ps0.item_revision_id IS NULL AND ps0.lifecycle_status = 'Released' AND ps0.effective_to IS NULL ORDER BY ps0.valid_from DESC NULLS LAST LIMIT 1) rps ON TRUE
            LEFT JOIN LATERAL (SELECT ps0.* FROM md_production_standard ps0 WHERE ps0.routing_operation_id IS NULL AND ps0.item_revision_id IS NULL AND ps0.operation_id = ro.operation_id AND ps0.work_center_id = ro.work_center_id AND ps0.site_id = wc.site_id AND ps0.source_method = 'WorkCenter' AND ps0.lifecycle_status = 'Released' AND ps0.effective_to IS NULL ORDER BY ps0.valid_from DESC NULLS LAST LIMIT 1) wps ON TRUE
            WHERE ro.routing_header_id = $1 AND ro.lifecycle_status = 'Released' AND ro.effective_to IS NULL ORDER BY ro.seq
          `, [req.params['id']]);
          const payload = eventPayloadFor(table, row);
          payload['operations'] = operations.rows;
          const envelope = createEventEnvelope({ event_type: table.eventType, source_service: SERVICE_NAME, trace_id: context.traceId, payload });
          await writeToOutbox(client, { topic: table.eventType, envelope });
          await client.query('COMMIT');
          return res.json({ data: row, event_published: true, event_type: table.eventType });
        }
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
