#!/usr/bin/env node

const baseUrl = (process.env.MES_MASTER_DATA_URL || 'http://localhost:18000/api/mes/master-data').replace(/\/$/, '');
const userId = process.env.MES_VERIFY_USER_ID || '00000000-0000-0000-0000-000000000001';
const headers = { 'Content-Type': 'application/json', 'X-User-ID': userId, 'X-Role-Code': 'PROD_MANAGER' };

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path} -> ${response.status}: ${body.error || body.message || JSON.stringify(body)}`);
  return body;
}

function assert(condition, message) { if (!condition) throw new Error(`ASSERTION FAILED: ${message}`); }

const revisions = (await request('/item-revisions?limit=500')).data || [];
const uoms = (await request('/uoms?limit=500')).data || [];
const activeRevisions = revisions.filter((row) => !['Inactive', 'Obsolete'].includes(row.lifecycle_status));
const activeUoms = uoms.filter((row) => !['Inactive', 'Obsolete'].includes(row.lifecycle_status));
assert(activeRevisions.length > 0, 'an active Item Revision is required');
assert(activeUoms.length > 0, 'an active UOM is required');

const target = activeRevisions[0];
const component = activeRevisions[1] || activeRevisions[0];
const canMoveComponentToRoot = activeRevisions.length > 1;
const uom = activeUoms[0];
const name = { vi: `EBOM CRUD verification ${Date.now()}`, en: 'EBOM CRUD verification', ja: 'EBOM CRUD検証', ko: 'EBOM CRUD 검증' };
const description = { vi: 'Dữ liệu kiểm thử luồng EBOM đầy đủ.', en: 'Complete EBOM CRUD verification data.', ja: 'EBOM CRUD検証データ', ko: 'EBOM CRUD 검증 데이터' };

const created = await request('/ebom-headers', { method: 'POST', body: JSON.stringify({ name, description, item_revision_id: target.master_id }) });
const ebomId = created.data.master_id;
assert(created.data.code && created.data.code.startsWith('EBOM-'), 'backend owns the EBOM code');
console.log(`Created draft ${created.data.code} (${ebomId})`);

const initialTree = [
  { line_key: 'root', parent_line_id: '', seq: 10, component_revision_id: target.master_id, quantity_per: '2', uom_id: uom.master_id, reference_designator: 'ROOT', note: 'root', phantom_design_flag: false },
  { line_key: 'child', parent_line_id: 'root', seq: 10, component_revision_id: component.master_id, quantity_per: '1', uom_id: uom.master_id, reference_designator: 'CHILD', note: 'child', phantom_design_flag: false },
];
await request(`/ebom-headers/${ebomId}/design-tree`, { method: 'PUT', body: JSON.stringify({ lines: initialTree }) });
let detail = (await request(`/ebom-headers/${ebomId}`)).data;
assert(detail.lines.length === 2, 'initial tree has two current lines');
assert(detail.lines.some((line) => line.parent_line_id && line.seq === 10), 'child parent relationship hydrated');

const root = detail.lines.find((line) => !line.parent_line_id);
const child = detail.lines.find((line) => line.parent_line_id);
const editedTree = detail.lines.map((line) => ({ ...line, line_key: line.master_id, quantity_per: line.master_id === child.master_id ? '3' : line.quantity_per, parent_line_id: line.master_id === child.master_id && canMoveComponentToRoot ? '' : (line.parent_line_id || ''), seq: line.master_id === child.master_id ? 20 : 10 }));
await request(`/ebom-headers/${ebomId}/design-tree`, { method: 'PUT', body: JSON.stringify({ lines: editedTree }) });
detail = (await request(`/ebom-headers/${ebomId}`)).data;
assert(detail.lines.length === 2 && detail.lines.some((line) => Number(line.quantity_per) === 3), 'hierarchy and quantity edit persisted');

const kept = detail.lines[0];
await request(`/ebom-headers/${ebomId}/design-tree`, { method: 'PUT', body: JSON.stringify({ lines: [{ ...kept, line_key: kept.master_id, parent_line_id: '', quantity_per: '4' }] }) });
detail = (await request(`/ebom-headers/${ebomId}`)).data;
assert(detail.lines.length === 1 && Number(detail.lines[0].quantity_per) === 4, 'removed line stays inactive and is absent from current hydration');

const cyclePayload = [
  { line_key: 'a', parent_line_id: 'b', seq: 10, component_revision_id: component.master_id, quantity_per: '1', uom_id: uom.master_id },
  { line_key: 'b', parent_line_id: 'a', seq: 20, component_revision_id: component.master_id, quantity_per: '1', uom_id: uom.master_id },
];
try { await request(`/ebom-headers/${ebomId}/design-tree`, { method: 'PUT', body: JSON.stringify({ lines: cyclePayload }) }); throw new Error('cycle payload was accepted'); }
catch (error) { assert(String(error).includes('EBOM_HIERARCHY_CYCLE'), `cycle rejected with stable error (${error.message})`); }

await request(`/ebom-headers/${ebomId}/release`, { method: 'POST', body: '{}' });
try { await request(`/ebom-headers/${ebomId}/design-tree`, { method: 'PUT', body: JSON.stringify({ lines: [] }) }); throw new Error('released tree was editable'); }
catch (error) { assert(String(error).includes('EBOM_RELEASED_IMMUTABLE'), `released tree is immutable (${error.message})`); }

const converted = await request(`/ebom-headers/${ebomId}/create-mbom-draft`, { method: 'POST', body: '{}' });
assert(converted.mbom_id || converted.data?.master_id, 'conversion returns the created MBOM identifier');
const mbomId = converted.mbom_id || converted.data.master_id;
const mbomLines = (await request(`/mbom-lines?limit=500`)).data || [];
const traced = mbomLines.filter((line) => line.mbom_header_id === mbomId);
assert(traced.length === 1 && traced[0].source_ebom_line_id, 'MBOM line preserves source EBOM traceability');
const afterConvert = (await request(`/ebom-headers/${ebomId}`)).data;
assert(afterConvert.lines.length === 1 && Number(afterConvert.lines[0].quantity_per) === 4, 'conversion does not mutate EBOM');
console.log(`Verified release, immutability, conversion and traceability -> MBOM ${mbomId}`);
console.log(`Verification EBOM retained for audit: ${ebomId}`);
