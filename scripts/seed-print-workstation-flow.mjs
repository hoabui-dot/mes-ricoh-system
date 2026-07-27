const baseUrl = (process.env.MES_MASTER_DATA_URL || 'http://localhost:18000/api/mes/master-data').replace(/\/$/, '');
const userId = process.env.MES_USER_ID || '00000000-0000-0000-0000-000000000001';
const headers = { 'X-User-ID': userId, 'X-Role-Code': process.env.MES_ROLE_CODE || 'PROD_MANAGER', 'Content-Type': 'application/json' };
const stationCode = 'PRINT-STATION-01';
const workstationCode = 'WS-MOLD-KIOSK01';
const siteCode = 'SITE-KZ3';

async function request(path, options = {}, allowStatuses = []) {
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) }, cache: 'no-store' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok && !allowStatuses.includes(response.status)) throw new Error(`${response.status} ${body.error || body.message || path}`);
  return { response, body };
}

async function data(path, options = {}) {
  const result = await request(path, options);
  return result.body.data ?? result.body;
}

const site = (await data('/sites?limit=500')).find((row) => row.code === siteCode);
if (!site) throw new Error(`Missing required site ${siteCode}`);
const workstation = (await data('/workstations?limit=500')).find((row) => row.code === workstationCode);
if (!workstation) throw new Error(`Missing required workstation ${workstationCode}`);
if (workstation.site_id !== site.master_id) throw new Error(`Workstation ${workstationCode} is not in ${siteCode}`);

const existingStations = await data('/print-stations?limit=500');
let station = existingStations.find((row) => row.code === stationCode);
const stationPayload = {
  code: stationCode,
  name: { vi: 'Trạm in nhãn MES 01', en: 'MES Label Print Station 01', ja: 'MESラベル印刷ステーション01', ko: 'MES 라벨 프린트 스테이션 01' },
  description: { vi: 'Station Agent vật lý cho luồng in nhãn sản xuất.', en: 'Physical Station Agent for the production label flow.', ja: '生産ラベル印刷用の物理Station Agent。', ko: '생산 라벨 흐름을 위한 물리 Station Agent입니다.' },
  site_id: site.master_id,
  gateway_base_url: process.env.PRINT_STATION_GATEWAY_URL || 'http://100.68.50.41:5001',
  deployment_mode: 'PHYSICAL',
  status: station?.status === 'DISABLED' ? 'PENDING' : (station?.status || 'PENDING'),
  capabilities: ['PRINT'],
};
if (!station) {
  station = await data('/print-stations', { method: 'POST', body: JSON.stringify(stationPayload) });
  console.log(`CREATED Print Station ${stationCode}`);
} else {
  if (station.site_id !== site.master_id) throw new Error(`Existing ${stationCode} belongs to another Site; refusing to move it.`);
  station = await data(`/print-stations/${station.master_id}`, { method: 'PATCH', body: JSON.stringify({ gateway_base_url: stationPayload.gateway_base_url, name: stationPayload.name, description: stationPayload.description, capabilities: stationPayload.capabilities }) });
  console.log(`UPDATED Print Station ${stationCode} without changing its Site`);
}

const bindings = await data(`/workstations/${workstation.master_id}/print-station-bindings`);
const active = bindings.filter((row) => row.is_active && (!row.effective_to || new Date(row.effective_to) > new Date()));
const activePrimary = active.find((row) => row.role === 'PRIMARY');
if (activePrimary && activePrimary.print_station_id !== station.master_id) throw new Error(`Workstation ${workstationCode} already has another active PRIMARY Print Station; refusing to replace it.`);
if (!active.find((row) => row.print_station_id === station.master_id && row.role === 'PRIMARY')) {
  await data(`/workstations/${workstation.master_id}/print-station-bindings`, { method: 'POST', body: JSON.stringify({ print_station_id: station.master_id, role: 'PRIMARY', allocated_printer_quantity: Number(process.env.PRINT_STATION_ALLOCATED_PRINTER_QUANTITY || 1) }) });
  console.log(`CREATED PRIMARY binding ${workstationCode} -> ${stationCode}`);
} else console.log(`PRIMARY binding already exists ${workstationCode} -> ${stationCode}`);

const resolved = await data(`/workstations/${workstation.master_id}/resolved-print-station`);
if (resolved.print_station_id !== station.master_id) throw new Error('Resolver did not select the seeded Print Station');
console.log(JSON.stringify({ site: site.code, workstation: workstation.code, print_station: station.code, gateway_base_url: station.gateway_base_url, deployment_mode: station.deployment_mode, resolved_role: resolved.role, resolved_status: resolved.print_station_status }, null, 2));

if (process.argv.includes('--health')) {
  const health = await request(`/print-stations/${station.master_id}/test-connection`, { method: 'POST' }, [503]);
  if (health.response.ok) console.log(`PASS: Station Gateway health check returned ${health.body.data?.status || 'ONLINE'}.`);
  else console.log('SKIPPED: Station Gateway health check was not reachable; station remains non-ONLINE.');
} else console.log('SKIPPED: external Station Gateway health check; use --health to probe it.');

console.log('PASS: Print Station workstation flow is seeded idempotently.');
