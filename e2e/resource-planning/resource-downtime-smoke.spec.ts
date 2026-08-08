import { test, expect } from '@playwright/test';
import { credentials, login } from './phase3-helpers';

test('resource calendar is managed as downtime and blocks a down resource window', async ({ page }) => {
  const { base, headers } = await login(page, credentials.manager);
  const equipmentResponse = await page.request.get(`${base}/api/mes/master-data/equipment?limit=100`, { headers });
  expect(equipmentResponse.ok()).toBeTruthy();
  const equipmentRows = (await equipmentResponse.json()).data || [];
  const equipment = equipmentRows.find((row: any) => row.lifecycle_status !== 'Inactive' && row.lifecycle_status !== 'Obsolete');
  expect(equipment, 'An active seeded equipment is required').toBeTruthy();

  const suffix = Date.now().toString(36);
  const downtimeDate = new Date();
  downtimeDate.setUTCDate(downtimeDate.getUTCDate() + 30);
  const downtimeEndDate = new Date(downtimeDate);
  downtimeEndDate.setUTCDate(downtimeEndDate.getUTCDate() + 1);
  const payload = {
    name: { vi: `Downtime E2E ${suffix}`, en: `Downtime E2E ${suffix}`, ja: `Downtime E2E ${suffix}`, ko: `Downtime E2E ${suffix}` },
    resource_type: 'Equipment',
    resource_id: equipment.master_id,
    downtime_start_at: `${downtimeDate.toISOString().slice(0, 10)}T12:00`,
    downtime_end_at: `${downtimeEndDate.toISOString().slice(0, 10)}T17:00`,
    reason_text: `E2E downtime verification ${suffix}`,
  };
  let created: any;
  try {
    const invalidReason = await page.request.post(`${base}/api/mes/master-data/resource-calendars`, {
      headers,
      data: { ...payload, reason_text: '' },
    });
    expect(invalidReason.status()).toBe(422);
    await expect(invalidReason.json()).resolves.toMatchObject({ error: 'DOWNTIME_REASON_REQUIRED' });

    const invalidRange = await page.request.post(`${base}/api/mes/master-data/resource-calendars`, {
      headers,
      data: { ...payload, downtime_end_at: `${downtimeDate.toISOString().slice(0, 10)}T11:00` },
    });
    expect(invalidRange.status()).toBe(422);
    await expect(invalidRange.json()).resolves.toMatchObject({ error: 'DOWNTIME_TIME_RANGE_INVALID' });

    const createResponse = await page.request.post(`${base}/api/mes/master-data/resource-calendars`, { headers, data: payload });
    expect(createResponse.status()).toBe(201);
    const createBody = await createResponse.json();
    created = createBody.data ?? createBody;
    expect(created).toMatchObject({
      resource_type: 'Equipment',
      resource_id: equipment.master_id,
      availability_status: 'PlannedDown',
      shift_id: null,
      available_minutes: 0,
      capacity_factor: '0.0000',
      reason_text: payload.reason_text,
    });
    expect(created.site_id).toBe(equipment.site_id);
    expect(created.code).toMatch(/^DT-/);

    const overlapResponse = await page.request.post(`${base}/api/mes/master-data/resource-calendars`, {
      headers,
      data: { ...payload, downtime_start_at: `${downtimeDate.toISOString().slice(0, 10)}T16:00`, downtime_end_at: `${downtimeDate.toISOString().slice(0, 10)}T18:00` },
    });
    expect(overlapResponse.status()).toBe(409);
    await expect(overlapResponse.json()).resolves.toMatchObject({ error: 'DOWNTIME_OVERLAP' });

    const listResponse = await page.request.get(`${base}/api/mes/master-data/resource-calendars?limit=100`, { headers });
    expect(listResponse.ok()).toBeTruthy();
    const listRows = (await listResponse.json()).data || [];
    const listed = listRows.find((row: any) => row.master_id === created.master_id);
    expect(listed).toMatchObject({ availability_status: 'PlannedDown', shift_id: null, reason_text: payload.reason_text });
    const seededMixing = listRows.find((row: any) => row.code === 'CAL-EQ-MIX-BANBURY01-2026');
    expect(seededMixing, 'Seeded Banbury resource downtime/calendar row is required').toBeTruthy();
    expect(seededMixing.name).toEqual(expect.objectContaining({ vi: expect.any(String) }));

    await page.goto('/master-data/resource-calendars/new', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Resource Downtime|Lịch downtime/i })).toBeVisible();
    await expect(page.getByLabel(/Factory|Nhà máy/i)).toHaveCount(0);
    await expect(page.getByLabel(/Availability status|Trạng thái khả dụng/i)).toHaveCount(0);
    const resourceSearch = page.getByPlaceholder(/Search resource by name or code|Tìm tài nguyên theo tên hoặc mã/i);
    await expect(resourceSearch).toBeVisible();
    await resourceSearch.fill(equipment.code);
    await expect(page.getByRole('option', { name: new RegExp(equipment.code) })).toBeVisible();
    await page.getByRole('option', { name: new RegExp(equipment.code) }).click();
    await expect(page.locator('input[type="datetime-local"]')).toHaveCount(2);
    await expect(page.locator('input[type="datetime-local"]').first()).toHaveAttribute('lang', 'en-GB');
    await expect(page.getByLabel(/Downtime start date and time|Ngày giờ bắt đầu downtime/i)).toBeVisible();
    await expect(page.getByLabel(/Downtime end date and time|Ngày giờ kết thúc downtime/i)).toBeVisible();
    await expect(page.getByLabel(/Reason|Lý do/i)).toBeVisible();
    await expect(page.locator('input[readonly]').first()).toBeVisible();
    await page.goto('/master-data/resource-calendars', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Resource Downtime|Lịch downtime/i })).toBeVisible();
    await expect(page.getByText(payload.reason_text)).toBeVisible();
  } finally {
    if (created?.master_id) {
      const deleteResponse = await page.request.delete(`${base}/api/mes/master-data/resource-calendars/${created.master_id}`, { headers });
      expect(deleteResponse.ok(), `Unable to clean downtime ${created.master_id}`).toBeTruthy();
    }
  }
});
