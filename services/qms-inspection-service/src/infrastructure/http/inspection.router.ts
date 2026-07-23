import { Router, type NextFunction, type Request, type Response } from 'express';
import { Pool, type PoolClient } from 'pg';
import CircuitBreaker from 'opossum';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import { createEventEnvelope, localizedTextSchema, writeToOutbox } from '@mom-platform/shared-kernel';

const SERVICE_NAME = 'qms-inspection-service';
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';
const tracer = trace.getTracer(SERVICE_NAME);
const MES_URL = (process.env['MES_MASTER_DATA_SERVICE_URL'] ?? 'http://localhost:3020').replace(/\/$/, '');

type Context = { userId: string; roleCode: string; traceId: string };
type DetailInput = { characteristic_id: string; measured_value?: number | null; result_flag: 'Pass' | 'Fail'; defect_code_id?: string | null; comment?: string | null };

function context(req: Request): Context {
  return { userId: String(req.headers['x-user-id'] ?? SYSTEM_USER_ID), roleCode: String(req.headers['x-role-code'] ?? 'UNKNOWN'), traceId: String(req.headers['x-trace-id'] ?? 'missing-trace') };
}

function role(req: Request, allowed: string[]): void {
  if (!allowed.includes(context(req).roleCode)) throw Object.assign(new Error('Role is not allowed for this operation'), { statusCode: 403, errorCode: 'FORBIDDEN' });
}

function bodyRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Object.assign(new Error('JSON object body is required'), { statusCode: 400 });
  return value as Record<string, unknown>;
}

function localized(value: unknown, field: string, optional = false): unknown {
  if ((value === undefined || value === null) && optional) return null;
  const parsed = localizedTextSchema.safeParse(value);
  if (!parsed.success) throw Object.assign(new Error(`${field} must be LocalizedText with a non-empty vi value`), { statusCode: 400, details: parsed.error.flatten() });
  return parsed.data;
}

function uuidValue(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length < 10) throw Object.assign(new Error(`${field} is required`), { statusCode: 400 });
  return value;
}

function numberValue(value: unknown, field: string, required = true): number | null {
  if (value === undefined || value === null || value === '') {
    if (!required) return null;
    throw Object.assign(new Error(`${field} is required`), { statusCode: 400 });
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw Object.assign(new Error(`${field} must be numeric`), { statusCode: 400 });
  return parsed;
}

function breakerForMesReference() {
  const breaker = new CircuitBreaker(async (resource: string, id: string) => {
    const response = await fetch(`${MES_URL}/api/mes/master-data/${resource}/${id}`, { headers: { 'X-User-ID': SYSTEM_USER_ID, 'X-Role-Code': 'QC_TECHNICIAN' } });
    if (response.status >= 400 && response.status < 500) return { exists: false, status: response.status };
    if (!response.ok) throw new Error(`MES master-data dependency returned ${response.status}`);
    return { exists: true, row: await response.json() as Record<string, unknown> };
  }, { timeout: 10_000, errorThresholdPercentage: 50, resetTimeout: 30_000, volumeThreshold: 4 });
  const transition = (state: string) => {
    const span = tracer.startSpan('circuit_breaker.state_change');
    span.setAttribute('circuit_breaker.service', 'mes-master-data-service');
    span.setAttribute('circuit_breaker.state', state);
    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
    console.info(`[CircuitBreaker] mes-master-data-service state=${state}`);
  };
  breaker.on('open', () => transition('open'));
  breaker.on('halfOpen', () => transition('half-open'));
  breaker.on('close', () => transition('closed'));
  return breaker;
}

const mesReferenceBreaker = breakerForMesReference();

async function validateMesReference(resource: string, id: string, expected: string | undefined, errors: Array<Record<string, unknown>>, field: string): Promise<Record<string, unknown> | null> {
  try {
    const result = await mesReferenceBreaker.fire(resource, id) as { exists: boolean; status?: number; row?: Record<string, unknown> };
    if (!result.exists || !result.row) { errors.push({ field, code: 'NOT_FOUND', message: `${field} does not exist in MES` }); return null; }
    const row = result.row;
    const status = String(row['lifecycle_status'] ?? row['status'] ?? '');
    if (expected && String(row[expected] ?? '') !== expected) errors.push({ field, code: 'INVALID_REFERENCE_TYPE', message: `${field} has an invalid type` });
    if (status && !['Active', 'Released'].includes(status)) errors.push({ field, code: 'REFERENCE_NOT_ACTIVE', message: `${field} is not active or released` });
    return row;
  } catch (error) {
    errors.push({ field, code: 'REFERENCE_SERVICE_UNAVAILABLE', message: 'MES master-data validation is temporarily unavailable', cause: String(error) });
    return null;
  }
}

async function validatePlanReferences(body: Record<string, unknown>, errors: Array<Record<string, unknown>>): Promise<void> {
  await validateMesReference('item-revisions', uuidValue(body['item_revision_id'], 'item_revision_id'), undefined, errors, 'item_revision_id');
  const operation = await validateMesReference('operations', uuidValue(body['operation_id'], 'operation_id'), undefined, errors, 'operation_id');
  if (operation && String(operation['operation_type']) !== 'Inspection') errors.push({ field: 'operation_id', code: 'OPERATION_NOT_INSPECTION', message: 'Operation must have OperationType Inspection' });
  await validateMesReference('sites', uuidValue(body['site_id'], 'site_id'), undefined, errors, 'site_id');
}

async function cachePlanReferences(pool: Pool, body: Record<string, unknown>): Promise<void> {
  const item = await mesReferenceBreaker.fire('item-revisions', uuidValue(body['item_revision_id'], 'item_revision_id')) as { row?: Record<string, unknown> };
  const operation = await mesReferenceBreaker.fire('operations', uuidValue(body['operation_id'], 'operation_id')) as { row?: Record<string, unknown> };
  const site = await mesReferenceBreaker.fire('sites', uuidValue(body['site_id'], 'site_id')) as { row?: Record<string, unknown> };
  const localizedReferenceName = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value) ? value : { vi: String(value ?? '') };
  if (item.row) await pool.query(`INSERT INTO qms_rm_item_revision (item_revision_id,item_code,item_name,lifecycle_status,updated_at) VALUES ($1,$2,$3::jsonb,$4,NOW()) ON CONFLICT (item_revision_id) DO UPDATE SET item_code=EXCLUDED.item_code,item_name=EXCLUDED.item_name,lifecycle_status=EXCLUDED.lifecycle_status,updated_at=NOW()`, [body['item_revision_id'], item.row['code'] ?? '', JSON.stringify(localizedReferenceName(item.row['name'])), item.row['lifecycle_status'] ?? item.row['status'] ?? 'Released']);
  if (operation.row) await pool.query(`INSERT INTO qms_rm_operation (operation_id,operation_code,operation_name,operation_type,site_id,lifecycle_status,updated_at) VALUES ($1,$2,$3::jsonb,$4,$5,$6,NOW()) ON CONFLICT (operation_id) DO UPDATE SET operation_code=EXCLUDED.operation_code,operation_name=EXCLUDED.operation_name,operation_type=EXCLUDED.operation_type,site_id=EXCLUDED.site_id,lifecycle_status=EXCLUDED.lifecycle_status,updated_at=NOW()`, [body['operation_id'], operation.row['code'] ?? '', JSON.stringify(localizedReferenceName(operation.row['name'])), operation.row['operation_type'], body['site_id'], operation.row['lifecycle_status'] ?? operation.row['status'] ?? 'Active']);
  if (site.row) await pool.query(`INSERT INTO qms_rm_site (site_id,site_code,site_name,lifecycle_status,updated_at) VALUES ($1,$2,$3::jsonb,$4,NOW()) ON CONFLICT (site_id) DO UPDATE SET site_code=EXCLUDED.site_code,site_name=EXCLUDED.site_name,lifecycle_status=EXCLUDED.lifecycle_status,updated_at=NOW()`, [body['site_id'], site.row['code'] ?? '', JSON.stringify(localizedReferenceName(site.row['name'])), site.row['lifecycle_status'] ?? site.row['status'] ?? 'Active']);
}

function sendError(next: NextFunction, error: unknown): void { next(error); }

export function inspectionRouter(pool: Pool): Router {
  const router = Router();

  router.get('/defect-codes', async (req, res, next) => { try { const { rows } = await pool.query('SELECT * FROM qms_defect_code ORDER BY defect_code'); res.json({ data: rows }); } catch (error) { return sendError(next, error); } });
  router.post('/defect-codes', async (req, res, next) => {
    try { role(req, ['PLANT_MANAGER', 'EXECUTIVE']); const b = bodyRecord(req.body); const name = localized(b['defect_name'], 'defect_name'); const code = String(b['defect_code'] ?? ''); const category = String(b['defect_category'] ?? '');
      if (!/^[A-Z0-9-]+$/.test(code) || !['Critical', 'Major', 'Minor'].includes(category)) throw Object.assign(new Error('defect_code or defect_category is invalid'), { statusCode: 400 });
      const { rows } = await pool.query('INSERT INTO qms_defect_code (defect_code, defect_name, defect_category) VALUES ($1,$2::jsonb,$3) RETURNING *', [code, JSON.stringify(name), category]); res.status(201).json({ data: rows[0] });
    } catch (error) { return sendError(next, error); }
  });
  router.patch('/defect-codes/:id', async (req, res, next) => { try { role(req, ['PLANT_MANAGER', 'EXECUTIVE']); const b = bodyRecord(req.body); const fields: string[] = []; const values: unknown[] = []; if (b['defect_name'] !== undefined) { fields.push('defect_name'); values.push(JSON.stringify(localized(b['defect_name'], 'defect_name'))); } if (b['status'] !== undefined) { fields.push('status'); values.push(b['status']); } if (!fields.length) throw Object.assign(new Error('No update fields provided'), { statusCode: 400 }); values.push(req.params['id']); const { rows } = await pool.query(`UPDATE qms_defect_code SET ${fields.map((f, i) => `${f}=$${i + 1}`).join(', ')}, updated_at=NOW() WHERE defect_code_id=$${values.length} RETURNING *`, values); if (!rows[0]) return res.status(404).json({ error: 'Not Found' }); return res.json({ data: rows[0] }); } catch (error) { return sendError(next, error); } });

  router.get('/plans', async (req, res, next) => { try { const values: unknown[] = []; const where: string[] = []; if (typeof req.query['status'] === 'string') { values.push(req.query['status']); where.push(`p.status=$${values.length}`); } if (typeof req.query['item_revision_id'] === 'string') { values.push(req.query['item_revision_id']); where.push(`p.item_revision_id=$${values.length}`); } const { rows } = await pool.query(`SELECT p.*, (SELECT COUNT(*) FROM qms_inspection_characteristic c WHERE c.plan_id=p.plan_id) AS characteristic_count FROM qms_inspection_plan p ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY p.plan_code`, values); res.json({ data: rows }); } catch (error) { return sendError(next, error); } });
  router.get('/plans/:id', async (req, res, next) => { try { const plan = await pool.query('SELECT * FROM qms_inspection_plan WHERE plan_id=$1', [req.params['id']]); if (!plan.rows[0]) return res.status(404).json({ error: 'Not Found' }); const characteristics = await pool.query('SELECT * FROM qms_inspection_characteristic WHERE plan_id=$1 ORDER BY sequence_no', [req.params['id']]); return res.json({ data: { ...plan.rows[0], characteristics: characteristics.rows } }); } catch (error) { return sendError(next, error); } });
  router.post('/plans', async (req, res, next) => {
    try { role(req, ['PLANT_MANAGER', 'EXECUTIVE']); const b = bodyRecord(req.body); const errors: Array<Record<string, unknown>> = []; await validatePlanReferences(b, errors); if (errors.length) return res.status(422).json({ error: 'PLAN_REFERENCE_VALIDATION_FAILED', details: errors }); await cachePlanReferences(pool, b); const c = context(req); const name = localized(b['plan_name'], 'plan_name'); const description = localized(b['plan_description'], 'plan_description', true); const { rows } = await pool.query(`INSERT INTO qms_inspection_plan (plan_code, plan_name, plan_description, item_revision_id, operation_id, site_id, plan_version, sampling_method, sample_size, effective_from, effective_to, created_by) VALUES ($1,$2::jsonb,$3::jsonb,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`, [String(b['plan_code'] ?? ''), JSON.stringify(name), JSON.stringify(description), b['item_revision_id'], b['operation_id'], b['site_id'], numberValue(b['plan_version'] ?? 1, 'plan_version'), String(b['sampling_method'] ?? 'Full'), numberValue(b['sample_size'], 'sample_size', false), b['effective_from'] ?? null, b['effective_to'] ?? null, c.userId]); return res.status(201).json({ data: rows[0] }); } catch (error) { return sendError(next, error); }
  });
  router.patch('/plans/:id', async (req, res, next) => { try { role(req, ['PLANT_MANAGER', 'EXECUTIVE']); const b = bodyRecord(req.body); const fields: string[] = []; const values: unknown[] = []; for (const [key, column] of [['plan_name','plan_name'],['plan_description','plan_description'],['sampling_method','sampling_method'],['sample_size','sample_size'],['effective_from','effective_from'],['effective_to','effective_to'],['status','status']] as const) if (b[key] !== undefined) { fields.push(column); values.push(key.startsWith('plan_') ? JSON.stringify(localized(b[key], key, key === 'plan_description')) : b[key]); } if (!fields.length) throw Object.assign(new Error('No update fields provided'), { statusCode: 400 }); values.push(req.params['id']); const { rows } = await pool.query(`UPDATE qms_inspection_plan SET ${fields.map((f,i) => `${f}=$${i+1}`).join(', ')}, updated_at=NOW(), row_version=row_version+1 WHERE plan_id=$${values.length} AND status IN ('Draft','InReview') RETURNING *`, values); if (!rows[0]) return res.status(409).json({ error: 'PLAN_NOT_EDITABLE_OR_NOT_FOUND' }); return res.json({ data: rows[0] }); } catch (error) { return sendError(next, error); } });
  router.get('/plans/:id/characteristics', async (req, res, next) => { try { const { rows } = await pool.query('SELECT * FROM qms_inspection_characteristic WHERE plan_id=$1 ORDER BY sequence_no', [req.params['id']]); res.json({ data: rows }); } catch (error) { return sendError(next, error); } });
  router.post('/plans/:id/characteristics', async (req, res, next) => { try { role(req, ['PLANT_MANAGER', 'EXECUTIVE']); const b = bodyRecord(req.body); const name = localized(b['characteristic_name'], 'characteristic_name'); const type = String(b['measurement_type'] ?? ''); if (!['Attribute','Variable'].includes(type)) throw Object.assign(new Error('measurement_type must be Attribute or Variable'), { statusCode: 400 }); const min = numberValue(b['spec_min'], 'spec_min', false); const max = numberValue(b['spec_max'], 'spec_max', false); if (min !== null && max !== null && min > max) throw Object.assign(new Error('spec_min must be <= spec_max'), { statusCode: 422 }); if (type === 'Variable' && !b['uom_id']) throw Object.assign(new Error('Variable characteristic requires uom_id'), { statusCode: 422 }); const { rows } = await pool.query(`INSERT INTO qms_inspection_characteristic (plan_id, sequence_no, characteristic_code, characteristic_name, measurement_type, spec_min, spec_max, target_value, uom_id, default_defect_code_id, mandatory_flag) VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10,$11) RETURNING *`, [req.params['id'], numberValue(b['sequence_no'], 'sequence_no'), String(b['characteristic_code'] ?? ''), JSON.stringify(name), type, min, max, numberValue(b['target_value'], 'target_value', false), b['uom_id'] ?? null, b['default_defect_code_id'] ?? null, b['mandatory_flag'] !== false]); return res.status(201).json({ data: rows[0] }); } catch (error) { return sendError(next, error); } });
  router.patch('/plans/:id/characteristics/:characteristicId', async (req, res, next) => { try { role(req, ['PLANT_MANAGER', 'EXECUTIVE']); const b = bodyRecord(req.body); const name = b['characteristic_name'] === undefined ? undefined : localized(b['characteristic_name'], 'characteristic_name'); const { rows } = await pool.query('UPDATE qms_inspection_characteristic SET characteristic_name=COALESCE($1::jsonb, characteristic_name), spec_min=COALESCE($2,spec_min), spec_max=COALESCE($3,spec_max), mandatory_flag=COALESCE($4,mandatory_flag) WHERE characteristic_id=$5 AND plan_id=$6 RETURNING *', [name ? JSON.stringify(name) : null, numberValue(b['spec_min'], 'spec_min', false), numberValue(b['spec_max'], 'spec_max', false), b['mandatory_flag'] ?? null, req.params['characteristicId'], req.params['id']]); if (!rows[0]) return res.status(404).json({ error: 'Not Found' }); return res.json({ data: rows[0] }); } catch (error) { return sendError(next, error); } });

  router.post('/plans/:id/release', async (req, res, next) => {
    try { role(req, ['PLANT_MANAGER', 'EXECUTIVE']); const client = await pool.connect(); try { await client.query('BEGIN'); const plan = (await client.query('SELECT * FROM qms_inspection_plan WHERE plan_id=$1 FOR UPDATE', [req.params['id']])).rows[0] as Record<string, unknown> | undefined; const errors: Array<Record<string, unknown>> = []; if (!plan) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not Found' }); } const chars = (await client.query('SELECT * FROM qms_inspection_characteristic WHERE plan_id=$1 ORDER BY sequence_no', [req.params['id']])).rows as Array<Record<string, unknown>>; if (!chars.length) errors.push({ field: 'characteristics', code: 'REQUIRED', message: 'Plan must have at least one characteristic' }); for (const item of chars) { if (item['measurement_type'] === 'Variable' && !item['uom_id']) errors.push({ field: String(item['characteristic_code']), code: 'UOM_REQUIRED', message: 'Variable characteristic requires UOM' }); if (item['spec_min'] !== null && item['spec_max'] !== null && Number(item['spec_min']) > Number(item['spec_max'])) errors.push({ field: String(item['characteristic_code']), code: 'INVALID_BOUNDS', message: 'Spec min must be <= spec max' }); } const refErrors: Array<Record<string, unknown>> = []; await validatePlanReferences(plan, refErrors); errors.push(...refErrors); if (!refErrors.length) await cachePlanReferences(pool, plan); const duplicate = await client.query(`SELECT plan_id FROM qms_inspection_plan WHERE item_revision_id=$1 AND operation_id=$2 AND site_id=$3 AND status='Released' AND plan_id<>$4 AND (effective_to IS NULL OR effective_to >= NOW()) AND (effective_from IS NULL OR effective_from <= NOW())`, [plan['item_revision_id'], plan['operation_id'], plan['site_id'], plan['plan_id']]); if (duplicate.rows.length) errors.push({ field: 'scope', code: 'EFFECTIVE_RELEASE_EXISTS', message: 'Another effective released plan exists for this item, operation, and site' }); if (errors.length) { await client.query('ROLLBACK'); return res.status(422).json({ error: 'PLAN_RELEASE_VALIDATION_FAILED', details: errors }); } const updated = (await client.query(`UPDATE qms_inspection_plan SET status='Released', effective_from=COALESCE(effective_from,NOW()), updated_at=NOW(), row_version=row_version+1 WHERE plan_id=$1 RETURNING *`, [plan['plan_id']])).rows[0]; const c = context(req); await writeToOutbox(client, { topic: 'QMS.Inspection.InspectionPlanReleased.v1', envelope: createEventEnvelope({ event_type: 'QMS.Inspection.InspectionPlanReleased.v1', source_service: SERVICE_NAME, trace_id: c.traceId, payload: { plan_id: plan['plan_id'], plan_code: plan['plan_code'], item_revision_id: plan['item_revision_id'], operation_id: plan['operation_id'], site_id: plan['site_id'], plan_version: plan['plan_version'] } }) }); await client.query('COMMIT'); return res.json({ data: updated }); } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); } } catch (error) { return sendError(next, error); }
  });

  router.get('/results', async (req, res, next) => { try { const values: unknown[] = []; const where: string[] = []; const status = req.query['status']; if (status === 'pending') where.push('r.overall_result IS NULL'); if (status === 'finalized') where.push('r.overall_result IS NOT NULL'); for (const [query, column] of [['work_order_id','r.work_order_id'],['item_revision_id','r.item_revision_id'],['work_center_id','r.work_center_id']] as const) if (typeof req.query[query] === 'string') { values.push(req.query[query]); where.push(`${column}=$${values.length}`); } const { rows } = await pool.query(`SELECT r.*, p.plan_code FROM qms_inspection_result r LEFT JOIN qms_inspection_plan p ON p.plan_id=r.plan_id ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY r.created_at DESC LIMIT 500`, values); res.json({ data: rows }); } catch (error) { return sendError(next, error); } });
  router.get('/results/:id', async (req, res, next) => { try { const result = await pool.query('SELECT * FROM qms_inspection_result WHERE result_id=$1', [req.params['id']]); if (!result.rows[0]) return res.status(404).json({ error: 'Not Found' }); const details = await pool.query('SELECT d.*, c.characteristic_code, c.characteristic_name, c.measurement_type, c.spec_min, c.spec_max, c.mandatory_flag FROM qms_inspection_result_detail d JOIN qms_inspection_characteristic c ON c.characteristic_id=d.characteristic_id WHERE d.result_id=$1 ORDER BY c.sequence_no', [req.params['id']]); const characteristics = await pool.query('SELECT * FROM qms_inspection_characteristic WHERE plan_id=$1 ORDER BY sequence_no', [result.rows[0]['plan_id']]); return res.json({ data: { ...result.rows[0], details: details.rows, characteristics: characteristics.rows } }); } catch (error) { return sendError(next, error); } });
  router.post('/results/:id/record', async (req, res, next) => {
    try { role(req, ['QC_TECHNICIAN', 'PLANT_MANAGER', 'EXECUTIVE']); const b = bodyRecord(req.body); const details = b['details']; if (!Array.isArray(details)) throw Object.assign(new Error('details array is required'), { statusCode: 400 }); const client = await pool.connect(); try { await client.query('BEGIN'); const result = (await client.query('SELECT r.*, p.site_id FROM qms_inspection_result r JOIN qms_inspection_plan p ON p.plan_id=r.plan_id WHERE r.result_id=$1 FOR UPDATE', [req.params['id']])).rows[0] as Record<string, unknown>; if (!result) return res.status(404).json({ error: 'Not Found' }); if (result['overall_result']) return res.status(409).json({ error: 'RESULT_ALREADY_FINALIZED' }); if (!result['plan_id']) return res.status(422).json({ error: 'MISSING_INSPECTION_PLAN' }); const chars = (await client.query('SELECT * FROM qms_inspection_characteristic WHERE plan_id=$1 ORDER BY sequence_no', [result['plan_id']])).rows as Array<Record<string, unknown>>; const input = details as DetailInput[]; const byId = new Map(input.map((d) => [d.characteristic_id, d])); const errors: Array<Record<string, unknown>> = []; for (const c of chars) { const d = byId.get(String(c['characteristic_id'])) ?? null; if (!d && c['mandatory_flag']) errors.push({ characteristic_id: c['characteristic_id'], code: 'MANDATORY_DETAIL_MISSING' }); if (d) { if (d.result_flag === 'Fail' && !d.defect_code_id) errors.push({ characteristic_id: d.characteristic_id, code: 'DEFECT_CODE_REQUIRED' }); if (c['measurement_type'] === 'Variable') { const v = Number(d.measured_value); if (!Number.isFinite(v)) errors.push({ characteristic_id: d.characteristic_id, code: 'MEASURED_VALUE_REQUIRED' }); if (c['spec_min'] !== null && v < Number(c['spec_min'])) d.result_flag = 'Fail'; if (c['spec_max'] !== null && v > Number(c['spec_max'])) d.result_flag = 'Fail'; } } } if (errors.length) { await client.query('ROLLBACK'); return res.status(422).json({ error: 'RESULT_VALIDATION_FAILED', details: errors }); } for (const d of input) await client.query('INSERT INTO qms_inspection_result_detail (result_id, characteristic_id, measured_value, result_flag, defect_code_id, comment) VALUES ($1,$2,$3,$4,$5,$6)', [result['result_id'], d.characteristic_id, d.measured_value ?? null, d.result_flag, d.defect_code_id ?? null, d.comment ?? null]); const failed = input.filter((d) => d.result_flag === 'Fail'); const outcome = failed.length ? 'Fail' : 'Pass'; const inspectedQty = Number(result['inspected_qty']); const c = context(req); const updated = (await client.query(`UPDATE qms_inspection_result SET overall_result=$1, passed_qty=$2, failed_qty=$3, inspector_user_id=$4, inspected_at=NOW() WHERE result_id=$5 RETURNING *`, [outcome, failed.length ? 0 : inspectedQty, failed.length ? inspectedQty : 0, c.userId, result['result_id']])).rows[0]; const failedSummary = failed.map((d) => ({ characteristic_id: d.characteristic_id, defect_code_id: d.defect_code_id ?? null, measured_value: d.measured_value ?? null, comment: d.comment ?? null })); const failedDefectIds = failed.map((d) => d.defect_code_id).filter(Boolean); const defectCategories = (await client.query('SELECT defect_category FROM qms_defect_code WHERE defect_code_id = ANY($1::uuid[])', [failedDefectIds])).rows.map((row) => String(row['defect_category'])); const defectCategory = defectCategories.includes('Critical') ? 'Critical' : defectCategories.includes('Major') ? 'Major' : 'Minor'; await writeToOutbox(client, { topic: 'QMS.Inspection.InspectionResultRecorded.v1', envelope: createEventEnvelope({ event_type: 'QMS.Inspection.InspectionResultRecorded.v1', source_service: SERVICE_NAME, trace_id: c.traceId, payload: { result_id: result['result_id'], plan_id: result['plan_id'], work_order_id: result['work_order_id'], item_revision_id: result['item_revision_id'], site_id: result['site_id'], overall_result: outcome, passed_qty: updated['passed_qty'], failed_qty: updated['failed_qty'] } }) }); if (outcome === 'Fail') await writeToOutbox(client, { topic: 'QMS.Inspection.InspectionFailed.v1', envelope: createEventEnvelope({ event_type: 'QMS.Inspection.InspectionFailed.v1', source_service: SERVICE_NAME, trace_id: c.traceId, payload: { result_id: result['result_id'], work_order_id: result['work_order_id'], work_center_id: result['work_center_id'], item_revision_id: result['item_revision_id'], site_id: result['site_id'], lot_or_label_ref: result['lot_or_label_ref'], failed_quantity: updated['failed_qty'], failed_characteristics: failedSummary, defect_category: defectCategory } }) }); await client.query('COMMIT'); return res.json({ data: updated }); } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); } } catch (error) { return sendError(next, error); }
  });
  return router;
}
