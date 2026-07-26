#!/usr/bin/env node

const executionUrl = process.env.MES_EXECUTION_URL || 'http://localhost:13030';
const masterDataUrl = process.env.MES_MASTER_DATA_URL || 'http://localhost:13020';
const woId = process.env.WO_ID;
const operationId = process.env.WO_OPERATION_ID;

async function check(name, url, options) {
  const response = await fetch(url, options);
  const body = await response.text();
  if (!response.ok) throw new Error(`${name} ${response.status}: ${body.slice(0, 300)}`);
  console.log(`PASS ${name}`);
  return body ? JSON.parse(body) : {};
}

try {
  await check('master-data health', `${masterDataUrl}/health`);
  await check('execution health', `${executionUrl}/health`);
  if (!woId || !operationId) {
    console.log('SKIPPED_WITH_DOCUMENTED_GAP isolated allocation mutation flow: set WO_ID and WO_OPERATION_ID for a fixture-scoped candidate/revalidation run');
    process.exit(0);
  }
  const headers = { 'X-User-ID': process.env.MES_TEST_USER_ID || '00000000-0000-0000-0000-000000000001', 'X-Trace-ID': `phase-3-${Date.now()}` };
  await check('work-order detail', `${executionUrl}/api/mes/execution/work-orders/${woId}`, { headers });
  const candidate = await check('resource candidates', `${executionUrl}/api/mes/execution/work-orders/${woId}/operations/${operationId}/resource-candidates`, { headers });
  if (!Array.isArray(candidate.candidates)) throw new Error('candidate response has no candidates array');
  await check('resource allocation revalidation', `${executionUrl}/api/mes/execution/work-orders/${woId}/resource-allocations/revalidate`, { method: 'POST', headers });
  console.log('SKIPPED_WITH_DOCUMENTED_GAP mutation/conflict/reallocation: this script does not mutate the shared demo database');
} catch (error) {
  console.error(`FAIL ${error.message}`);
  process.exit(1);
}
