import { test, expect } from '@playwright/test';
import { credentials, login, requireMutationEnvironment } from './phase3-helpers';

test('[@phase6] Production Line master-data authoring route is available in MES Console', async ({ page }) => {
  requireMutationEnvironment();
  await login(page, credentials.manager);

  const listResponse = page.waitForResponse((response) => response.url().includes('/api/mes/master-data/production-lines') && response.request().method() === 'GET');
  await page.goto('/master-data/production-lines', { waitUntil: 'domcontentloaded' });
  await expect.poll(async () => (await listResponse).ok(), { timeout: 15_000 }).toBeTruthy();
  await expect(page.getByRole('heading', { name: /Production Lines|Dây chuyền sản xuất/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Create|Tạo/i })).toBeVisible();

  await page.getByRole('button', { name: /Create|Tạo/i }).click();
  await expect(page).toHaveURL(/\/master-data\/production-lines\/new$/);
  await expect(page.getByRole('heading', { name: /Create.*Production Lines|Tạo.*Dây chuyền sản xuất/i })).toBeVisible();
  await expect(page.getByText(/Site|Factory|Nhà máy/i).first()).toBeVisible();
  await expect(page.getByText(/Production Area|Khu vực sản xuất/i).first()).toBeVisible();
  await expect(page.getByText(/Line type|Loại dây chuyền/i)).toBeVisible();
});

test('[@phase6] Production Line detail exposes resource hierarchy tabs and backend readiness', async ({ page }) => {
  requireMutationEnvironment();
  const { base, headers } = await login(page, credentials.manager);
  const response = await page.request.get(`${base}/api/mes/master-data/production-lines?limit=1`, { headers });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  const line = body.data?.[0];
  expect(line?.master_id, 'seeded Production Line is required').toBeTruthy();

  await page.goto(`/master-data/production-lines/${line.master_id}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('production-line-detail')).toBeVisible();
  await expect(page.getByRole('button', { name: /Overview|Tổng quan/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Work Centers|Work Center/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Eligibility|Đủ điều kiện/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Readiness|sẵn sàng/i })).toBeVisible();

  await page.getByRole('button', { name: /Readiness|sẵn sàng/i }).click();
  await expect(page.getByText(/Backend readiness|Readiness từ backend/i)).toBeVisible();
  await expect(page.getByText(/Work Center count|Số Work Center/i)).toBeVisible();

  await page.getByRole('button', { name: /Work Centers|Work Center/i }).click();
  await expect(page.getByText(/Mandatory|Bắt buộc/i).first()).toBeVisible();
});

test('[@phase6] Planning constraint resource selectors are constrained controls', async ({ page }) => {
  requireMutationEnvironment();
  await login(page, credentials.manager);

  await page.goto('/master-data/resource-calendars/new', { waitUntil: 'domcontentloaded' });
  const resourceType = page.locator('label').filter({ hasText: /Resource type|Loại tài nguyên/i }).locator('button');
  await expect(resourceType).toBeVisible();
  await resourceType.click();
  await expect(page.getByRole('option', { name: 'Equipment' })).toBeVisible();
  await expect(page.getByRole('option', { name: 'WorkCenter' })).toBeVisible();
  await expect(page.getByRole('option', { name: 'Workstation' })).toBeVisible();
  await page.keyboard.press('Escape');

  const availabilityStatus = page.locator('label').filter({ hasText: /Availability status|Trạng thái khả dụng/i }).locator('button');
  await availabilityStatus.click();
  await expect(page.getByRole('option', { name: 'Available' })).toBeVisible();
  await expect(page.getByRole('option', { name: 'PlannedDown' })).toBeVisible();
  await expect(page.getByRole('option', { name: 'Holiday' })).toBeVisible();
});
