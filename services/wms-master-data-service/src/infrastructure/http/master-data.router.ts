import { Router, type NextFunction, type Request, type Response } from 'express';
import { Pool, type PoolClient } from 'pg';
import { SpanStatusCode, SpanKind, trace } from '@opentelemetry/api';
import { createEventEnvelope, localizedTextSchema, writeToOutbox } from '@mom-platform/shared-kernel';
import { RESOURCE_DEFINITIONS, type ResourceDefinition } from '../../domain/resources.js';

const SERVICE_NAME = 'wms-master-data-service';
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';
const IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const tracer = trace.getTracer(SERVICE_NAME);

function getContext(req: Request) {
  const context = {
    userId: (req.headers['x-user-id'] as string | undefined) ?? SYSTEM_USER_ID,
    roleCode: (req.headers['x-role-code'] as string | undefined) ?? 'UNKNOWN',
    traceId: (req.headers['x-trace-id'] as string | undefined) ?? 'missing-trace',
  };
  console.info(`[HTTPContext] trace_id=${context.traceId} user_id=${context.userId} role_code=${context.roleCode}`);
  return context;
}

function normalizeBody(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return {};
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (/^[a-z][a-zA-Z0-9_]*$/.test(key)) {
      normalized[key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)] = value;
    } else if (/^[a-z_][a-z0-9_]*$/.test(key)) {
      normalized[key] = value;
    }
  }
  return normalized;
}

function pickAllowed(body: Record<string, unknown>, allowed: string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(body).filter(([key]) => allowed.includes(key)));
}

function requireIdentifier(value: string): string {
  if (!IDENTIFIER.test(value)) throw new Error(`Unsafe SQL identifier: ${value}`);
  return value;
}

function resource(name: string): ResourceDefinition {
  const definition = RESOURCE_DEFINITIONS[name];
  if (!definition) throw Object.assign(new Error(`Unknown WMS master-data resource: ${name}`), { statusCode: 500 });
  return definition;
}

function parseLocalized(value: unknown, column: string, optional = false): unknown {
  if ((value === undefined || value === null || value === '') && optional) return null;
  const parsed = localizedTextSchema.safeParse(typeof value === 'string' ? { vi: value } : value);
  if (!parsed.success) {
    throw Object.assign(new Error(`${column} must be LocalizedText with a non-empty vi value`), { statusCode: 400 });
  }
  return parsed.data;
}

function normalizeLocalizedFields(definition: ResourceDefinition, body: Record<string, unknown>): Record<string, unknown> {
  for (const column of definition.localizedColumns) {
    if (body[column] !== undefined) {
      body[column] = parseLocalized(body[column], column, definition.tableName === 'wms_storage_bin');
    }
  }
  return body;
}

function eventPayloadFor(definition: ResourceDefinition, row: Record<string, unknown>): Record<string, unknown> {
  if (definition.tableName === 'wms_warehouse') {
    return {
      warehouse_id: row['warehouse_id'],
      warehouse_code: row['warehouse_code'],
      warehouse_name: row['warehouse_name'],
      warehouse_description: row['warehouse_description'],
      site_id: row['site_id'],
      status: row['status'],
      row_version: row['row_version'],
    };
  }
  if (definition.tableName === 'wms_zone') {
    return {
      zone_id: row['zone_id'],
      warehouse_id: row['warehouse_id'],
      zone_code: row['zone_code'],
      zone_name: row['zone_name'],
      zone_type: row['zone_type'],
      status: row['status'],
      row_version: row['row_version'],
    };
  }
  if (definition.tableName === 'wms_storage_location') {
    return {
      location_id: row['location_id'],
      zone_id: row['zone_id'],
      location_code: row['location_code'],
      location_name: row['location_name'],
      location_purpose: row['location_purpose'],
      staging_for_work_center_ref: row['staging_for_work_center_ref'],
      status: row['status'],
      row_version: row['row_version'],
    };
  }
  if (definition.tableName === 'wms_storage_bin') {
    return {
      bin_id: row['bin_id'],
      location_id: row['location_id'],
      bin_code: row['bin_code'],
      bin_name: row['bin_name'],
      capacity_qty: row['capacity_qty'],
      capacity_uom_id: row['capacity_uom_id'],
      status: row['status'],
      row_version: row['row_version'],
    };
  }
  return {
    mapping_id: row['mapping_id'],
    item_revision_id: row['item_revision_id'],
    storage_uom_code: row['storage_uom_code'],
    conversion_factor: row['conversion_factor'],
    default_bin_capacity_qty: row['default_bin_capacity_qty'],
    row_version: row['row_version'],
  };
}

async function ensureKnownItemRevision(client: Pool | PoolClient, itemRevisionId: unknown): Promise<void> {
  if (typeof itemRevisionId !== 'string' || itemRevisionId.length === 0) {
    throw Object.assign(new Error('item_revision_id is required'), { statusCode: 400 });
  }
  const { rows } = await client.query('SELECT item_revision_id FROM rm_item_revision WHERE item_revision_id = $1', [itemRevisionId]);
  if (!rows[0]) {
    throw Object.assign(new Error('ITEM_REVISION_NOT_FOUND_IN_WMS_READ_MODEL'), {
      statusCode: 422,
      errorCode: 'ITEM_REVISION_NOT_FOUND_IN_WMS_READ_MODEL',
      details: { item_revision_id: itemRevisionId },
    });
  }
}

function validateLocationPurpose(body: Record<string, unknown>): void {
  if (!('location_purpose' in body) && !('staging_for_work_center_ref' in body)) return;
  const purpose = (body['location_purpose'] ?? 'Storage') as unknown;
  const stagingRef = body['staging_for_work_center_ref'];
  if (purpose !== 'Storage' && purpose !== 'WorkCenterStaging') {
    throw Object.assign(new Error('location_purpose must be Storage or WorkCenterStaging'), {
      statusCode: 422,
      errorCode: 'INVALID_LOCATION_PURPOSE',
      details: { location_purpose: purpose },
    });
  }
  if (purpose === 'WorkCenterStaging' && (typeof stagingRef !== 'string' || stagingRef.length === 0)) {
    throw Object.assign(new Error('WorkCenterStaging requires staging_for_work_center_ref'), {
      statusCode: 422,
      errorCode: 'STAGING_WORK_CENTER_REF_REQUIRED',
    });
  }
  if (purpose === 'Storage' && stagingRef !== undefined && stagingRef !== null && stagingRef !== '') {
    throw Object.assign(new Error('Storage location must not set staging_for_work_center_ref'), {
      statusCode: 422,
      errorCode: 'STORAGE_LOCATION_STAGING_REF_NOT_ALLOWED',
    });
  }
}

async function insertRecord(client: PoolClient, definition: ResourceDefinition, record: Record<string, unknown>): Promise<Record<string, unknown>> {
  const columns = Object.keys(record);
  if (columns.length === 0) throw Object.assign(new Error('No create fields provided'), { statusCode: 400 });
  const placeholders = columns.map((_, index) => `$${index + 1}`);
  const statement = `INSERT INTO ${requireIdentifier(definition.tableName)} (${columns.map(requireIdentifier).join(', ')})
     VALUES (${placeholders.join(', ')})
     RETURNING *`;
  return tracer.startActiveSpan(`db.insert ${definition.tableName}`, { kind: SpanKind.CLIENT }, async (span) => {
    span.setAttributes({
      'db.system': 'postgresql',
      'db.operation': 'INSERT',
      'db.sql.table': definition.tableName,
      'db.statement': statement,
    });
    try {
      const { rows } = await client.query(statement, columns.map((column) => record[column]));
      return rows[0] as Record<string, unknown>;
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : 'insert failed' });
      throw err;
    } finally {
      span.end();
    }
  });
}

async function updateRecord(client: PoolClient, definition: ResourceDefinition, id: string, record: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  const columns = Object.keys(record);
  if (columns.length === 0) throw Object.assign(new Error('No update fields provided'), { statusCode: 400 });
  const sets = columns.map((column, index) => `${requireIdentifier(column)} = $${index + 1}`);
  const statement = `UPDATE ${requireIdentifier(definition.tableName)}
     SET ${sets.join(', ')}
     WHERE ${requireIdentifier(definition.idColumn)} = $${columns.length + 1}
     RETURNING *`;
  return tracer.startActiveSpan(`db.update ${definition.tableName}`, { kind: SpanKind.CLIENT }, async (span) => {
    span.setAttributes({
      'db.system': 'postgresql',
      'db.operation': 'UPDATE',
      'db.sql.table': definition.tableName,
      'db.statement': statement,
    });
    try {
      const { rows } = await client.query(statement, [...columns.map((column) => record[column]), id]);
      return rows[0] as Record<string, unknown> | undefined ?? null;
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : 'update failed' });
      throw err;
    } finally {
      span.end();
    }
  });
}

export function masterDataRouter(pool: Pool): Router {
  const router = Router();

  router.get('/resources', (_req, res) => {
    res.json({ resources: Object.keys(RESOURCE_DEFINITIONS) });
  });

  router.get('/warehouses', async (req, res, next) => {
    try {
      const limit = Math.min(Number(req.query['limit'] ?? 100), 500);
      const { rows } = await pool.query('SELECT * FROM wms_warehouse ORDER BY warehouse_code LIMIT $1', [limit]);
      res.json({ data: rows });
    } catch (err) {
      next(err);
    }
  });

  router.post('/warehouses', async (req, res, next) => {
    let client: PoolClient | null = null;
    try {
      const context = getContext(req);
      const definition = resource('warehouses');
      const body = normalizeLocalizedFields(definition, pickAllowed(normalizeBody(req.body), definition.allowedCreateColumns));
      client = await pool.connect();
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [context.userId]);
      const row = await insertRecord(client, definition, { ...body, created_by: context.userId });
      await writeToOutbox(client, { topic: definition.createEventType!, envelope: createEventEnvelope({ event_type: definition.createEventType!, source_service: SERVICE_NAME, trace_id: context.traceId, payload: eventPayloadFor(definition, row) }) });
      await client.query('COMMIT');
      res.status(201).json(row);
    } catch (err) {
      if (client) await client.query('ROLLBACK');
      next(err);
    } finally {
      client?.release();
    }
  });

  router.get('/warehouses/:id', async (req, res, next) => {
    try {
      const { rows } = await pool.query('SELECT * FROM wms_warehouse WHERE warehouse_id = $1', [req.params['id']]);
      if (!rows[0]) return res.status(404).json({ error: 'Not Found' });
      return res.json(rows[0]);
    } catch (err) {
      return next(err);
    }
  });

  router.put('/warehouses/:id', async (req, res, next) => {
    let client: PoolClient | null = null;
    try {
      const context = getContext(req);
      const definition = resource('warehouses');
      const body = normalizeLocalizedFields(definition, pickAllowed(normalizeBody(req.body), definition.allowedUpdateColumns));
      client = await pool.connect();
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [context.userId]);
      const row = await updateRecord(client, definition, req.params['id'] ?? '', body);
      if (!row) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Not Found' });
      }
      await client.query('COMMIT');
      return res.json(row);
    } catch (err) {
      if (client) await client.query('ROLLBACK');
      return next(err);
    } finally {
      client?.release();
    }
  });

  router.get('/warehouses/:id/zones', async (req, res, next) => {
    try {
      const { rows } = await pool.query('SELECT * FROM wms_zone WHERE warehouse_id = $1 ORDER BY zone_code', [req.params['id']]);
      res.json({ data: rows });
    } catch (err) {
      next(err);
    }
  });

  router.post('/warehouses/:id/zones', async (req, res, next) => {
    req.body = { ...(req.body as Record<string, unknown>), warehouse_id: req.params['id'] };
    return createNested(req, res, next, resource('zones'), pool);
  });

  router.get('/zones/:id', async (req, res, next) => getById(req, res, next, resource('zones'), pool));
  router.put('/zones/:id', async (req, res, next) => updateById(req, res, next, resource('zones'), pool));
  router.get('/zones/:id/locations', async (req, res, next) => {
    try {
      const { rows } = await pool.query('SELECT * FROM wms_storage_location WHERE zone_id = $1 ORDER BY location_code', [req.params['id']]);
      res.json({ data: rows });
    } catch (err) {
      next(err);
    }
  });
  router.post('/zones/:id/locations', async (req, res, next) => {
    req.body = { ...(req.body as Record<string, unknown>), zone_id: req.params['id'] };
    return createNested(req, res, next, resource('locations'), pool);
  });

  router.get('/locations/:id', async (req, res, next) => getById(req, res, next, resource('locations'), pool));
  router.put('/locations/:id', async (req, res, next) => updateById(req, res, next, resource('locations'), pool));
  router.get('/locations', async (req, res, next) => {
    try {
      const stagingRef = req.query['staging_for_work_center_ref'];
      if (typeof stagingRef === 'string' && stagingRef.length > 0) {
        const { rows } = await pool.query(
          `SELECT * FROM wms_storage_location
           WHERE location_purpose = 'WorkCenterStaging'
             AND staging_for_work_center_ref = $1
           ORDER BY location_code
           LIMIT 1`,
          [stagingRef],
        );
        return res.json({ data: rows });
      }
      const limit = Math.min(Number(req.query['limit'] ?? 100), 500);
      const { rows } = await pool.query('SELECT * FROM wms_storage_location ORDER BY location_code LIMIT $1', [limit]);
      return res.json({ data: rows });
    } catch (err) {
      return next(err);
    }
  });
  router.get('/locations/:id/bins', async (req, res, next) => {
    try {
      const { rows } = await pool.query('SELECT * FROM wms_storage_bin WHERE location_id = $1 ORDER BY bin_code', [req.params['id']]);
      res.json({ data: rows });
    } catch (err) {
      next(err);
    }
  });
  router.post('/locations/:id/bins', async (req, res, next) => {
    req.body = { ...(req.body as Record<string, unknown>), location_id: req.params['id'] };
    return createNested(req, res, next, resource('bins'), pool);
  });

  router.get('/bins/:id', async (req, res, next) => getById(req, res, next, resource('bins'), pool));
  router.put('/bins/:id', async (req, res, next) => updateById(req, res, next, resource('bins'), pool));

  router.get('/item-uom-mappings', async (req, res, next) => {
    try {
      const limit = Math.min(Number(req.query['limit'] ?? 100), 500);
      const { rows } = await pool.query(
        `SELECT m.*, r.item_code, r.item_name
         FROM wms_item_uom_mapping m
         LEFT JOIN rm_item_revision r ON r.item_revision_id = m.item_revision_id
         ORDER BY r.item_code NULLS LAST, m.storage_uom_code
         LIMIT $1`,
        [limit],
      );
      res.json({ data: rows });
    } catch (err) {
      next(err);
    }
  });

  router.get('/item-uom-mappings/:id', async (req, res, next) => getById(req, res, next, resource('item-uom-mappings'), pool));

  router.post('/item-uom-mappings', async (req, res, next) => {
    let client: PoolClient | null = null;
    try {
      const context = getContext(req);
      const definition = resource('item-uom-mappings');
      const body = pickAllowed(normalizeBody(req.body), definition.allowedCreateColumns);
      client = await pool.connect();
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [context.userId]);
      await ensureKnownItemRevision(client, body['item_revision_id']);
      const row = await insertRecord(client, definition, { ...body, created_by: context.userId });
      await writeToOutbox(client, { topic: definition.createEventType!, envelope: createEventEnvelope({ event_type: definition.createEventType!, source_service: SERVICE_NAME, trace_id: context.traceId, payload: eventPayloadFor(definition, row) }) });
      await client.query('COMMIT');
      res.status(201).json(row);
    } catch (err) {
      if (client) await client.query('ROLLBACK');
      next(err);
    } finally {
      client?.release();
    }
  });

  return router;
}

async function getById(req: Request, res: Response, next: NextFunction, definition: ResourceDefinition, pool: Pool): Promise<unknown> {
  try {
    const { rows } = await pool.query(`SELECT * FROM ${requireIdentifier(definition.tableName)} WHERE ${requireIdentifier(definition.idColumn)} = $1`, [req.params['id']]);
    if (!rows[0]) return res.status(404).json({ error: 'Not Found' });
    return res.json(rows[0]);
  } catch (err) {
    return next(err);
  }
}

async function createNested(req: Request, res: Response, next: NextFunction, definition: ResourceDefinition, pool: Pool): Promise<unknown> {
  let client: PoolClient | null = null;
  try {
    const context = getContext(req);
    const body = normalizeLocalizedFields(definition, pickAllowed(normalizeBody(req.body), definition.allowedCreateColumns));
    if (definition.tableName === 'wms_storage_location') validateLocationPurpose(body);
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [context.userId]);
    const row = await insertRecord(client, definition, { ...body, created_by: context.userId });
    await writeToOutbox(client, { topic: definition.createEventType!, envelope: createEventEnvelope({ event_type: definition.createEventType!, source_service: SERVICE_NAME, trace_id: context.traceId, payload: eventPayloadFor(definition, row) }) });
    await client.query('COMMIT');
    return res.status(201).json(row);
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    return next(err);
  } finally {
    client?.release();
  }
}

async function updateById(req: Request, res: Response, next: NextFunction, definition: ResourceDefinition, pool: Pool): Promise<unknown> {
  let client: PoolClient | null = null;
  try {
    const context = getContext(req);
    const body = normalizeLocalizedFields(definition, pickAllowed(normalizeBody(req.body), definition.allowedUpdateColumns));
    if (definition.tableName === 'wms_storage_location') validateLocationPurpose(body);
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [context.userId]);
    const row = await updateRecord(client, definition, req.params['id'] ?? '', body);
    if (!row) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Not Found' });
    }
    await client.query('COMMIT');
    return res.json(row);
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    return next(err);
  } finally {
    client?.release();
  }
}
