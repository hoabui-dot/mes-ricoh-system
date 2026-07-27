const executionBase = process.env.MES_EXECUTION_URL || 'http://localhost:13030/api/mes/execution';
const masterBase = process.env.MES_MASTER_DATA_URL || 'http://localhost:13020/api/mes/master-data';
const productionVersionCode = process.env.PRODUCTION_VERSION_CODE || 'PV-E2E-SINGLE-20260727';
const userId = process.env.MES_E2E_USER_ID || '00000000-0000-0000-0000-000000000001';
const roleCode = process.env.MES_E2E_ROLE_CODE || 'PLANT_MANAGER';
const traceId = `physical-print-e2e-${Date.now()}`;
const targetDate = process.env.TARGET_DATE || '2026-08-01';
const quantity = Number(process.env.QUANTITY || 1);

async function request(base, path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-User-ID': userId,
      'X-Role-Code': roleCode,
      'X-Trace-ID': traceId,
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!response.ok) throw new Error(`${path} HTTP ${response.status}: ${text}`);
  return body;
}

const candidates = await request(masterBase, `/production-ready-versions?limit=500&planned_date=${encodeURIComponent(targetDate)}`);
const candidate = (candidates.data || []).find((row) => row.production_version_code === productionVersionCode && row.ready === true);
if (!candidate) throw new Error(`Ready Production Version not found: ${productionVersionCode}`);
if (candidate.routing_code !== 'RT-20260727-0004') throw new Error(`Unexpected physical-print Routing: ${candidate.routing_code}`);

const created = await request(executionBase, '/work-orders', {
  method: 'POST',
  body: JSON.stringify({ production_version_id: candidate.production_version_id, quantity, target_date: targetDate }),
});
const woId = created.wo_id;
console.log(`Created ${created.wo_code} (${woId}) from ${candidate.production_version_code}`);

const detail = await request(executionBase, `/work-orders/${woId}`);
const printOperation = (detail.operations || []).find((operation) => operation.execution_target_type === 'PRINT_STATION');
if (!printOperation || !printOperation.workstation_id) throw new Error('Created WO has no Print Station operation/workstation mapping');
console.log(`Print operation ready: seq=${printOperation.sequence_no} code=${printOperation.operation_code} workstation=${printOperation.workstation_id}`);

await request(executionBase, `/work-orders/${woId}/compute-check`, { method: 'POST', body: '{}' });
const approval = await request(executionBase, `/work-orders/${woId}/approve`, {
  method: 'POST',
  body: JSON.stringify({ comment: 'Physical printer E2E verification' }),
});
console.log(`Approved ${created.wo_code}: ${approval.status}`);

const staging = await request(executionBase, `/work-orders/${woId}/stage-materials`, { method: 'POST' });
console.log(`Material staging result: ${(staging.results || []).map((row) => row.status).join(', ') || 'none'}`);

await request(executionBase, `/work-orders/${woId}/start-execution`, {
  method: 'POST',
  headers: { 'Idempotency-Key': `physical-print-e2e-start-${woId}` },
  body: '{}',
});

const deadline = Date.now() + Number(process.env.WAIT_SECONDS || 60) * 1000;
let final;
while (Date.now() < deadline) {
  final = await request(executionBase, `/work-orders/${woId}`);
  const operation = (final.operations || []).find((row) => row.wo_operation_id === printOperation.wo_operation_id);
  const job = (final.print_jobs || []).find((row) => row.wo_operation_id === printOperation.wo_operation_id);
  console.log(`Poll WO=${final.header?.status} operation=${operation?.status || '-'} print_job=${job?.status || '-'}`);
  if (final.header?.status === 'Completed' && operation?.status === 'Finished' && job?.status === 'Completed') {
    console.log(JSON.stringify({ success: true, wo_id: woId, wo_code: created.wo_code, print_job_id: job.print_job_id, printer: 'Zebra-GK420t-CUPS' }, null, 2));
    process.exit(0);
  }
  await new Promise((resolve) => setTimeout(resolve, 3000));
}

throw new Error(`E2E timeout for ${created.wo_code}; inspect ${executionBase}/work-orders/${woId}`);
