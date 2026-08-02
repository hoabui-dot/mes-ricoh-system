import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

const baseUrl = (process.env.MES_MASTER_DATA_URL || 'http://localhost:13020/api/mes/master-data').replace(/\/$/, '');
const databaseUrl = process.env.DATABASE_URL || process.env.MES_MASTER_DATA_DATABASE_URL;
const headers = {
  'content-type': 'application/json',
  'x-user-id': process.env.MES_TEST_USER_ID || '00000000-0000-0000-0000-0000000000ad',
  'x-role-code': process.env.MES_TEST_ROLE_CODE || 'MES_ADMIN',
};
const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const prefix = `FLOW-${suffix}`;
const created = { machine: null, units: [], workstations: [] };
const result = { passed: 0, failed: 0, skipped: 0 };

const log = (kind, code, detail = '') => console.log(`[${kind}] ${code}${detail ? ` ${detail}` : ''}`);
const pass = (code, detail = '') => { result.passed += 1; log('PASS', code, detail); };
const fail = (code, detail = '') => { result.failed += 1; log('FAIL', code, detail); };
const skip = (code, detail) => { result.skipped += 1; log('SKIP', code, detail); };

async function api(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  return { response, body, data: body.data ?? body };
}

async function expect(code, request, predicate) {
  log('START', code);
  try {
    const value = await request();
    if (!predicate(value)) return fail(code, JSON.stringify({ status: value.response.status, body: value.body }));
    pass(code, `status=${value.response.status}`);
    return value;
  } catch (error) {
    fail(code, error instanceof Error ? error.message : String(error));
    return null;
  }
}

async function reserve(entityType) {
  const value = await api('/business-codes/reservations', { method: 'POST', body: JSON.stringify({ entity_type: entityType }) });
  if (!value.response.ok) throw new Error(`code reservation failed: ${JSON.stringify(value.body)}`);
  return value.data;
}

async function cleanup() {
  if (!databaseUrl) { skip('CLEANUP', 'DATABASE_URL or MES_MASTER_DATA_DATABASE_URL is not configured'); return; }
  const db = new Client({ connectionString: databaseUrl });
  await db.connect();
  try {
    await db.query('BEGIN');
    for (const id of created.workstations) {
      await db.query('DELETE FROM md_resource_assignment WHERE workstation_id = $1', [id]);
      await db.query('DELETE FROM md_workstation_machine_requirement WHERE machine_group_id IN (SELECT master_id FROM md_workstation_machine_group WHERE workstation_id = $1)', [id]);
      await db.query('DELETE FROM md_workstation_machine_group WHERE workstation_id = $1', [id]);
      await db.query('DELETE FROM md_workstation WHERE master_id = $1', [id]);
    }
    if (created.machine) {
      await db.query('DELETE FROM md_resource_assignment WHERE equipment_id = $1', [created.machine]);
      await db.query('DELETE FROM md_workstation_machine_requirement WHERE machine_id = $1', [created.machine]);
      await db.query('DELETE FROM md_machine_unit WHERE machine_id = $1', [created.machine]);
      await db.query('DELETE FROM md_equipment WHERE master_id = $1', [created.machine]);
    }
    await db.query('COMMIT');
    log('CLEANUP', 'PASS');
  } catch (error) {
    await db.query('ROLLBACK');
    log('CLEANUP', 'FAIL', error.message);
    result.failed += 1;
  } finally { await db.end(); }
}

try {
  const sites = (await api('/sites?limit=100')).data || [];
  const centers = (await api('/work-centers?limit=100')).data || [];
  const releasedCenters = centers.filter((item) => item.lifecycle_status === 'Released' && item.active_flag !== false);
  const site = sites.find((item) => item.code === 'SITE-KZ3' && releasedCenters.some((center) => center.site_id === item.master_id))
    || sites.find((item) => item.lifecycle_status === 'Released' && releasedCenters.some((center) => center.site_id === item.master_id))
    || sites[0];
  const center = releasedCenters.find((item) => item.site_id === site?.master_id) || releasedCenters[0];
  if (!site || !center) throw new Error('A Site and Work Center fixture are required');

  const reservation = await reserve('Machine');
  const machine = await expect('MD_CREATE', () => api('/equipment', { method: 'POST', body: JSON.stringify({
    code_reservation_id: reservation.reservation_id,
    name: { vi: `Machine flow ${suffix}`, en: `Machine flow ${suffix}` }, site_id: site.master_id,
    work_center_id: center.master_id, equipment_type: 'VerificationPress', manufacturer: 'MES Test',
    model: 'FLOW-1', quantity: 1, default_efficiency: 1, planning_resource_flag: true, lifecycle_status: 'Draft',
  }) }), (value) => value.response.status === 201 && value.data.serial_number == null);
  if (!machine) throw new Error('Machine Definition fixture was not created');
  created.machine = machine.data.master_id;

  let units = (await api(`/machines/${created.machine}/units`)).data || [];
  const first = units[0];
  const identified = await expect('UNIT_IDENTIFY', () => api(`/machine-units/${first.machine_unit_id}`, { method: 'PUT', body: JSON.stringify({ code: `${prefix}-U1`, serial_number: `${prefix}-SN1`, lifecycle_status: 'Released' }) }), (value) => value.response.ok && value.data.physical_identity_status === 'Identified' && value.data.planning_resource_flag === true);
  if (identified) created.units.push(identified.data.machine_unit_id);
  for (const sequence of [2, 3]) {
    const unit = await expect(`UNIT_CREATE_${sequence}`, () => api(`/machines/${created.machine}/units`, { method: 'POST', body: JSON.stringify({ code: `${prefix}-U${sequence}`, serial_number: `${prefix}-SN${sequence}`, unit_sequence: sequence }) }), (value) => value.response.status === 201);
    if (unit) created.units.push(unit.data.machine_unit_id);
  }
  units = (await api(`/machines/${created.machine}/units`)).data || [];
  await expect('UNIT_DUPLICATE_CODE', () => api(`/machines/${created.machine}/units`, { method: 'POST', body: JSON.stringify({ code: `${prefix}-U1`, serial_number: `${prefix}-DUP`, unit_sequence: 10 }) }), (value) => value.response.status === 409);
  await expect('UNIT_DUPLICATE_SERIAL', () => api(`/machines/${created.machine}/units`, { method: 'POST', body: JSON.stringify({ code: `${prefix}-DUP`, serial_number: `${prefix}-SN1`, unit_sequence: 11 }) }), (value) => value.response.status === 409);
  await expect('MD_SUMMARY', () => api('/equipment?limit=100'), (value) => { const row = value.data.find((item) => item.master_id === created.machine); return value.response.ok && Number(row?.total_unit_count) === 3 && Number(row?.identified_unit_count) === 3 && Number(row?.planning_eligible_unit_count) === 3; });

  const maintenanceUnit = units[0];
  await expect('UNIT_MAINTENANCE', () => api(`/machine-units/${maintenanceUnit.machine_unit_id}`, { method: 'PUT', body: JSON.stringify({ execution_status: 'Maintenance' }) }), (value) => value.response.ok && value.data.execution_status === 'Maintenance' && value.data.planning_resource_flag === false);
  units = (await api(`/machines/${created.machine}/units`)).data || [];
  if (units.filter((unit) => unit.machine_unit_id !== maintenanceUnit.machine_unit_id).every((unit) => unit.execution_status === 'Available')) pass('UNIT_SIBLING_ISOLATION'); else fail('UNIT_SIBLING_ISOLATION');

  const requirement = { name: { vi: 'Flow group', en: 'Flow group' }, requirements: [{ machine_id: created.machine, machine_unit_id: maintenanceUnit.machine_unit_id, role: 'Primary', requirement_type: 'Required', required_quantity: 1 }] };
  const blockedCode = await reserve('Workstation');
  await expect('MAINTENANCE_ASSIGNMENT_BLOCKED', () => api('/workstations', { method: 'POST', body: JSON.stringify({ code_reservation_id: blockedCode.reservation_id, name: { vi: `Blocked ${suffix}`, en: `Blocked ${suffix}` }, work_center_id: center.master_id, machine_groups: [requirement], execution_mode: 'Manual', active_flag: true }) }), (value) => value.response.status === 422 && ['MACHINE_UNIT_NOT_AVAILABLE', 'MACHINE_REQUIREMENT_QUANTITY_UNAVAILABLE'].includes(value.body.error));
  await api(`/machine-units/${maintenanceUnit.machine_unit_id}`, { method: 'PUT', body: JSON.stringify({ execution_status: 'Available', lifecycle_status: 'Released' }) });
  const workstationCode = await reserve('Workstation');
  const workstation = await expect('WORKSTATION_CREATE', () => api('/workstations', { method: 'POST', body: JSON.stringify({ code_reservation_id: workstationCode.reservation_id, name: { vi: `Machine flow ${suffix}`, en: `Machine flow ${suffix}` }, work_center_id: center.master_id, machine_groups: [requirement], execution_mode: 'Manual', active_flag: true }) }), (value) => value.response.status === 201);
  if (workstation) {
    const workstationId = workstation.data.master_id;
    created.workstations.push(workstationId);
    await expect('ASSIGNMENT_REPLACEMENT', () => api(`/workstations/${workstationId}/machine-groups`, { method: 'PUT', body: JSON.stringify({ groups: [requirement] }) }), (value) => value.response.ok);
    const conflictCode = await reserve('Workstation');
    await expect('UNIT_CONFLICT', () => api('/workstations', { method: 'POST', body: JSON.stringify({ code_reservation_id: conflictCode.reservation_id, name: { vi: `Conflict ${suffix}`, en: `Conflict ${suffix}` }, work_center_id: center.master_id, machine_groups: [requirement], execution_mode: 'Manual', active_flag: true }) }), (value) => value.response.status === 409);
  }

  if (databaseUrl) {
    const db = new Client({ connectionString: databaseUrl }); await db.connect();
    try { await db.query(`INSERT INTO md_machine_unit (machine_id, code, unit_sequence, lifecycle_status, physical_identity_status, planning_resource_flag, execution_status, active_flag) VALUES ($1,$2,99,'Draft','PendingIdentification',FALSE,'Available',TRUE)`, [created.machine, `${prefix}-PENDING`]); } finally { await db.end(); }
    await expect('PENDING_IDENTITY_BLOCKED', () => api(`/machines/${created.machine}/units`), (value) => value.response.ok && value.data.some((unit) => unit.code === `${prefix}-PENDING` && unit.planning_resource_flag === false));
  } else skip('PENDING_IDENTITY_BLOCKED', 'database URL is not configured');
  await api(`/equipment/${created.machine}`, { method: 'PUT', body: JSON.stringify({ lifecycle_status: 'Obsolete' }) });
  await expect('DEFINITION_DELETE_BLOCKED', () => api(`/equipment/${created.machine}`, { method: 'DELETE' }), (value) => value.response.status === 409);
} catch (error) {
  fail('FATAL', error instanceof Error ? error.message : String(error));
} finally {
  await cleanup();
  console.log(`Total: ${result.passed + result.failed + result.skipped}`);
  console.log(`Passed: ${result.passed}`);
  console.log(`Failed: ${result.failed}`);
  console.log(`Skipped: ${result.skipped}`);
  process.exitCode = result.failed ? 1 : 0;
}
