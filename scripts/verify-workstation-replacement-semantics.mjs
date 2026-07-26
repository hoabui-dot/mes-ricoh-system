const baseUrl = (process.env.MES_MASTER_DATA_URL || 'http://localhost:13020/api/mes/master-data').replace(/\/$/, '');
const workstationId = process.env.WORKSTATION_ID || '';
const userId = process.env.MES_USER_ID || '00000000-0000-0000-0000-000000000001';
const headers = { 'X-User-ID': userId, 'X-Role-Code': process.env.MES_ROLE_CODE || 'PROD_MANAGER', 'Content-Type': 'application/json' };

if (!workstationId) throw new Error('Set WORKSTATION_ID before running replacement verification.');

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) }, cache: 'no-store' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status} ${body.error || body.message || path}`);
  return body.data || body;
}

function currentIds(rows, key) {
  return rows.map((row) => String(row[key])).filter(Boolean);
}

function capabilityPayload(rows) {
  return rows.map((row) => ({ operation_id: row.operation_id, cycle_time_sec: Number(row.cycle_time_sec), setup_time_min: Number(row.setup_time_min || 0), base_quantity: Number(row.base_quantity || 1), efficiency_factor: Number(row.efficiency_factor || 1), scheduling_mode: row.scheduling_mode || 'Finite', effective_from: row.effective_from }));
}

function groupPayload(rows) {
  return rows.map((group) => ({ name: group.name, description: group.description, group_type: group.group_type, status: group.lifecycle_status, effective_from: group.effective_from, effective_to: group.effective_to, requirements: (group.requirements || []).map((line) => ({ machine_id: line.machine_id, role: line.role || 'Supporting', required_quantity: Number(line.required_quantity || 1), requirement_type: line.requirement_type || 'Required', pinned_machine_unit_ids: line.pinned_machine_unit_ids || [] })) }));
}

async function verifyCapabilities(original) {
  const originalIds = currentIds(original, 'operation_id');
  await request(`/workstations/${workstationId}/operation-capabilities`, { method: 'PUT', body: JSON.stringify({ capabilities: capabilityPayload(original) }) });
  const unchanged = await request(`/workstations/${workstationId}/operation-capabilities`);
  const unchangedIds = currentIds(unchanged, 'operation_id');
  if (new Set(unchangedIds).size !== unchangedIds.length || unchangedIds.sort().join() !== [...originalIds].sort().join()) throw new Error('FAIL: unchanged capability replacement did not preserve exactly one active row per operation.');
  console.log(`PASS: unchanged capabilities replace successfully (${unchangedIds.length} active row(s)).`);
  const operations = await request('/operations');
  const additional = operations.find((operation) => operation.active_flag !== false && !originalIds.includes(String(operation.master_id)));
  if (additional) {
    const addedEntry = { operation_id: additional.master_id, cycle_time_sec: 60, setup_time_min: 0, base_quantity: 1, efficiency_factor: 1, scheduling_mode: 'Finite' };
    try {
      await request(`/workstations/${workstationId}/operation-capabilities`, { method: 'PUT', body: JSON.stringify({ capabilities: [...capabilityPayload(original), addedEntry] }) });
      const afterAdd = await request(`/workstations/${workstationId}/operation-capabilities`);
      const addedIds = currentIds(afterAdd, 'operation_id');
      if (addedIds.filter((id) => id === String(additional.master_id)).length !== 1) throw new Error('FAIL: added Operation did not create exactly one active capability row.');
      console.log(`PASS: added Operation ${additional.code || additional.master_id} created exactly one active row.`);
    } finally {
      await request(`/workstations/${workstationId}/operation-capabilities`, { method: 'PUT', body: JSON.stringify({ capabilities: capabilityPayload(original) }) });
      const afterRemove = await request(`/workstations/${workstationId}/operation-capabilities`);
      if (currentIds(afterRemove, 'operation_id').includes(String(additional.master_id))) throw new Error(`FAIL: removed Operation ${additional.code || additional.master_id} remains active after restore.`);
      console.log(`PASS: removed Operation ${additional.code || additional.master_id} is absent after replacement.`);
    }
  }
  if (original.length < 2) return;
  const removedId = originalIds[originalIds.length - 1];
  try {
    await request(`/workstations/${workstationId}/operation-capabilities`, { method: 'PUT', body: JSON.stringify({ capabilities: capabilityPayload(original.slice(0, -1)) }) });
    const afterRemove = await request(`/workstations/${workstationId}/operation-capabilities`);
    if (currentIds(afterRemove, 'operation_id').includes(removedId)) throw new Error(`FAIL: removed operation ${removedId} remains active.`);
    console.log(`PASS: removed operation ${removedId} is ended and absent from current hydration.`);
  } finally {
    await request(`/workstations/${workstationId}/operation-capabilities`, { method: 'PUT', body: JSON.stringify({ capabilities: capabilityPayload(original) }) });
  }
}

async function verifyGroups(original) {
  if (!original.length) throw new Error('FAIL: Workstation has no current Machine Groups.');
  await request(`/workstations/${workstationId}/machine-groups`, { method: 'PUT', body: JSON.stringify({ groups: groupPayload(original) }) });
  const current = await request(`/workstations/${workstationId}/machine-groups`);
  const ids = currentIds(current, 'master_id');
  if (ids.length !== original.length || new Set(ids).size !== ids.length) throw new Error('FAIL: unchanged Machine Group replacement did not return exactly the submitted current groups.');
  console.log(`PASS: unchanged Machine Groups replace successfully (${ids.length} active group(s)).`);
}

async function verifySkills(original) {
  const originalIds = currentIds(original, 'skill_id');
  await request(`/resource-skill-assignments/Workstation/${workstationId}`, { method: 'PUT', body: JSON.stringify({ skill_ids: originalIds }) });
  const current = await request(`/resource-skill-assignments?resource_type=Workstation&resource_id=${encodeURIComponent(workstationId)}`);
  const ids = currentIds(current, 'skill_id');
  if (new Set(ids).size !== ids.length || ids.sort().join() !== [...originalIds].sort().join()) throw new Error('FAIL: unchanged Workstation Skills replacement did not preserve exactly the submitted active set.');
  console.log(`PASS: unchanged Workstation Skills replace successfully (${ids.length} active row(s)).`);
}

const detail = await request(`/workstations/${encodeURIComponent(workstationId)}`);
const capabilities = detail.operation_capabilities || [];
const groups = detail.machine_groups || [];
const skills = await request(`/resource-skill-assignments?resource_type=Workstation&resource_id=${encodeURIComponent(workstationId)}`);
console.log(JSON.stringify({ workstation_id: workstationId, current_capabilities: capabilities.length, current_groups: groups.length, current_skills: skills.length }, null, 2));
await verifyCapabilities(capabilities);
await verifyGroups(groups);
await verifySkills(skills);
console.log('PASS: Workstation repeatable-section replacement semantics verified.');
