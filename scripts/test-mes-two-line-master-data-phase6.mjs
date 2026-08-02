#!/usr/bin/env node

import express from 'express';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const masterUrl = process.env.MES_MASTER_DATA_DATABASE_URL || 'postgresql://mes_master_data_user:mes_master_data_pass@localhost:15434/mes_master_data_db';
const environment = String(process.env.MES_ENV || '').toLowerCase();
const allowMutation = process.env.ALLOW_TWO_LINE_MASTER_DATA_MUTATION === 'true';
const runId = `PHASE6-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
const userId = process.env.MES_E2E_USER_ID || '00000000-0000-0000-0000-000000000001';
const steps = [];
const cleanup = {
  eligibilityIds: [],
  lineWorkCenterIds: [],
  capabilityIds: [],
  workCenterIds: [],
  lineIds: [],
  siteIds: [],
  areaIds: [],
};

function assertSafety() {
  if (!['development', 'local', 'test', 'staging'].includes(environment)) throw new Error('MES_ENV must be development, local, test, or staging.');
  if (!allowMutation) throw new Error('Set ALLOW_TWO_LINE_MASTER_DATA_MUTATION=true for disposable Phase 6 checks.');
  const host = new URL(masterUrl).hostname;
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) throw new Error(`Database URL must use a local/test host: ${host}`);
}

async function record(name, fn) {
  const startedAt = new Date().toISOString();
  try {
    const data = await fn();
    steps.push({ name, status: 'passed', started_at: startedAt, finished_at: new Date().toISOString(), data });
    console.log(`[phase6] PASS ${name}`);
    return data;
  } catch (error) {
    steps.push({ name, status: 'failed', started_at: startedAt, finished_at: new Date().toISOString(), error: error.message });
    console.error(`[phase6] FAIL ${name}: ${error.message}`);
    throw error;
  }
}

async function request(base, requestPath, init = {}, allowed = []) {
  const response = await fetch(`${base}${requestPath}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-User-ID': userId,
      'X-Role-Code': 'PROD_MANAGER',
      'X-Trace-ID': runId,
      ...(init.headers || {}),
    },
    cache: 'no-store',
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { message: text }; }
  if (!response.ok && !allowed.includes(response.status)) throw new Error(`${init.method || 'GET'} ${requestPath} -> ${response.status}: ${JSON.stringify(body)}`);
  return { status: response.status, body: body?.data ?? body };
}

async function main() {
  assertSafety();
  const pool = new Pool({ connectionString: masterUrl });
  const { runMigrations } = await import(path.join(repoRoot, 'services/mes-master-data-service/dist/infrastructure/db/migrate.js'));
  const { masterDataRouter } = await import(path.join(repoRoot, 'services/mes-master-data-service/dist/infrastructure/http/master-data.router.js'));
  await runMigrations(pool);
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/mes/master-data', masterDataRouter(pool));
  const server = app.listen(0);
  const port = await new Promise((resolve) => server.once('listening', () => resolve(server.address().port)));
  const base = `http://127.0.0.1:${port}/api/mes/master-data`;
  const api = (requestPath, init, allowed) => request(base, requestPath, init, allowed);

  try {
    const context = await record('migration tables and constraints exist', async () => {
      const tables = await pool.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema='public' AND table_name = ANY($1::text[])
        ORDER BY table_name`,
      [['md_production_line', 'md_production_line_work_center', 'md_production_line_resource_scope', 'md_production_version_line_eligibility']]);
      if (tables.rowCount !== 4) throw new Error(`PHASE6_TABLES_MISSING ${JSON.stringify(tables.rows)}`);
      const pv = await pool.query(`
        SELECT pv.master_id AS production_version_id, pv.code AS production_version_code, pv.item_revision_id, pv.routing_header_id, pv.site_id,
               wc.area_id, wc.shopfloor_id, array_agg(DISTINCT ro.operation_id) AS operation_ids
        FROM md_production_version pv
        JOIN md_routing_operation ro ON ro.routing_header_id = pv.routing_header_id AND ro.effective_to IS NULL
        JOIN md_operation op ON op.master_id = ro.operation_id AND op.is_schedulable = TRUE
        JOIN md_work_center wc ON wc.master_id = ro.work_center_id
        WHERE pv.lifecycle_status = 'Released' AND pv.effective_from <= NOW() AND (pv.effective_to IS NULL OR pv.effective_to > NOW())
        GROUP BY pv.master_id, pv.code, pv.item_revision_id, pv.routing_header_id, pv.site_id, wc.area_id, wc.shopfloor_id
        ORDER BY pv.code LIMIT 1`);
      if (!pv.rows[0]) throw new Error('RELEASED_PRODUCTION_VERSION_WITH_ROUTING_NOT_FOUND');
      return pv.rows[0];
    });

    const [primary, backup] = await record('production line CRUD and lifecycle API', async () => {
      const created = [];
      for (const suffix of ['PRIMARY', 'BACKUP']) {
        const line = (await api('/production-lines', {
          method: 'POST',
          body: JSON.stringify({
            code: `${runId}-${suffix}`,
            name: { vi: `${runId} ${suffix}`, en: `${runId} ${suffix}` },
            site_id: context.site_id,
            area_id: context.area_id,
            shopfloor_id: context.shopfloor_id,
            lifecycle_status: 'Draft',
          }),
        })).body;
        cleanup.lineIds.push(line.master_id);
        const released = (await api(`/production-lines/${line.master_id}/release`, { method: 'POST' })).body;
        if (released.lifecycle_status !== 'Released') throw new Error(`PRODUCTION_LINE_RELEASE_FAILED ${JSON.stringify(released)}`);
        created.push(line);
      }
      return created;
    });

    await record('same-site production line validation', async () => {
      const siteId = randomUUID(); const areaId = randomUUID();
      cleanup.areaIds.push(areaId); cleanup.siteIds.push(siteId);
      await pool.query(`INSERT INTO md_site (master_id, code, name, lifecycle_status, effective_from, created_by) VALUES ($1,$2,$3::jsonb,'Released',NOW(),$4)`, [siteId, `${runId}-SITE2`, JSON.stringify({ vi: 'Site 2', en: 'Site 2' }), userId]);
      await pool.query(`INSERT INTO md_production_area (master_id, code, name, site_id, lifecycle_status, effective_from, created_by) VALUES ($1,$2,$3::jsonb,$4,'Released',NOW(),$5)`, [areaId, `${runId}-AREA2`, JSON.stringify({ vi: 'Area 2', en: 'Area 2' }), siteId, userId]);
      const result = await api('/production-lines', { method: 'POST', body: JSON.stringify({ code: `${runId}-BAD`, name: { vi: 'Bad', en: 'Bad' }, site_id: context.site_id, area_id: areaId }) }, [422]);
      if (result.status !== 422 || result.body.error !== 'PRODUCTION_LINE_AREA_SITE_MISMATCH') throw new Error(`EXPECTED_SITE_MISMATCH ${JSON.stringify(result)}`);
      return result.body;
    });

    const workCenters = await record('work center line assignment API', async () => {
      const created = [];
      for (const [index, line] of [primary, backup].entries()) {
        const wcId = randomUUID();
        cleanup.workCenterIds.push(wcId);
        await pool.query(`INSERT INTO md_work_center (master_id, code, name, site_id, area_id, shopfloor_id, lifecycle_status, effective_from, active_flag, resource_type, capacity_model, created_by) VALUES ($1,$2,$3::jsonb,$4,$5,$6,'Released',NOW(),TRUE,'MachineGroup','TimeBased',$7)`, [wcId, `${runId}-WC-${index + 1}`, JSON.stringify({ vi: `WC ${index + 1}`, en: `WC ${index + 1}` }), context.site_id, context.area_id, context.shopfloor_id, userId]);
        for (const operationId of context.operation_ids) {
          const capId = randomUUID();
          cleanup.capabilityIds.push(capId);
          await pool.query(`INSERT INTO md_resource_capability (master_id, code, name, lifecycle_status, effective_from, created_by, operation_id, work_center_id, site_id, product_revision_id, eligibility, priority_no, speed_factor, cycle_time_sec) VALUES ($1,$2,$3,'Released',NOW(),$4,$5,$6,$7,$8,TRUE,1,1,60)`, [capId, `${runId}-CAP-${index + 1}-${String(operationId).slice(0, 8)}`, `${runId} capability`, userId, operationId, wcId, context.site_id, context.item_revision_id]);
        }
        const assigned = (await api(`/production-lines/${line.master_id}/work-centers`, { method: 'PUT', body: JSON.stringify({ work_centers: [{ work_center_id: wcId, sequence_no: 1, mandatory_flag: true }] }) })).body;
        cleanup.lineWorkCenterIds.push(...assigned.map((row) => row.line_work_center_id));
        created.push({ line, work_center_id: wcId });
      }
      return created;
    });

    await record('conflicting active work center ownership is rejected', async () => {
      const result = await api(`/production-lines/${backup.master_id}/work-centers`, { method: 'PUT', body: JSON.stringify({ work_centers: [{ work_center_id: workCenters[0].work_center_id, sequence_no: 1 }] }) }, [409]);
      if (result.status !== 409 || result.body.error !== 'WORK_CENTER_LINE_OWNERSHIP_OVERLAP') throw new Error(`EXPECTED_OWNERSHIP_OVERLAP ${JSON.stringify(result)}`);
      return result.body;
    });

    await record('production version line eligibility and readiness preview API', async () => {
      const duplicatePrimary = await api(`/production-versions/${context.production_version_id}/line-eligibility`, { method: 'PUT', body: JSON.stringify({ lines: [{ production_line_id: primary.master_id, is_primary: true, priority_no: 1 }, { production_line_id: backup.master_id, is_primary: true, priority_no: 2 }] }) }, [422]);
      if (duplicatePrimary.body.error !== 'PRODUCTION_VERSION_LINE_PRIMARY_REQUIRED') throw new Error('EXPECTED_SINGLE_PRIMARY_VALIDATION');
      const eligibility = (await api(`/production-versions/${context.production_version_id}/line-eligibility`, { method: 'PUT', body: JSON.stringify({ lines: [{ production_line_id: primary.master_id, is_primary: true, priority_no: 1 }, { production_line_id: backup.master_id, is_primary: false, priority_no: 2, efficiency_factor: 0.95 }] }) })).body;
      cleanup.eligibilityIds.push(...eligibility.map((row) => row.eligibility_id));
      if (eligibility.length !== 2 || eligibility.filter((row) => row.is_primary).length !== 1) throw new Error('ELIGIBILITY_RESULT_INVALID');
      const preview = (await api(`/production-versions/${context.production_version_id}/line-readiness-preview`, { method: 'POST', body: JSON.stringify({}) })).body;
      if (preview.lines.length !== 2 || preview.lines.some((line) => line.readiness_status !== 'Ready')) throw new Error(`LINE_READINESS_NOT_READY ${JSON.stringify(preview)}`);
      return { eligibility_count: eligibility.length, readiness: preview.lines.map((line) => ({ code: line.line_code, status: line.readiness_status })) };
    });

    await record('dependency-aware production line delete rejects referenced line', async () => {
      const result = await api(`/production-lines/${primary.master_id}`, { method: 'DELETE' }, [409]);
      if (result.status !== 409 || result.body.error !== 'PRODUCTION_LINE_DELETE_DEPENDENCY_EXISTS') throw new Error(`EXPECTED_DELETE_DEPENDENCY ${JSON.stringify(result)}`);
      return result.body;
    });

    await record('master-data outbox events were written', async () => {
      const events = await pool.query(`SELECT event_type, COUNT(*)::INT AS count FROM outbox_events WHERE payload->>'trace_id' = $1 GROUP BY event_type ORDER BY event_type`, [runId]);
      const types = events.rows.map((row) => row.event_type);
      for (const expected of ['MES.MasterData.ProductionLineReleased.v1', 'MES.MasterData.ProductionLineWorkCenterAssigned.v1', 'MES.MasterData.ProductionVersionLineEligibilityReleased.v1']) {
        if (!types.includes(expected)) throw new Error(`MISSING_OUTBOX_EVENT ${expected}: ${JSON.stringify(events.rows)}`);
      }
      return events.rows;
    });
  } finally {
    await record('exact cleanup verification', async () => {
      await pool.query(`DELETE FROM md_production_version_line_eligibility WHERE eligibility_id = ANY($1::uuid[])`, [cleanup.eligibilityIds]);
      await pool.query(`DELETE FROM md_production_line_work_center WHERE line_work_center_id = ANY($1::uuid[])`, [cleanup.lineWorkCenterIds]);
      await pool.query(`DELETE FROM md_resource_capability WHERE master_id = ANY($1::uuid[])`, [cleanup.capabilityIds]);
      await pool.query(`DELETE FROM md_work_center WHERE master_id = ANY($1::uuid[])`, [cleanup.workCenterIds]);
      await pool.query(`DELETE FROM md_production_line WHERE master_id = ANY($1::uuid[])`, [cleanup.lineIds]);
      await pool.query(`DELETE FROM md_production_area WHERE master_id = ANY($1::uuid[])`, [cleanup.areaIds]);
      await pool.query(`DELETE FROM md_site WHERE master_id = ANY($1::uuid[])`, [cleanup.siteIds]);
      const remaining = await pool.query(`
        SELECT
          (SELECT COUNT(*)::INT FROM md_production_version_line_eligibility WHERE eligibility_id = ANY($1::uuid[])) AS eligibilities,
          (SELECT COUNT(*)::INT FROM md_production_line_work_center WHERE line_work_center_id = ANY($2::uuid[])) AS line_work_centers,
          (SELECT COUNT(*)::INT FROM md_resource_capability WHERE master_id = ANY($3::uuid[])) AS capabilities,
          (SELECT COUNT(*)::INT FROM md_work_center WHERE master_id = ANY($4::uuid[])) AS work_centers,
          (SELECT COUNT(*)::INT FROM md_production_line WHERE master_id = ANY($5::uuid[])) AS lines`,
      [cleanup.eligibilityIds, cleanup.lineWorkCenterIds, cleanup.capabilityIds, cleanup.workCenterIds, cleanup.lineIds]);
      return remaining.rows[0];
    });
    server.close();
    await pool.end();
  }
  const failed = steps.filter((step) => step.status !== 'passed');
  if (failed.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`[phase6] ${error.stack || error.message}`);
  process.exitCode = 1;
});
