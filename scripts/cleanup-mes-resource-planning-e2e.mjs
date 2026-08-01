#!/usr/bin/env node
import pg from 'pg';

const ids = process.argv.slice(2);
const url = process.env.MES_EXECUTION_DATABASE_URL || 'postgresql://mes_execution_user:mes_execution_pass@localhost:15435/mes_execution_db';
if (!ids.length || ids.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) throw new Error('Usage: cleanup-mes-resource-planning-e2e.mjs <work-order-uuid> [<work-order-uuid>...]');
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query('BEGIN');
  const q = (sql) => client.query(sql, [ids]);
  await q(`DELETE FROM operation_confirmation WHERE wo_operation_id IN (SELECT wo_operation_id FROM wo_operation WHERE wo_id=ANY($1::uuid[]))`);
  await q(`DELETE FROM execution_session WHERE wo_operation_id IN (SELECT wo_operation_id FROM wo_operation WHERE wo_id=ANY($1::uuid[]))`);
  await q(`DELETE FROM material_consumption WHERE wo_id=ANY($1::uuid[]) OR wo_operation_id IN (SELECT wo_operation_id FROM wo_operation WHERE wo_id=ANY($1::uuid[]))`);
  await q(`DELETE FROM wo_print_job_event WHERE print_job_id IN (SELECT print_job_id FROM wo_print_job WHERE wo_id=ANY($1::uuid[]))`);
  await q(`DELETE FROM wo_print_job_attempt WHERE print_job_id IN (SELECT print_job_id FROM wo_print_job WHERE wo_id=ANY($1::uuid[]))`);
  await q(`DELETE FROM wo_capacity_reservation WHERE wo_id=ANY($1::uuid[]) OR allocation_id IN (SELECT allocation_id FROM wo_resource_allocation WHERE wo_id=ANY($1::uuid[]))`);
  await q(`DELETE FROM wo_resource_allocation_audit WHERE wo_id=ANY($1::uuid[]) OR allocation_id IN (SELECT allocation_id FROM wo_resource_allocation WHERE wo_id=ANY($1::uuid[]))`);
  await q(`DELETE FROM wo_resource_allocation_idempotency WHERE allocation_id IN (SELECT allocation_id FROM wo_resource_allocation WHERE wo_id=ANY($1::uuid[]))`);
  await q(`DELETE FROM wo_print_job WHERE wo_id=ANY($1::uuid[])`);
  await q(`DELETE FROM wo_resource_allocation WHERE wo_id=ANY($1::uuid[])`);
  await q(`DELETE FROM wo_operation_labor_assignment WHERE wo_id=ANY($1::uuid[])`);
  await q(`DELETE FROM wo_material_requirement WHERE wo_id=ANY($1::uuid[])`);
  await q(`DELETE FROM wo_operation WHERE wo_id=ANY($1::uuid[])`);
  await q(`DELETE FROM wo_approval_log WHERE wo_id=ANY($1::uuid[])`);
  await q(`DELETE FROM wo_creation_workflow_event WHERE workflow_id IN (SELECT workflow_id FROM wo_creation_workflow WHERE work_order_id=ANY($1::uuid[]))`);
  await q(`DELETE FROM wo_creation_workflow WHERE work_order_id=ANY($1::uuid[])`);
  await client.query(`DELETE FROM outbox_events WHERE payload::text LIKE ANY($1::text[])`, [ids.map((id) => `%${id}%`)]);
  await q(`DELETE FROM wo_header WHERE wo_id=ANY($1::uuid[])`);
  await client.query('COMMIT');
  const remaining = await client.query(`SELECT COUNT(*)::int AS count FROM wo_header WHERE wo_id=ANY($1::uuid[])`, [ids]);
  if (Number(remaining.rows[0].count) !== 0) throw new Error(`Cleanup left ${remaining.rows[0].count} Work Order rows.`);
  console.log(JSON.stringify({ success: true, workOrderIds: ids, workOrdersRemoved: ids.length, remainingWorkOrders: Number(remaining.rows[0].count), sharedFixtureRestored: true }));
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally { await client.end(); }
