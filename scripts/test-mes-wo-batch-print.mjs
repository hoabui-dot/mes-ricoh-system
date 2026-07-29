#!/usr/bin/env node

/**
 * Production-path MES Work Order -> Kafka batch print verification.
 *
 * This script intentionally refuses a batch larger than three physical copies.
 * The WO must therefore be a small demo WO (for example quantity=3 with
 * units_per_label=1). It never calls the Printer Adapter HTTP API; dispatch is
 * queued by MES and completed through Kafka printer.batch.printed.
 */
const woId = process.env.WO_ID;
if (!woId) throw new Error('WO_ID is required. Refusing to mutate an arbitrary Work Order.');

const execution = (process.env.MES_EXECUTION_URL || 'http://localhost:13030/api/mes/execution').replace(/\/$/, '');
const userId = process.env.MES_E2E_USER_ID || '00000000-0000-0000-0000-000000000001';
const role = process.env.MES_E2E_ROLE_CODE || 'PLANT_MANAGER';
const maxPhysicalCopies = Number(process.env.MAX_PHYSICAL_LABELS || 3);
const timeoutMs = Number(process.env.WAIT_SECONDS || 120) * 1000;
const trace = `wo-batch-print-${Date.now()}`;

async function request(path, options = {}) {
  const response = await fetch(`${execution}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-User-ID': userId,
      'X-Role-Code': role,
      'X-Trace-ID': trace,
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!response.ok) throw new Error(`${path} HTTP ${response.status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  return body;
}

const detail = await request(`/work-orders/${woId}`);
const header = detail.header || detail;
const printOperation = (detail.operations || []).find((operation) => operation.execution_target_type === 'PRINT_STATION');
if (!printOperation) throw new Error('WO has no PRINT_STATION operation.');

const labelCount = Number(printOperation.label_count || 0);
const printCopies = Number(printOperation.print_copies || 0);
if (!Number.isInteger(labelCount) || labelCount < 1 || !Number.isInteger(printCopies) || printCopies < 1) {
  throw new Error(`Authoritative label policy is unresolved for ${header.wo_code || woId}; label_count=${labelCount}, print_copies=${printCopies}`);
}
if (printCopies > maxPhysicalCopies) {
  throw new Error(`Refusing physical print: requested ${printCopies} copies, safety limit is ${maxPhysicalCopies}. Use a WO whose full authoritative quantity is at most ${maxPhysicalCopies}.`);
}

console.log(JSON.stringify({ stage: 'quantity-policy', wo_id: woId, wo_code: header.wo_code, requested_quantity: header.quantity, units_per_label: printOperation.units_per_label, label_count: labelCount, copies_per_label: printOperation.copies_per_label, print_copies: printCopies, safety_limit: maxPhysicalCopies }, null, 2));

async function completeReadyOperations(current, beforePrintOnly = true) {
  const quantity = Number(current.header?.quantity || current.quantity || 1);
  const printSequence = Number(printOperation.sequence_no);
  for (const operation of current.operations || []) {
    if (operation.wo_operation_id === printOperation.wo_operation_id || operation.status === 'Finished') continue;
    if (beforePrintOnly && Number(operation.sequence_no) > printSequence) continue;
    if (!['Pending', 'Ready', 'DispatchQueued'].includes(operation.status)) continue;
    const session = await request(`/work-orders/${woId}/operations/${operation.wo_operation_id}/start`, {
      method: 'POST',
      body: JSON.stringify({ terminal_ref: process.env.TERMINAL_REF || 'KIOSK-BATCH-PRINT-E2E' }),
    });
    await request(`/work-orders/${woId}/operations/${operation.wo_operation_id}/confirm`, {
      method: 'POST',
      body: JSON.stringify({ session_id: session.session_id, qty_good: quantity, qty_scrap: 0, scanned_material_code: process.env.E2E_MATERIAL_CODE || 'E2E-MATERIAL', idempotency_attempt: `${trace}-${operation.wo_operation_id}` }),
    });
    console.log(`Completed ${beforePrintOnly ? 'predecessor' : 'follow-up'} ${operation.sequence_no} ${operation.operation_code}`);
    return; // Re-read the operation graph so each transition is authoritative.
  }
}

const computed = await request(`/work-orders/${woId}/compute-check`, { method: 'POST', body: '{}' });
const computedOperations = computed.data?.operations || computed.operations || [];
const hydrated = await request(`/work-orders/${woId}`);
for (const operation of hydrated.operations || []) {
  if (operation.resource_allocation?.allocation_id) continue;
  const planned = computedOperations.find((row) => Number(row.sequence_no) === Number(operation.sequence_no));
  const plannedStart = planned?.planned_start_at || hydrated.header?.planned_start_at;
  const params = new URLSearchParams({ planned_start_at: plannedStart, shift_id: hydrated.header?.shift_id || '' });
  const candidatesBody = await request(`/work-orders/${woId}/operations/${operation.wo_operation_id}/resource-candidates?${params}`);
  const candidate = (candidatesBody.candidates || []).find((row) => ['Eligible', 'ReadyWithWarnings'].includes(row.readiness) && !(row.capacity_conflicts || []).length && !(row.blocking_errors || []).length);
  if (!candidate) throw new Error(`No valid resource candidate for operation ${operation.sequence_no}: ${JSON.stringify(candidatesBody.blocking_errors || candidatesBody.candidates || [])}`);
  await request(`/work-orders/${woId}/operations/${operation.wo_operation_id}/resource-allocation`, {
    method: 'POST',
    headers: { 'Idempotency-Key': `${trace}-allocation-${operation.wo_operation_id}` },
    body: JSON.stringify({
      workstation_id: candidate.workstation?.id,
      equipment_id: candidate.primary_machine?.id || candidate.equipment?.id,
      machine_group_id: candidate.machine_group?.id,
      shift_id: hydrated.header?.shift_id,
      planned_start_at: plannedStart,
      candidate_reference: `${candidate.assignment?.id || ''}:${candidate.machine_group?.id || ''}:${candidate.capability?.id || ''}`,
      row_version: hydrated.header?.row_version,
    }),
  });
  console.log(`Committed resource candidate for operation ${operation.sequence_no}`);
}
if (header.status === 'Draft') {
  await request(`/work-orders/${woId}/approve`, { method: 'POST', body: JSON.stringify({ comment: 'Batch print production-path verification' }) });
}
if (['Released', 'InProgress'].includes(header.status) || header.status === 'Approved') {
  await request(`/work-orders/${woId}/start-execution`, { method: 'POST', headers: { 'Idempotency-Key': `${trace}-start` }, body: '{}' });
}

const deadline = Date.now() + timeoutMs;
let latest;
while (Date.now() < deadline) {
  latest = await request(`/work-orders/${woId}`);
  await completeReadyOperations(latest, true);
  latest = await request(`/work-orders/${woId}`);
  const operation = (latest.operations || []).find((row) => row.wo_operation_id === printOperation.wo_operation_id);
  const job = (latest.print_jobs || []).find((row) => row.wo_operation_id === printOperation.wo_operation_id);
  console.log(`WO=${latest.header?.status} print_operation=${operation?.status}/${operation?.print_status} job=${job?.status || '-'} completed_copies=${job?.total_copies || printCopies}`);
  if (operation?.status === 'Finished' && operation?.print_status === 'Completed' && job?.status === 'Completed' && Number(job.total_copies || printCopies) === printCopies) {
    // Complete the remaining executable operations after the print operation,
    // then require the Work Order aggregate itself to reach Completed.
    await completeReadyOperations(latest, false);
    latest = await request(`/work-orders/${woId}`);
    const allFinished = (latest.operations || []).every((row) => row.status === 'Finished');
    if (latest.header?.status === 'Completed' && allFinished) {
      console.log(JSON.stringify({ success: true, production_flow: 'MES -> durable print job/outbox -> Kafka command.printer.print.batch -> Print Station -> printer.batch.printed -> MES -> Work Order Completed', wo_id: woId, wo_code: latest.header.wo_code, print_job_id: job.print_job_id, label_count: labelCount, physical_print_copies: printCopies, printer: job.selected_printer_code, work_order_status: latest.header.status }, null, 2));
      process.exit(0);
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 3000));
}

throw new Error(`Batch print did not receive a successful printer.batch.printed result within ${timeoutMs / 1000}s for ${header.wo_code || woId}. Inspect MES print_jobs and remote Print Station logs.`);
