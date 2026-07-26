#!/usr/bin/env node

const base = process.env.MES_MASTER_DATA_URL || 'http://127.0.0.1:13020';
const api = `${base.replace(/\/$/, '')}/api/mes/master-data`;
let pass = 0;
let fail = 0;
let skipped = 0;
const check = (label, condition, detail = '') => {
  if (condition) { console.log(`PASS ${label}`); pass += 1; }
  else { console.log(`FAIL ${label}${detail ? `: ${detail}` : ''}`); fail += 1; }
};
const skip = (label, detail) => { console.log(`SKIPPED_WITH_DOCUMENTED_GAP ${label}: ${detail}`); skipped += 1; };
async function request(path, init) {
  const response = await fetch(`${api}${path}`, init);
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

const health = await fetch(`${base.replace(/\/$/, '')}/health`);
check('MES master-data health', health.ok && (await health.text()).includes('"status":"ok"'));
const [sites, revisions, routingOperations, workCenters, shifts, capabilities, calendars, standards, skillRequirements] = await Promise.all([
  request('/sites?limit=100'), request('/item-revisions?limit=500'), request('/routing-operations?limit=500'), request('/work-centers?limit=100'),
  request('/shifts?limit=100'), request('/resource-capabilities?limit=500'), request('/resource-calendars?limit=500'), request('/production-standards?limit=500'), request('/operation-skill-requirements?limit=500'),
]);
check('Capability API', capabilities.response.ok && Array.isArray(capabilities.body.data));
check('Calendar API', calendars.response.ok && Array.isArray(calendars.body.data));
check('Production Standard API', standards.response.ok && Array.isArray(standards.body.data));
check('Operation Skill Requirement API', skillRequirements.response.ok && Array.isArray(skillRequirements.body.data));

const site = sites.body.data?.[0];
const revision = revisions.body.data?.find((row) => row.code === 'FG-WS-CM01-R1') || revisions.body.data?.[0];
const routingOperation = routingOperations.body.data?.find((row) => row.operation_code === 'OP-MOLD');
const workCenter = workCenters.body.data?.find((row) => row.code === 'WC-VULCAN-MOLD');
const shift = shifts.body.data?.[0];
check('Seeded planning context', Boolean(site && revision && routingOperation && workCenter && shift));
if (site && revision && routingOperation && workCenter && shift) {
  const readiness = await request('/resource-planning/readiness', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ site_id: site.master_id, product_revision_id: revision.master_id, routing_operation_id: routingOperation.master_id, work_center_id: workCenter.master_id, quantity: 100, planned_date: '2026-08-05', shift_id: shift.master_id }),
  });
  check('Planning readiness endpoint', readiness.response.ok && ['Ready', 'ReadyWithWarnings', 'Blocked'].includes(readiness.body.status));
  check('Deterministic candidate projection', Array.isArray(readiness.body.candidates) && readiness.body.candidates.every((candidate) => candidate.workstation?.code && candidate.readiness));
  check('Duration diagnostics', readiness.body.candidates?.every((candidate) => candidate.calculation?.formula && (candidate.estimated_duration_min === null || Number.isFinite(candidate.estimated_duration_min))));
  check('No persistent allocation', !Object.hasOwn(readiness.body, 'allocation_id'));
} else skip('Readiness integration', 'Demo database does not contain a complete planning context.');

skip('Isolated mutation lifecycle', 'The script is non-destructive by default; create/maintenance/calendar mutation scenarios require an explicit test database and are not run against the shared demo database.');
skip('Employee skill availability proof', 'Phase 2 returns skill requirements but does not claim employee schedule qualification.');
console.log(`SUMMARY PASS=${pass} FAIL=${fail} SKIPPED_WITH_DOCUMENTED_GAP=${skipped}`);
process.exitCode = fail ? 1 : 0;
