const baseUrl = (process.env.MES_MASTER_DATA_URL || 'http://localhost:13020/api/mes/master-data').replace(/\/$/, '');
const workstationId = process.env.WORKSTATION_ID || '';
const userId = process.env.MES_USER_ID || '00000000-0000-0000-0000-000000000001';
const headers = { 'X-User-ID': userId, 'X-Role-Code': process.env.MES_ROLE_CODE || 'PROD_MANAGER', 'Content-Type': 'application/json' };

if (!workstationId) throw new Error('Set WORKSTATION_ID to a safe Workstation fixture before running this mutating verification.');

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) }, cache: 'no-store' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status} ${body.error || body.message || path}`);
  return body.data || body;
}

function normalizeGroups(groups) {
  return groups.map((group) => ({
    name: group.name,
    description: group.description,
    group_type: group.group_type,
    status: group.lifecycle_status || group.status,
    effective_from: group.effective_from,
    effective_to: group.effective_to,
    requirements: (group.requirements || []).map((line) => ({
      machine_id: line.machine_id,
      role: line.role || 'Supporting',
      required_quantity: Number(line.required_quantity || 1),
      requirement_type: line.requirement_type || 'Required',
      pinned_machine_unit_ids: line.resolved_units?.map((unit) => unit.machine_unit_id).filter(Boolean) || line.pinned_machine_unit_ids || [],
    })),
  }));
}

const original = await request(`/workstations/${encodeURIComponent(workstationId)}`);
const originalGroups = (original.machine_groups || []).filter((group) => group.lifecycle_status !== 'Inactive' && group.lifecycle_status !== 'Obsolete' && (!group.effective_to || new Date(group.effective_to) > new Date()));
if (originalGroups.length < 2) throw new Error(`Workstation has ${originalGroups.length} group(s); at least 2 are required for safe remove/reload verification.`);

const removed = originalGroups[originalGroups.length - 1];
const beforeCodes = originalGroups.map((group) => group.code);
console.log(JSON.stringify({ phase: 'before', workstation_id: workstationId, groups: originalGroups.map((group) => ({ id: group.master_id, code: group.code })) }, null, 2));

let mutationStarted = false;
try {
  await request(`/workstations/${encodeURIComponent(workstationId)}/machine-groups`, { method: 'PUT', body: JSON.stringify({ groups: normalizeGroups(originalGroups.slice(0, -1)) }) });
  mutationStarted = true;
  const afterDelete = await request(`/workstations/${encodeURIComponent(workstationId)}`);
  const afterCodes = (afterDelete.machine_groups || []).map((group) => group.code);
  console.log(JSON.stringify({ phase: 'after_remove', removed_group: { id: removed.master_id, code: removed.code }, groups: (afterDelete.machine_groups || []).map((group) => ({ id: group.master_id, code: group.code })) }, null, 2));
  if (afterCodes.includes(removed.code)) throw new Error(`FAIL: removed group ${removed.code} is still present after reload.`);
  console.log(`PASS: removed group ${removed.code} is absent after reload.`);
} finally {
  if (mutationStarted) {
    await request(`/workstations/${encodeURIComponent(workstationId)}/machine-groups`, { method: 'PUT', body: JSON.stringify({ groups: normalizeGroups(originalGroups) }) });
    const restored = await request(`/workstations/${encodeURIComponent(workstationId)}`);
    const restoredCodes = (restored.machine_groups || []).map((group) => group.code);
    if (beforeCodes.some((code) => !restoredCodes.includes(code))) throw new Error('FAIL: test fixture was not fully restored.');
    console.log(JSON.stringify({ phase: 'restored', groups: (restored.machine_groups || []).map((group) => ({ id: group.master_id, code: group.code })) }, null, 2));
  }
}
