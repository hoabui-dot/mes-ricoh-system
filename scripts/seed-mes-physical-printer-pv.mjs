const base = process.env.MES_MASTER_DATA_URL || 'http://localhost:13020/api/mes/master-data';
const headers = {
  'Content-Type': 'application/json',
  'X-User-ID': process.env.MES_SEED_USER_ID || '00000000-0000-0000-0000-000000000001',
  'X-Role-Code': 'PLANT_MANAGER',
  'X-Trace-ID': 'seed-physical-printer-pv',
};
const config = {
  item_revision_id: '16e323c4-0cb8-41e6-ad57-3f2c4810a1bf',
  mbom_header_id: 'ebefe808-545b-4f22-9b70-6151a7557961',
  routing_header_id: 'bdf183f0-9d44-4674-8153-134ae7b151c3',
  name_i18n: { vi: 'Cấu hình sản xuất FG có in nhãn', en: 'FG Label Printing Production Configuration', ja: 'ラベル印刷付きFG生産構成', ko: '라벨 인쇄 FG 생산 구성' },
  min_lot_size: 1,
  max_lot_size: 1000,
  is_default: false,
};

async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status}: ${body.error || body.message || JSON.stringify(body)}`);
  return body;
}

const list = await request('/production-versions?limit=500');
let pv = (list.data || []).find((row) => row.name_i18n?.vi === config.name_i18n.vi && row.item_revision_id === config.item_revision_id && row.routing_header_id === config.routing_header_id);
if (!pv) {
  pv = await request('/production-versions', { method: 'POST', body: JSON.stringify(config) });
  console.log(`Created Production Version ${pv.code} (${pv.master_id})`);
} else console.log(`Using existing Production Version ${pv.code} (${pv.master_id})`);

const id = pv.master_id;
const validation = await request(`/production-versions/${id}/validate`, { method: 'POST' });
console.log(`Validation: ${validation.valid ? 'valid' : 'invalid'}`);
if (!validation.valid) { console.error(JSON.stringify(validation.failures, null, 2)); process.exit(1); }
if (pv.lifecycle_status !== 'Released') {
  const released = await request(`/production-versions/${id}/release`, { method: 'POST' });
  pv = released.data || released;
  console.log(`Released Production Version ${pv.code} (${pv.master_id})`);
} else console.log(`Already Released: ${pv.code}`);
console.log(JSON.stringify({ production_version_id: id, production_version_code: pv.code, ...config, site_code: 'SITE-KZ3', base_uom_code: 'PCS' }, null, 2));
