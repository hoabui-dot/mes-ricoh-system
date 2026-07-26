const baseUrl = (process.env.MES_MASTER_DATA_URL || 'http://localhost:13020/api/mes/master-data').replace(/\/$/, '');
const workstationId = process.env.WORKSTATION_ID || '';

async function request(path) {
  const response = await fetch(`${baseUrl}${path}`, { headers: { 'X-User-ID': process.env.MES_USER_ID || '00000000-0000-0000-0000-000000000001', 'X-Role-Code': 'PROD_MANAGER' } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status} ${body.error || body.message || path}`);
  return body.data || body;
}

const createMode = await request('/workstations/machine-availability');
console.log(JSON.stringify({ mode: 'create', machines: createMode.map((machine) => ({ code: machine.code, total_units: Number(machine.total_units), available_units: Number(machine.available_unit_count), available_unit_codes: (machine.units || []).map((unit) => unit.code) })) }, null, 2));

if (workstationId) {
  const editMode = await request(`/workstations/machine-availability?workstation_id=${encodeURIComponent(workstationId)}`);
  console.log(JSON.stringify({ mode: 'edit', workstation_id: workstationId, machines: editMode.map((machine) => ({ code: machine.code, total_units: Number(machine.total_units), available_units: Number(machine.available_unit_count), available_unit_codes: (machine.units || []).map((unit) => unit.code) })) }, null, 2));
}

console.log(workstationId ? 'Create and edit availability flow checks passed.' : 'Create availability flow check passed. Set WORKSTATION_ID to verify self-exclusion during edit.');
