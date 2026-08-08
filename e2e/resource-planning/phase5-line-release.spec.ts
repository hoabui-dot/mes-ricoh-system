import { test, expect } from '@playwright/test';
import { Client } from 'pg';
import { credentials, login, requireMutationEnvironment } from './phase3-helpers';

async function cleanupFixtures(lineIds: string[], assignmentIds: string[]) {
  if (!lineIds.length && !assignmentIds.length) return;
  const client = new Client({ connectionString: process.env.MES_MASTER_DATA_DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    if (lineIds.length) {
      await client.query('DELETE FROM md_production_line_resource_scope WHERE production_line_id = ANY($1::uuid[])', [lineIds]);
      await client.query('DELETE FROM md_production_line_work_center WHERE production_line_id = ANY($1::uuid[])', [lineIds]);
      await client.query('DELETE FROM md_production_line WHERE master_id = ANY($1::uuid[])', [lineIds]);
    }
    if (assignmentIds.length) await client.query('DELETE FROM md_resource_assignment WHERE master_id = ANY($1::uuid[])', [assignmentIds]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

test('[@phase5] Production Line release is governed by structural backend readiness', async ({ page }) => {
  requireMutationEnvironment();
  const createdIds: string[] = [];
  const createdAssignmentIds: string[] = [];
  const { base, headers } = await login(page, credentials.manager);
  try {
    const [lineResponse, workCenterResponse, workstationResponse] = await Promise.all([
      page.request.get(`${base}/api/mes/master-data/production-lines?limit=500`, { headers }),
      page.request.get(`${base}/api/mes/master-data/work-centers?limit=500`, { headers }),
      page.request.get(`${base}/api/mes/master-data/workstations?limit=500`, { headers }),
    ]);
    expect(lineResponse.ok()).toBeTruthy();
    expect(workCenterResponse.ok()).toBeTruthy();
    expect(workstationResponse.ok()).toBeTruthy();
    const lines = (await lineResponse.json()).data || [];
    const usedWorkCenterIds = new Set<string>();
    for (const line of lines) {
      const detailResponse = await page.request.get(`${base}/api/mes/master-data/production-lines/${line.master_id}`, { headers });
      if (!detailResponse.ok()) continue;
      const detail = (await detailResponse.json()).data;
      for (const membership of detail.work_centers || []) if (membership.active_flag !== false && !membership.effective_to) usedWorkCenterIds.add(String(membership.work_center_id));
    }
    const workCenters = (await workCenterResponse.json()).data || [];
    const workstations = (await workstationResponse.json()).data || [];
    const sharedWorkCenter = workCenters.find((item: any) => item.lifecycle_status === 'Released' && item.active_flag !== false && !item.effective_to && usedWorkCenterIds.has(String(item.master_id)) && workstations.some((workstation: any) => workstation.work_center_id === item.master_id && workstation.lifecycle_status === 'Released' && workstation.active_flag !== false && !workstation.effective_to));
    expect(sharedWorkCenter, 'a Released Work Center with a Released Workstation is required').toBeTruthy();
    const workstation = workstations.find((item: any) => item.work_center_id === sharedWorkCenter.master_id && item.lifecycle_status === 'Released' && item.active_flag !== false && !item.effective_to);

    const assignmentCode = `E2E-P5-RA-${Date.now()}`;
    const assignmentResponse = await page.request.post(`${base}/api/mes/master-data/resource-assignments`, { headers, data: { code: assignmentCode, name: { vi: assignmentCode, en: assignmentCode }, site_id: sharedWorkCenter.site_id, work_center_id: sharedWorkCenter.master_id, workstation_id: workstation.master_id, assignment_role: 'Alternate', requirement_type: 'Required', scheduling_flag: true, effective_from: new Date().toISOString() } });
    expect(assignmentResponse.ok()).toBeTruthy();
    const assignment = (await assignmentResponse.json()).data;
    createdAssignmentIds.push(assignment.master_id);
    const assignmentRelease = await page.request.post(`${base}/api/mes/master-data/resource-assignments/${assignment.master_id}/release`, { headers });
    expect(assignmentRelease.ok()).toBeTruthy();

    const createLine = async (suffix: string) => {
      const code = `E2E-P5-${suffix}-${Date.now()}`;
      const response = await page.request.post(`${base}/api/mes/master-data/production-lines`, { headers, data: { code, name: { vi: code, en: code }, site_id: sharedWorkCenter.site_id, area_id: sharedWorkCenter.area_id, lifecycle_status: 'Draft' } });
      expect(response.ok()).toBeTruthy();
      const row = (await response.json()).data;
      createdIds.push(row.master_id);
      return row;
    };

    const emptyLine = await createLine('EMPTY');
    const emptyReadiness = await page.request.get(`${base}/api/mes/master-data/production-lines/${emptyLine.master_id}/readiness`, { headers });
    expect(emptyReadiness.ok()).toBeTruthy();
    expect((await emptyReadiness.json()).data).toMatchObject({ ready: false, status: 'NotReady', blockers: [{ code: 'PRODUCTION_LINE_WORK_CENTER_REQUIRED', category: 'work_center', severity: 'blocking' }] });

    await page.goto(`/master-data/production-lines/${emptyLine.master_id}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: /Release Production Line|Phát hành dây chuyền/i })).toBeDisabled();
    await page.getByRole('button', { name: /Readiness|sẵn sàng/i }).click();
    await expect(page.getByText(/Cần cấu hình ít nhất một Work Center|At least one effective Work Center/i)).toBeVisible();

    const rejectedRelease = await page.request.post(`${base}/api/mes/master-data/production-lines/${emptyLine.master_id}/release`, { headers });
    expect(rejectedRelease.status()).toBe(422);
    const rejection = await rejectedRelease.json();
    expect(rejection).toMatchObject({ valid: false, error: 'PRODUCTION_LINE_RELEASE_NOT_READY', readiness: { ready: false } });

    const validLine = await createLine('READY');
    const membershipResponse = await page.request.put(`${base}/api/mes/master-data/production-lines/${validLine.master_id}/work-centers`, { headers, data: { work_centers: [{ work_center_id: sharedWorkCenter.master_id, sequence_no: 1, mandatory_flag: true }] } });
    expect(membershipResponse.ok()).toBeTruthy();
    const missingScopeReadiness = await page.request.get(`${base}/api/mes/master-data/production-lines/${validLine.master_id}/readiness`, { headers });
    expect(missingScopeReadiness.ok()).toBeTruthy();
    expect((await missingScopeReadiness.json()).data).toMatchObject({ ready: false, blockers: [{ code: 'PRODUCTION_LINE_RESOURCE_SCOPE_REQUIRED', category: 'resource_scope' }] });
    const missingScopeRelease = await page.request.post(`${base}/api/mes/master-data/production-lines/${validLine.master_id}/release`, { headers });
    expect(missingScopeRelease.status()).toBe(422);
    const scopeResponse = await page.request.put(`${base}/api/mes/master-data/production-lines/${validLine.master_id}/resource-scopes`, { headers, data: { resource_scopes: [{ resource_assignment_id: assignment.master_id }] } });
    expect(scopeResponse.ok()).toBeTruthy();
    const readyResponse = await page.request.get(`${base}/api/mes/master-data/production-lines/${validLine.master_id}/readiness`, { headers });
    expect(readyResponse.ok()).toBeTruthy();
    expect((await readyResponse.json()).data).toMatchObject({ ready: true, status: 'ReadyWithWarnings', blocker_count: 0, warnings: [{ code: 'PRODUCTION_LINE_ELIGIBILITY_NOT_CONFIGURED', severity: 'warning' }] });

    const releaseResponse = await page.request.post(`${base}/api/mes/master-data/production-lines/${validLine.master_id}/release`, { headers });
    expect(releaseResponse.ok()).toBeTruthy();
    const releasePayload = await releaseResponse.json();
    expect((releasePayload.data || releasePayload).lifecycle_status).toBe('Released');
    const releasedDetailResponse = await page.request.get(`${base}/api/mes/master-data/production-lines/${validLine.master_id}`, { headers });
    expect(releasedDetailResponse.ok()).toBeTruthy();
    const releasedDetail = (await releasedDetailResponse.json()).data;
    expect(releasedDetail).toMatchObject({ lifecycle_status: 'Released', readiness_summary: { ready: true, blocker_count: 0 } });
    expect(releasedDetail.approved_at).toBeTruthy();
  } finally {
    await cleanupFixtures(createdIds, createdAssignmentIds);
  }
});
