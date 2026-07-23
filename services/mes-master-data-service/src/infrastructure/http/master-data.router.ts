import { Router, type Request, type Response, type NextFunction } from 'express';
import { Pool } from 'pg';
import { createEventEnvelope, localizedTextSchema, writeToOutbox } from '@mom-platform/shared-kernel';
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
  const aliases = new Map([
    ['mboms', 'mbom-headers'],
    ['routings', 'routing-headers'],
  ]);
  const table = TABLE_BY_RESOURCE.get(aliases.get(resource) ?? resource);
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

function translatableColumns(tableName: string): string[] {
  const localizedNameTables = new Set([
    'md_item',
    'md_item_revision',
    'md_work_center',
    'md_equipment',
    'md_skill',
    'md_reason_code',
    'md_operation',
  ]);
  const columns: string[] = [];
  if (localizedNameTables.has(tableName)) columns.push('name');
  if (tableName === 'md_work_instruction') columns.push('instruction_text');
  return columns;
}

function normalizeLocalizedFields(table: TableDefinition, body: Record<string, unknown>): Record<string, unknown> {
  for (const column of translatableColumns(table.tableName)) {
    const value = body[column];
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

function eventPayloadFor(table: TableDefinition, row: Record<string, unknown>): Record<string, unknown> {
  const base = {
    master_id: row['master_id'],
    code: row['code'],
    name: row['name'],
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
      next(err);
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
         ORDER BY s.code`,
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
    const normalized = skills
      .filter((item: any) => typeof item?.skill_id === 'string' && typeof item?.level === 'string')
      .map((item: any) => ({ skill_id: item.skill_id, level: item.level }));
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [context.userId]);
      await client.query('DELETE FROM md_employee_skill WHERE employee_id = $1', [req.params['id']]);
      for (const skill of normalized) {
        await client.query(
          `INSERT INTO md_employee_skill (employee_id, skill_id, level, created_by) VALUES ($1, $2, $3, $4)`,
          [req.params['id'], skill.skill_id, skill.level, context.userId],
        );
      }
      await client.query('COMMIT');
      return res.json({ data: normalized, count: normalized.length });
    } catch (err) {
      await client.query('ROLLBACK');
      return next(err);
    } finally {
      client.release();
    }
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
      const { rows } = await pool.query(`SELECT * FROM ${table.tableName} ${where} ORDER BY code, version_no LIMIT $1`, params);
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
    const body = normalizeLocalizedFields(table, normalizeBody(req.body));
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
      res.status(201).json(rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      next(err);
    } finally {
      client.release();
    }
  });

  router.put('/:resource/:id', async (req, res, next) => {
    const table = requireTable(req.params['resource'] ?? '');
    const context = getContext(req);
    const body = normalizeBody(req.body);
    delete body['master_id'];
    delete body['created_by'];
    delete body['created_at'];
    delete body['updated_by'];
    delete body['updated_at'];
    delete body['row_version'];
    const columns = Object.keys(body);
    if (columns.length === 0) return res.status(400).json({ error: 'No update fields provided' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [context.userId]);
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
      await client.query('COMMIT');
      return res.json(rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      return next(err);
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
