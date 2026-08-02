import { test, expect } from '@playwright/test';
import { credentials, login } from './phase3-helpers';

function rowsFrom(payload: any) {
  return Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
}

test('[@phase7] Worker Skill detail is read-only and links assignment edits to Employees', async ({ page }) => {
  const { base, headers } = await login(page, credentials.manager);
  const workerSkillResponse = await page.request.get(`${base}/api/mes/master-data/worker-skills`, { headers });
  expect(workerSkillResponse.ok()).toBeTruthy();
  const workerSkills = rowsFrom(await workerSkillResponse.json());
  const skill = workerSkills.find((row: any) => Number(row.active_assignment_count || 0) > 0) || workerSkills[0];
  expect(skill?.master_id, 'seeded Employee-scoped Worker Skill is required').toBeTruthy();

  const assignmentResponse = await page.request.get(`${base}/api/mes/master-data/worker-skills/${skill.master_id}/assignments`, { headers });
  expect(assignmentResponse.ok()).toBeTruthy();
  const assignments = rowsFrom(await assignmentResponse.json()).filter((row: any) => row.active_flag !== false);
  expect(assignments.length, 'Worker Skill assignment evidence is required').toBeGreaterThan(0);

  await page.goto('/master-data/skills/workers', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText(skill.code)).toBeVisible();
  await page.getByText(skill.code).click();

  await expect(page.getByText('Employee', { exact: true })).toBeVisible();
  await expect(page.getByText(/Read-only; edit on employee record|Chỉ xem; sửa tại hồ sơ nhân viên/i)).toBeVisible();
  await expect(page.getByLabel(/Quality inspection|Nhân sự kiểm tra chất lượng|Worker Skill/i).getByText(/Dependencies|Phụ thuộc/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /Assign|End assignment|Gán|Kết thúc/i })).toHaveCount(0);

  await page.getByRole('button', { name: /Edit employee skills|Sửa kỹ năng nhân viên/i }).first().click();
  await expect(page).toHaveURL(/\/employees\?employee_id=/);
  await expect(page.getByText(/Skill assignment preview|Xem trước phân công kỹ năng/i)).toBeVisible();
  await expect(page.getByText(/Assign skills on the employee record|Gán kỹ năng tại hồ sơ nhân viên/i)).toBeVisible();
  await expect(page.locator('label').filter({ hasText: /Qualification status|Trạng thái đủ điều kiện/i }).first()).toBeVisible();
  await expect(page.locator('input[type="date"]').last()).toBeVisible();
});
