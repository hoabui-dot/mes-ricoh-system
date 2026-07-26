#!/usr/bin/env node

const baseUrl = (process.env.MES_MASTER_DATA_URL || 'http://localhost:13020/api/mes/master-data').replace(/\/$/, '');
const runId = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const headers = { 'content-type': 'application/json', 'x-user-id': process.env.MES_TEST_USER_ID || '00000000-0000-0000-0000-000000000001' };

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  return { response, body };
}

function data(body) { return body?.data ?? body; }
function rows(body) { const value = data(body); return Array.isArray(value) ? value : value?.rows || []; }
function fail(message, extra) { throw new Error(`${message}${extra ? `: ${JSON.stringify(extra)}` : ''}`); }
function assert(condition, message, extra) { if (!condition) fail(message, extra); }

const created = [];
try {
  const [workstationsResult, workCentersResult, routingsResult] = await Promise.all([
    request('/workstations?limit=500'), request('/work-centers?limit=500'), request('/routing-headers?limit=500'),
  ]);
  assert(workstationsResult.response.ok, 'Could not load Workstations', workstationsResult.body);
  assert(workCentersResult.response.ok, 'Could not load Work Centers', workCentersResult.body);
  const workstations = rows(workstationsResult.body).filter((row) => row.active_flag !== false);
  const workCenters = rows(workCentersResult.body).filter((row) => row.active_flag !== false);
  assert(workstations.length > 0, 'No active Workstation fixture exists');
  assert(workCenters.length > 0, 'No active Work Center fixture exists');
  const workstation = workstations.find((row) => row.work_center_id) || workstations[0];
  const workCenter = workCenters.find((row) => row.master_id === workstation.work_center_id) || workCenters[0];

  const reservation = await request('/business-codes/reservations', { method: 'POST', body: JSON.stringify({ entity_type: 'Operation' }) });
  assert(reservation.response.ok, 'Operation code reservation failed', reservation.body);
  const reservationData = data(reservation.body);
  const operation = await request('/operations', { method: 'POST', body: JSON.stringify({
    code_reservation_id: reservationData.reservation_id,
    name: { vi: `Kiểm thử công đoạn ${runId}`, en: `Flow test operation ${runId}`, ja: `フローテスト工程 ${runId}`, ko: `흐름 테스트 공정 ${runId}` },
    description: { vi: 'Dữ liệu kiểm thử luồng Operation - Workstation - Work Center.', en: 'Integration fixture for the Operation capability flow.', ja: '工程能力フローの統合テスト用データ。', ko: '공정 능력 흐름 통합 테스트 데이터.' },
    operation_type: 'Production', confirmation_mode: 'StartFinish', quantity_reporting: 'GoodOnly',
    requires_material_scan: false, requires_output_label: false, allow_partial_completion: false, is_schedulable: true,
  }) });
  assert(operation.response.ok, 'Central Operation creation failed', operation.body);
  const operationRow = data(operation.body);
  created.push(operationRow);
  assert(operationRow.code?.startsWith('OP-'), 'Operation code was not backend generated', operationRow);

  const capability = await request(`/workstations/${workstation.master_id}/operation-capabilities`, { method: 'POST', body: JSON.stringify({ operation_id: operationRow.master_id, cycle_time_sec: 60, setup_time_min: 5, base_quantity: 1, efficiency_factor: 1, scheduling_mode: 'Finite' }) });
  assert(capability.response.ok, 'Workstation capability creation failed', capability.body);
  const capabilityList = await request(`/workstations/${workstation.master_id}/operation-capabilities`);
  assert(capabilityList.response.ok && rows(capabilityList.body).some((row) => row.operation_id === operationRow.master_id), 'Created capability was not readable');

  const composition = await request(`/work-centers/${workCenter.master_id}/composition`);
  assert(composition.response.ok, 'Could not load Work Center composition', composition.body);
  const currentEntries = rows(composition.body).reduce((map, row) => {
    const entry = map.get(row.workstation_id) || { workstation_id: row.workstation_id, operation_ids: [] };
    if (!entry.operation_ids.includes(row.operation_id)) entry.operation_ids.push(row.operation_id);
    map.set(row.workstation_id, entry);
    return map;
  }, new Map());
  const selectedEntry = currentEntries.get(workstation.master_id) || { workstation_id: workstation.master_id, operation_ids: [] };
  if (!selectedEntry.operation_ids.includes(operationRow.master_id)) selectedEntry.operation_ids.push(operationRow.master_id);
  currentEntries.set(workstation.master_id, selectedEntry);
  const acceptedComposition = await request(`/work-centers/${workCenter.master_id}/composition`, { method: 'POST', body: JSON.stringify({ workstations: [...currentEntries.values()] }) });
  assert(acceptedComposition.response.ok, 'Supported Work Center composition was rejected', acceptedComposition.body);

  const allOperations = await request('/operations?limit=500');
  const selectedCapabilities = rows(capabilityList.body).map((row) => row.operation_id);
  const unsupportedOperation = rows(allOperations.body).find((row) => row.master_id !== operationRow.master_id && !selectedCapabilities.includes(row.master_id) && row.lifecycle_status !== 'Inactive' && row.lifecycle_status !== 'Obsolete');
  if (unsupportedOperation) {
    const rejected = await request(`/work-centers/${workCenter.master_id}/composition`, { method: 'POST', body: JSON.stringify({ workstations: [{ workstation_id: workstation.master_id, operation_ids: [unsupportedOperation.master_id] }] }) });
    assert(!rejected.response.ok && rejected.body.error === 'WORKSTATION_OPERATION_NOT_SUPPORTED', 'Unsupported Workstation capability was accepted', rejected.body);
    console.log('PASS unsupported Workstation capability rejected by Work Center composition');
  } else {
    console.log('SKIPPED unsupported composition assertion: no unused active Operation fixture exists');
  }

  const detail = await request(`/operations/${operationRow.master_id}`);
  const dependencies = await request(`/operations/${operationRow.master_id}/dependencies`);
  assert(detail.response.ok && dependencies.response.ok, 'Operation detail/dependency endpoints failed');
  assert(data(detail.body).supporting_workstations?.some((row) => row.workstation_code === workstation.code), 'Operation detail did not expose supporting Workstation');
  assert(data(dependencies.body).referenced === true, 'Dependency endpoint did not report Work Center/Workstation references');
  const routingHeaders = rows(routingsResult.body);
  if (routingHeaders.length) {
    const routingOperations = await request('/routing-operations?limit=500');
    const routing = routingHeaders[0];
    const routeRows = routingOperations.response.ok ? rows(routingOperations.body).filter((row) => row.routing_header_id === routing.master_id) : [];
    const nextSeq = routeRows.reduce((max, row) => Math.max(max, Number(row.seq) || 0), 0) + 10;
    const deactivated = await request(`/operations/${operationRow.master_id}`, { method: 'PUT', body: JSON.stringify({ lifecycle_status: 'Inactive' }) });
    assert(deactivated.response.ok, 'Operation deactivation failed', deactivated.body);
    const rejectedRouting = await request('/routing-operations', { method: 'POST', body: JSON.stringify({ routing_header_id: routing.master_id, operation_id: operationRow.master_id, work_center_id: workCenter.master_id, seq: nextSeq }) });
    assert(!rejectedRouting.response.ok && rejectedRouting.body.error === 'ROUTING_OPERATION_INACTIVE', 'Inactive Operation was accepted by Routing', rejectedRouting.body);
    console.log('PASS inactive Operation rejected by Routing validation');
  } else {
    console.log('SKIPPED inactive Routing assertion: no Routing fixture exists');
  }
  console.log(`PASS Operation ${operationRow.code} -> Workstation ${workstation.code} -> Work Center ${workCenter.code}`);
  console.log('PASS backend-generated code, capability persistence, composition validation, detail, and dependency impact');
} catch (error) {
  console.error(`FAIL MES operation flow: ${error.message}`);
  process.exitCode = 1;
}
