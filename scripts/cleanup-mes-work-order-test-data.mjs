import fs from 'node:fs/promises';
import pg from 'pg';

const { Client } = pg;
const executionUrl = process.env.MES_EXECUTION_DATABASE_URL || 'postgresql://mes_execution_user:mes_execution_pass@localhost:15435/mes_execution_db';
const kioskUrl = process.env.MES_KIOSK_DATABASE_URL || 'postgresql://mes_kiosk_user:mes_kiosk_pass@localhost:15437/mes_kiosk_gateway_db';
const reportPath = 'implementation-expand/cleanup-mes-work-order-test-data-report.md';

const execution = new Client({ connectionString: executionUrl });
const kiosk = new Client({ connectionString: kioskUrl });

const rows = (result) => result.rows;
const count = (result) => Number(result.rowCount || 0);

async function audit(client) {
  const result = await client.query(`
    SELECT h.wo_id, h.wo_code, h.status, h.created_at, h.production_version_id,
      h.production_version_code, h.item_revision_code, h.mbom_code, h.routing_code,
      h.planning_snapshot,
      COALESCE(o.operation_count, 0)::int AS operation_count,
      COALESCE(m.material_count, 0)::int AS material_count,
      COALESCE(a.allocation_count, 0)::int AS allocation_count,
      COALESCE(p.print_job_count, 0)::int AS print_job_count,
      COALESCE(s.session_count, 0)::int AS session_count,
      pv.lifecycle_status AS pv_status,
      rh.lifecycle_status AS routing_status,
      mb.lifecycle_status AS mbom_status,
      ir.lifecycle_status AS item_revision_status,
      CASE WHEN h.production_version_id IS NULL THEN 'MISSING_PRODUCTION_VERSION'
        WHEN h.production_version_code IS NULL OR h.production_version_code = '' THEN 'MISSING_PRODUCTION_VERSION_SNAPSHOT'
        WHEN h.routing_code IS NULL OR h.routing_code = '' THEN 'MISSING_ROUTING_SNAPSHOT'
        WHEN h.planning_snapshot IS NULL OR h.planning_snapshot = '{}'::jsonb THEN 'MISSING_PLANNING_SNAPSHOT'
        WHEN COALESCE(o.operation_count, 0) = 0 THEN 'ZERO_OPERATIONS'
        WHEN COALESCE(m.material_count, 0) = 0 THEN 'MISSING_MATERIAL_SNAPSHOT'
        WHEN pv.lifecycle_status <> 'Released' OR rh.lifecycle_status <> 'Released' OR mb.lifecycle_status <> 'Released' OR ir.lifecycle_status <> 'Released' THEN 'MASTER_DATA_REFERENCE_NOT_RELEASED'
        ELSE 'REVIEW'
      END AS primary_reason
    FROM wo_header h
    LEFT JOIN (SELECT wo_id, COUNT(*) operation_count FROM wo_operation GROUP BY wo_id) o ON o.wo_id = h.wo_id
    LEFT JOIN (SELECT wo_id, COUNT(*) material_count FROM wo_material_requirement GROUP BY wo_id) m ON m.wo_id = h.wo_id
    LEFT JOIN (SELECT wo_id, COUNT(*) allocation_count FROM wo_resource_allocation WHERE status IN ('Draft','Validated','Committed') GROUP BY wo_id) a ON a.wo_id = h.wo_id
    LEFT JOIN (SELECT wo_id, COUNT(*) print_job_count FROM wo_print_job GROUP BY wo_id) p ON p.wo_id = h.wo_id
    LEFT JOIN (SELECT o.wo_id, COUNT(*) session_count FROM execution_session s JOIN wo_operation o ON o.wo_operation_id = s.wo_operation_id GROUP BY o.wo_id) s ON s.wo_id = h.wo_id
    LEFT JOIN rm_production_version pv ON pv.master_id = h.production_version_id
    LEFT JOIN rm_routing_header rh ON rh.master_id = pv.routing_header_id
    LEFT JOIN rm_mbom_header mb ON mb.master_id = pv.mbom_header_id
    LEFT JOIN rm_item_revision ir ON ir.master_id = pv.item_revision_id
    ORDER BY h.created_at, h.wo_code
  `);
  return rows(result).map((row) => ({ ...row, valid: false, reasons: [row.primary_reason] }));
}

async function orphanAudit(client) {
  const checks = {
    operation_without_header: `SELECT COUNT(*)::int AS count FROM wo_operation o LEFT JOIN wo_header h ON h.wo_id=o.wo_id WHERE h.wo_id IS NULL`,
    material_without_header: `SELECT COUNT(*)::int AS count FROM wo_material_requirement m LEFT JOIN wo_header h ON h.wo_id=m.wo_id WHERE h.wo_id IS NULL`,
    session_without_operation: `SELECT COUNT(*)::int AS count FROM execution_session s LEFT JOIN wo_operation o ON o.wo_operation_id=s.wo_operation_id WHERE o.wo_operation_id IS NULL`,
    confirmation_without_operation: `SELECT COUNT(*)::int AS count FROM operation_confirmation c LEFT JOIN wo_operation o ON o.wo_operation_id=c.wo_operation_id WHERE o.wo_operation_id IS NULL`,
    print_job_without_header: `SELECT COUNT(*)::int AS count FROM wo_print_job p LEFT JOIN wo_header h ON h.wo_id=p.wo_id WHERE h.wo_id IS NULL`,
    print_attempt_without_job: `SELECT COUNT(*)::int AS count FROM wo_print_job_attempt a LEFT JOIN wo_print_job p ON p.print_job_id=a.print_job_id WHERE p.print_job_id IS NULL`,
    print_event_without_job: `SELECT COUNT(*)::int AS count FROM wo_print_job_event e LEFT JOIN wo_print_job p ON p.print_job_id=e.print_job_id WHERE p.print_job_id IS NULL`,
    allocation_without_operation: `SELECT COUNT(*)::int AS count FROM wo_resource_allocation a LEFT JOIN wo_operation o ON o.wo_operation_id=a.wo_operation_id WHERE o.wo_operation_id IS NULL`,
    reservation_without_allocation: `SELECT COUNT(*)::int AS count FROM wo_capacity_reservation r LEFT JOIN wo_resource_allocation a ON a.allocation_id=r.allocation_id WHERE a.allocation_id IS NULL`,
    idempotency_without_allocation: `SELECT COUNT(*)::int AS count FROM wo_resource_allocation_idempotency i LEFT JOIN wo_resource_allocation a ON a.allocation_id=i.allocation_id WHERE a.allocation_id IS NULL`,
    workflow_without_work_order: `SELECT COUNT(*)::int AS count FROM wo_creation_workflow WHERE work_order_id IS NULL`,
  };
  const result = {};
  for (const [name, query] of Object.entries(checks)) result[name] = Number((await client.query(query)).rows[0].count);
  return result;
}

async function deleteForWorkOrders(client, ids, codes) {
  const idArray = ids;
  const codeArray = codes;
  const deleted = {};
  const statements = [
    ['execution_sessions', `DELETE FROM execution_session s USING wo_operation o WHERE s.wo_operation_id=o.wo_operation_id AND o.wo_id = ANY($1::uuid[])`],
    ['operation_confirmations', `DELETE FROM operation_confirmation c USING wo_operation o WHERE c.wo_operation_id=o.wo_operation_id AND o.wo_id = ANY($1::uuid[])`],
    ['material_consumption', `DELETE FROM material_consumption WHERE wo_id = ANY($1::uuid[]) OR wo_operation_id IN (SELECT wo_operation_id FROM wo_operation WHERE wo_id=ANY($1::uuid[]))`],
    ['print_events', `DELETE FROM wo_print_job_event e USING wo_print_job p WHERE e.print_job_id=p.print_job_id AND p.wo_id=ANY($1::uuid[])`],
    ['print_attempts', `DELETE FROM wo_print_job_attempt a USING wo_print_job p WHERE a.print_job_id=p.print_job_id AND p.wo_id=ANY($1::uuid[])`],
    ['capacity_reservations', `DELETE FROM wo_capacity_reservation WHERE wo_id=ANY($1::uuid[]) OR allocation_id IN (SELECT allocation_id FROM wo_resource_allocation WHERE wo_id=ANY($1::uuid[]))`],
    ['resource_allocation_audit', `DELETE FROM wo_resource_allocation_audit WHERE wo_id=ANY($1::uuid[]) OR allocation_id IN (SELECT allocation_id FROM wo_resource_allocation WHERE wo_id=ANY($1::uuid[]))`],
    ['allocation_idempotency', `DELETE FROM wo_resource_allocation_idempotency WHERE allocation_id IN (SELECT allocation_id FROM wo_resource_allocation WHERE wo_id=ANY($1::uuid[]))`],
    ['print_jobs', `DELETE FROM wo_print_job WHERE wo_id=ANY($1::uuid[])`],
    ['resource_allocations', `DELETE FROM wo_resource_allocation WHERE wo_id=ANY($1::uuid[])`],
    ['operation_labor_assignments', `DELETE FROM wo_operation_labor_assignment WHERE wo_id=ANY($1::uuid[])`],
    ['materials', `DELETE FROM wo_material_requirement WHERE wo_id=ANY($1::uuid[])`],
    ['operations', `DELETE FROM wo_operation WHERE wo_id=ANY($1::uuid[])`],
    ['approval_logs', `DELETE FROM wo_approval_log WHERE wo_id=ANY($1::uuid[])`],
    ['workflow_events', `DELETE FROM wo_creation_workflow_event WHERE workflow_id IN (SELECT workflow_id FROM wo_creation_workflow WHERE work_order_id=ANY($1::uuid[]) OR request_payload::text LIKE ANY($2::text[]))`],
    ['workflows', `DELETE FROM wo_creation_workflow WHERE work_order_id=ANY($1::uuid[]) OR request_payload::text LIKE ANY($2::text[])`],
    ['outbox_events', `DELETE FROM outbox_events WHERE payload::text LIKE ANY($1::text[])`],
    ['work_orders', `DELETE FROM wo_header WHERE wo_id=ANY($1::uuid[])`],
  ];
  const patterns = [...idArray, ...codeArray].map((value) => `%${value}%`);
  for (const [name, query] of statements) {
    try {
      const params = query.includes('$2') ? [idArray, patterns] : query.includes('payload::text LIKE ANY($1') ? [patterns] : [idArray];
      deleted[name] = count(await client.query(query, params));
    } catch (error) {
      throw new Error(`cleanup statement ${name} failed: ${error.message}`);
    }
  }
  return deleted;
}

async function deleteOrphans(client) {
  const deleted = {};
  const statements = [
    ['orphan_execution_sessions', `DELETE FROM execution_session s WHERE NOT EXISTS (SELECT 1 FROM wo_operation o WHERE o.wo_operation_id=s.wo_operation_id)`],
    ['orphan_confirmations', `DELETE FROM operation_confirmation c WHERE NOT EXISTS (SELECT 1 FROM wo_operation o WHERE o.wo_operation_id=c.wo_operation_id)`],
    ['orphan_material_consumption', `DELETE FROM material_consumption m WHERE NOT EXISTS (SELECT 1 FROM wo_header h WHERE h.wo_id=m.wo_id)`],
    ['orphan_print_attempts', `DELETE FROM wo_print_job_attempt a WHERE NOT EXISTS (SELECT 1 FROM wo_print_job p WHERE p.print_job_id=a.print_job_id)`],
    ['orphan_print_events', `DELETE FROM wo_print_job_event e WHERE NOT EXISTS (SELECT 1 FROM wo_print_job p WHERE p.print_job_id=e.print_job_id)`],
    ['orphan_print_jobs', `DELETE FROM wo_print_job p WHERE NOT EXISTS (SELECT 1 FROM wo_header h WHERE h.wo_id=p.wo_id)`],
    ['orphan_allocations', `DELETE FROM wo_resource_allocation a WHERE NOT EXISTS (SELECT 1 FROM wo_operation o WHERE o.wo_operation_id=a.wo_operation_id)`],
    ['orphan_reservations', `DELETE FROM wo_capacity_reservation r WHERE NOT EXISTS (SELECT 1 FROM wo_resource_allocation a WHERE a.allocation_id=r.allocation_id)`],
    ['orphan_allocation_idempotency', `DELETE FROM wo_resource_allocation_idempotency i WHERE NOT EXISTS (SELECT 1 FROM wo_resource_allocation a WHERE a.allocation_id=i.allocation_id)`],
    ['orphan_workflow_events', `DELETE FROM wo_creation_workflow_event e WHERE EXISTS (SELECT 1 FROM wo_creation_workflow w WHERE w.workflow_id=e.workflow_id AND w.work_order_id IS NULL)`],
    ['orphan_workflows', `DELETE FROM wo_creation_workflow WHERE work_order_id IS NULL`],
  ];
  for (const [name, query] of statements) deleted[name] = count(await client.query(query));
  return deleted;
}

function markdown(auditRows, orphanBefore, deleted, orphanAfter, kioskDeleted) {
  const lines = [
    '# MES Work Order Test Data Cleanup Report', '',
    `Generated: ${new Date().toISOString()}`, '',
    '## Audit', '',
    `- Work Orders audited: ${auditRows.length}`,
    `- Valid Work Orders retained: ${auditRows.filter((row) => row.valid).length}`,
    `- Invalid Work Orders deleted: ${auditRows.filter((row) => !row.valid).length}`, '',
    '### Work Order classification', '',
    '| WO | Status | Operations | Materials | Print jobs | Reason |',
    '|---|---|---:|---:|---:|---|',
    ...auditRows.map((row) => `| ${row.wo_code} (${row.wo_id}) | ${row.status} | ${row.operation_count} | ${row.material_count} | ${row.print_job_count} | ${row.reasons.join(', ')} |`), '',
    '### Orphans before cleanup', '',
    '```json', JSON.stringify(orphanBefore, null, 2), '```', '',
    '## Cleanup summary', '',
    '```json', JSON.stringify({ ...deleted, kiosk_outbound_messages: kioskDeleted }, null, 2), '```', '',
    '## Final verification', '',
    '```json', JSON.stringify(orphanAfter, null, 2), '```', '',
    `Remaining Work Orders: ${auditRows.filter((row) => row.valid).length}.`,
    'Master data was not modified. Invalid Work Orders were removed child-first in a database transaction.', '',
    '## Follow-up', '',
    'Future Work Order tests must select a candidate from `production-ready-versions`; creation now rejects missing or empty routing snapshots before commit.',
  ];
  return lines.join('\n');
}

await execution.connect();
await kiosk.connect();
try {
  const auditRows = await audit(execution);
  const invalid = auditRows.filter((row) => !row.valid);
  const orphanBefore = await orphanAudit(execution);
  const ids = invalid.map((row) => row.wo_id);
  const codes = invalid.map((row) => row.wo_code);
  await execution.query('BEGIN');
  const deleted = await deleteForWorkOrders(execution, ids, codes);
  const orphanDeleted = await deleteOrphans(execution);
  await execution.query('COMMIT');

  await kiosk.query('BEGIN');
  const patterns = [...ids, ...codes].map((value) => `%${value}%`);
  const kioskDeleted = count(await kiosk.query('DELETE FROM outbound_message_queue WHERE payload::text LIKE ANY($1::text[])', [patterns]));
  await kiosk.query('COMMIT');

  const orphanAfter = await orphanAudit(execution);
  await fs.writeFile(reportPath, markdown(auditRows, orphanBefore, { ...deleted, ...orphanDeleted }, orphanAfter, kioskDeleted));
  console.log(JSON.stringify({ audited: auditRows.length, invalidDeleted: invalid.length, deleted: { ...deleted, ...orphanDeleted }, kioskDeleted, orphanBefore, orphanAfter, reportPath }, null, 2));
} catch (error) {
  try { await execution.query('ROLLBACK'); } catch {}
  try { await kiosk.query('ROLLBACK'); } catch {}
  console.error(error);
  process.exitCode = 1;
} finally {
  await execution.end();
  await kiosk.end();
}
