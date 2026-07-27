const baseUrl = (process.env.MES_MASTER_DATA_URL || 'http://localhost:18000/api/mes/master-data').replace(/\/$/, '');
const headers = { 'X-User-ID': process.env.MES_USER_ID || '00000000-0000-0000-0000-000000000001', 'X-Role-Code': process.env.MES_ROLE_CODE || 'PROD_MANAGER' };
const stationCode = process.env.PRINT_STATION_CODE || 'PRINT-STATION-01';
const workstationCode = process.env.PRINT_WORKSTATION_CODE || 'WS-MOLD-KIOSK01';

async function request(path) {
  const response = await fetch(`${baseUrl}${path}`, { headers, cache: 'no-store' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`FAIL ${response.status}: ${body.error || body.message || path}`);
  return body.data ?? body;
}

const stations = await request('/print-stations?limit=500');
const station = stations.find((row) => row.code === stationCode);
if (!station) throw new Error(`FAIL: missing ${stationCode}`);
if (!['PHYSICAL', 'SIMULATION', 'HYBRID'].includes(station.deployment_mode)) throw new Error('FAIL: invalid deployment mode');
if (station.gateway_base_url.endsWith('//')) throw new Error('FAIL: duplicated gateway separator');
console.log(`PASS: Print Station ${stationCode} exists with ${station.status} status.`);

const workstations = await request('/workstations?limit=500');
const workstation = workstations.find((row) => row.code === workstationCode);
if (!workstation) throw new Error(`FAIL: missing ${workstationCode}`);
const bindings = await request(`/workstations/${workstation.master_id}/print-station-bindings`);
const activePrimary = bindings.find((row) => row.is_active && row.role === 'PRIMARY' && row.print_station_id === station.master_id);
if (!activePrimary) throw new Error(`FAIL: missing active PRIMARY binding ${workstationCode} -> ${stationCode}`);
if (!Number.isInteger(Number(activePrimary.allocated_printer_quantity)) || Number(activePrimary.allocated_printer_quantity) <= 0) throw new Error('FAIL: active binding has no positive allocated printer quantity');
console.log(`PASS: active PRIMARY binding exists for ${workstationCode}.`);

const resolved = await request(`/workstations/${workstation.master_id}/resolved-print-station`);
if (resolved.print_station_id !== station.master_id || resolved.role !== 'PRIMARY') throw new Error('FAIL: resolver did not select the active PRIMARY station');
console.log(`PASS: resolver selected ${resolved.print_station_code} for ${workstationCode}.`);

const health = await request(`/print-stations/${station.master_id}/health`);
if (health.code !== stationCode) throw new Error('FAIL: health projection identity mismatch');
if (health.status === 'ONLINE') console.log('PASS: last Station Gateway health is ONLINE.');
else console.log(`SKIPPED: external health is ${health.status}; run seed with --health to refresh it.`);
console.log('PASS: MES Print Station integration verification completed.');
