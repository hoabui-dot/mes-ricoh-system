#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const runId = `PHASE5-PD-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const artifactDir = path.resolve(process.env.MES_PHASE5_PRODUCT_DEFINITION_DIR || path.join(repoRoot, 'artifacts', 'mes-console-remediation', 'phase-05', runId));
const masterBase = (process.env.MES_MASTER_DATA_URL || 'http://100.68.50.41:18000/api/mes/master-data').replace(/\/$/, '');
const headers = {
  'Content-Type': 'application/json',
  'X-User-ID': process.env.MES_E2E_USER_ID || '00000000-0000-0000-0000-000000000001',
  'X-Role-Code': process.env.MES_E2E_ROLE_CODE || 'PLANT_MANAGER',
  'X-Trace-ID': runId,
};
const results = [];

async function api(requestPath, init = {}, allowed = []) {
  const response = await fetch(`${masterBase}${requestPath}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { message: text }; }
  if (!response.ok && !allowed.includes(response.status)) throw new Error(`${init.method || 'GET'} ${requestPath} -> ${response.status}: ${JSON.stringify(body)}`);
  return { status: response.status, body: body?.data ?? body };
}

async function record(name, fn) {
  const startedAt = new Date().toISOString();
  try {
    const data = await fn();
    results.push({ name, status: 'passed', started_at: startedAt, finished_at: new Date().toISOString(), data });
    console.log(`[phase5-product-definition] PASS ${name}`);
    return data;
  } catch (error) {
    results.push({ name, status: 'failed', started_at: startedAt, finished_at: new Date().toISOString(), error: error.message });
    console.error(`[phase5-product-definition] FAIL ${name}: ${error.message}`);
    throw error;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  await fs.mkdir(artifactDir, { recursive: true });
  let finalStatus = 'failed';
  try {
    const context = await record('production version list exposes line eligibility summary', async () => {
      const rows = (await api('/production-versions?limit=500&lifecycle_status=Released')).body;
      const pv = rows.find((row) => row.code === 'WST-SEED-PV-SEAL-ASM-01') || rows.find((row) => Number(row.line_eligibility_count || 0) >= 2);
      assert(pv, 'No released Production Version with line eligibility summary found.');
      assert(Number(pv.line_eligibility_count) >= 2, `Expected at least two eligible lines: ${JSON.stringify(pv)}`);
      assert(pv.primary_line_code, `Expected primary_line_code on list row: ${JSON.stringify(pv)}`);
      assert(Array.isArray(pv.line_eligibility_summary), 'line_eligibility_summary must be an array.');
      return { production_version_id: pv.master_id, code: pv.code, line_eligibility_count: pv.line_eligibility_count, primary_line_code: pv.primary_line_code };
    });

    const eligibility = await record('line eligibility endpoint returns primary and backup rows', async () => {
      const rows = (await api(`/production-versions/${context.production_version_id}/line-eligibility`)).body;
      assert(rows.length >= 2, `Expected primary and backup rows: ${JSON.stringify(rows)}`);
      assert(rows.filter((row) => row.is_primary === true).length === 1, `Expected exactly one primary: ${JSON.stringify(rows)}`);
      assert(new Set(rows.filter((row) => row.active_flag !== false).map((row) => row.priority_no)).size === rows.filter((row) => row.active_flag !== false).length, 'Active priorities must be unique.');
      return rows.map((row) => ({ production_line_id: row.production_line_id, code: row.production_line_code, is_primary: row.is_primary, priority_no: row.priority_no }));
    });

    await record('readiness preview is backend authored', async () => {
      const preview = (await api(`/production-versions/${context.production_version_id}/line-readiness-preview`, { method: 'POST', body: '{}' })).body;
      assert(preview.production_version_id === context.production_version_id, 'Readiness preview returned wrong Production Version.');
      assert(preview.lines.length >= 2, `Expected readiness lines: ${JSON.stringify(preview)}`);
      for (const line of preview.lines) {
        assert(typeof line.readiness_status === 'string', `Missing readiness_status: ${JSON.stringify(line)}`);
        assert(Array.isArray(line.operations), `Missing operation evidence: ${JSON.stringify(line)}`);
      }
      return { effective_at: preview.effective_at, readiness: preview.lines.map((line) => ({ code: line.line_code, status: line.readiness_status, blockers: line.blockers?.length || 0 })) };
    });

    await record('production version validation remains authoritative', async () => {
      const validation = (await api(`/production-versions/${context.production_version_id}/validate`, { method: 'POST', body: '{}' })).body;
      assert(validation.valid === true, `Expected valid canonical Production Version: ${JSON.stringify(validation)}`);
      return { valid: validation.valid, failures: validation.failures || [] };
    });

    await record('line eligibility duplicate primary validation is rejected before mutation', async () => {
      const [first, second] = eligibility;
      const duplicatePrimary = await api(`/production-versions/${context.production_version_id}/line-eligibility`, {
        method: 'PUT',
        body: JSON.stringify({ lines: [{ production_line_id: first.production_line_id, is_primary: true, priority_no: 1 }, { production_line_id: second.production_line_id, is_primary: true, priority_no: 2 }] }),
      }, [422]);
      assert(duplicatePrimary.status === 422 && duplicatePrimary.body.error === 'PRODUCTION_VERSION_LINE_PRIMARY_REQUIRED', `Expected primary validation: ${JSON.stringify(duplicatePrimary)}`);
      return duplicatePrimary.body;
    });

    await record('line eligibility duplicate active priority is rejected and rolled back', async () => {
      const [first, second] = eligibility;
      const duplicatePriority = await api(`/production-versions/${context.production_version_id}/line-eligibility`, {
        method: 'PUT',
        body: JSON.stringify({ lines: [{ production_line_id: first.production_line_id, is_primary: true, priority_no: 1 }, { production_line_id: second.production_line_id, is_primary: false, priority_no: 1 }] }),
      }, [409]);
      assert(duplicatePriority.status === 409 && duplicatePriority.body.error === 'PRODUCTION_VERSION_LINE_PRIORITY_DUPLICATE', `Expected priority validation: ${JSON.stringify(duplicatePriority)}`);
      const after = (await api(`/production-versions/${context.production_version_id}/line-eligibility`)).body;
      assert(after.filter((row) => row.active_flag !== false).length >= 2, 'Eligibility rows were not rolled back after duplicate priority.');
      return duplicatePriority.body;
    });

    finalStatus = 'passed';
  } finally {
    const summary = {
      run_id: runId,
      status: finalStatus,
      declared: 6,
      executed: results.length,
      passed: results.filter((row) => row.status === 'passed').length,
      failed: results.filter((row) => row.status === 'failed').length,
      skipped: 0,
      results,
    };
    await fs.writeFile(path.join(artifactDir, 'product-definition-phase5-api-results.json'), JSON.stringify(summary, null, 2));
    await fs.writeFile(path.join(artifactDir, 'production-version-api-evidence.json'), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary, null, 2));
  }
}

main().catch((error) => {
  console.error(`[phase5-product-definition] FAILED: ${error.stack || error.message}`);
  process.exit(1);
});
