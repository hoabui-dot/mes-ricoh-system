import { test, expect } from '@playwright/test';
import { credentials, login } from './phase3-helpers';

const canonicalWorkerSkillCodes = ['SK-EMP-MIX-MASTER', 'SK-EMP-VULCAN-OPERATOR', 'SK-EMP-INSPECTION'];
const retiredWorkerSkillCodes = ['SK-WC-MIX-MASTER', 'SK-WC-VULCAN-OPERATOR', 'SK-WC-INSPECTION'];

function rowsFrom(payload: any) {
  return Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
}

test('[@phase1] Worker Skill screens consume Employee-scoped canonical skills only', async ({ page }) => {
  await login(page, credentials.manager);

  const workerSkillResponse = page.waitForResponse((response) => response.url().includes('/api/mes/master-data/worker-skills') && response.request().method() === 'GET');
  await page.goto('/master-data/skills/workers', { waitUntil: 'domcontentloaded' });
  const workerSkillRows = rowsFrom(await (await workerSkillResponse).json());
  expect(workerSkillRows.map((row: any) => row.code).sort()).toEqual(canonicalWorkerSkillCodes.slice().sort());
  expect(workerSkillRows.every((row: any) => row.scope === 'Employee')).toBeTruthy();
  for (const code of canonicalWorkerSkillCodes) await expect(page.getByText(code)).toBeVisible();
  for (const code of retiredWorkerSkillCodes) await expect(page.getByText(code)).toHaveCount(0);

  const employeeSkillOptionResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.endsWith('/api/mes/master-data/skills') && url.searchParams.get('scope') === 'Employee' && response.request().method() === 'GET';
  });
  await page.goto('/employees', { waitUntil: 'domcontentloaded' });
  const employeeSkillRows = rowsFrom(await (await employeeSkillOptionResponse).json());
  expect(employeeSkillRows.map((row: any) => row.code).sort()).toEqual(canonicalWorkerSkillCodes.slice().sort());
  expect(employeeSkillRows.every((row: any) => row.scope === 'Employee')).toBeTruthy();

  const operationSkillOptionResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.endsWith('/api/mes/master-data/skills') && url.searchParams.get('scope') === 'Employee' && response.request().method() === 'GET';
  });
  await page.goto('/master-data/operation-skill-requirements/new', { waitUntil: 'domcontentloaded' });
  const operationSkillRows = rowsFrom(await (await operationSkillOptionResponse).json());
  expect(operationSkillRows.map((row: any) => row.code).sort()).toEqual(canonicalWorkerSkillCodes.slice().sort());
  expect(operationSkillRows.every((row: any) => row.scope === 'Employee')).toBeTruthy();
  for (const code of retiredWorkerSkillCodes) expect(operationSkillRows.map((row: any) => row.code)).not.toContain(code);
});
