import { Router, type Request, type Response, type NextFunction } from 'express';
import { Pool } from 'pg';
import { createEventEnvelope, writeToOutbox } from '@mom-platform/shared-kernel';
import { TABLE_BY_RESOURCE, type TableDefinition } from '../../domain/table-registry.js';
import { validateProductionVersion } from '../../application/validation-engine/validation-engine.js';

const SERVICE_NAME = 'mes-master-data-service';
const IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';

function getContext(req: Request) {
  return {
    userId: (req.headers['x-user-id'] as string | undefined) ?? SYSTEM_USER_ID,
    roleCode: (req.headers['x-role-code'] as string | undefined) ?? 'UNKNOWN',
    traceId: (req.headers['x-trace-id'] as string | undefined) ?? 'missing-trace',
  };
}

function requireTable(resource: string): TableDefinition {
  const table = TABLE_BY_RESOURCE.get(resource);
  if (!table) throw Object.assign(new Error(`Unsupported master-data resource: ${resource}`), { statusCode: 404 });
  if (!IDENTIFIER.test(table.tableName)) throw new Error(`Unsafe table name: ${table.tableName}`);
  return table;
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

function eventPayloadFor(table: TableDefinition, row: Record<string, unknown>): Record<string, unknown> {
  const base = {
    master_id: row['master_id'],
    code: row['code'],
    version_no: row['version_no'],
    lifecycle_status: row['lifecycle_status'],
  };
  if (table.tableName === 'md_mbom_header') {
    return { ...base, item_revision_id: row['item_revision_id'], site_id: row['site_id'], base_quantity: row['base_quantity'], base_uom_id: row['base_uom_id'] };
  }
  if (table.tableName === 'md_routing_header') {
    return { ...base, item_revision_id: row['item_revision_id'], site_id: row['site_id'] };
  }
  if (table.tableName === 'md_production_version') {
    return { ...base, item_revision_id: row['item_revision_id'], mbom_header_id: row['mbom_header_id'], routing_header_id: row['routing_header_id'], site_id: row['site_id'] };
  }
  return { ...base, site_id: row['site_id'], item_revision_id: row['item_revision_id'], work_center_id: row['work_center_id'], equipment_type: row['equipment_type'] };
}

export function masterDataRouter(pool: Pool): Router {
  const router = Router();

  router.get('/resources', (_req, res) => {
    res.json({ resources: [...TABLE_BY_RESOURCE.keys()] });
  });

  router.post('/production-versions/:id/validate', async (req, res, next) => {
    try {
      const result = await validateProductionVersion(pool, req.params['id'] ?? '');
      res.status(result.valid ? 200 : 422).json(result);
    } catch (err) {
      next(err);
    }
  });

  router.get('/:resource', async (req, res, next) => {
    try {
      const table = requireTable(req.params['resource'] ?? '');
      const limit = Math.min(Number(req.query['limit'] ?? 100), 500);
      const { rows } = await pool.query(`SELECT * FROM ${table.tableName} ORDER BY code, version_no LIMIT $1`, [limit]);
      res.json({ data: rows });
    } catch (err) {
      next(err);
    }
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

  router.post('/:resource', async (req, res, next) => {
    const table = requireTable(req.params['resource'] ?? '');
    const context = getContext(req);
    const body = normalizeBody(req.body);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [context.userId]);
      const record: Record<string, unknown> = {
        ...body,
        effective_from: body['effective_from'] ?? new Date(),
        created_by: context.userId,
      };
      const columns = Object.keys(record);
      const placeholders = columns.map((_, index) => `$${index + 1}`);
      const { rows } = await client.query(
        `INSERT INTO ${table.tableName} (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
        columns.map((column) => record[column]),
      );
      await client.query('COMMIT');
      res.status(201).json(rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      next(err);
    } finally {
      client.release();
    }
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

      const { rows } = await client.query(
        `UPDATE ${table.tableName}
         SET lifecycle_status = 'Released', approved_by = $1, approved_at = NOW()
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
