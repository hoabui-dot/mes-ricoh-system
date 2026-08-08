import { test, expect } from '@playwright/test';
import { credentials, login } from './phase3-helpers';

test('MES labor and work-calendar read flow is healthy', async ({ page }) => {
  const { base, headers } = await login(page, credentials.manager);

  const [employeesResponse, shiftsResponse, shiftSetsResponse, schedulesResponse] = await Promise.all([
    page.request.get(`${base}/api/mes/master-data/employees?limit=100`, { headers }),
    page.request.get(`${base}/api/mes/master-data/shifts?limit=100`, { headers }),
    page.request.get(`${base}/api/mes/master-data/shift-sets?limit=100`, { headers }),
    page.request.get(`${base}/api/mes/master-data/employee-schedules?limit=100`, { headers }),
  ]);
  expect(employeesResponse.ok()).toBeTruthy();
  expect(shiftsResponse.ok()).toBeTruthy();
  expect(shiftSetsResponse.ok()).toBeTruthy();
  expect(schedulesResponse.ok()).toBeTruthy();

  const employees = (await employeesResponse.json()).data || [];
  const shifts = (await shiftsResponse.json()).data || [];
  const shiftSets = (await shiftSetsResponse.json()).data || [];
  const schedules = (await schedulesResponse.json()).data || [];
  expect(employees.length, 'Seeded employees are required').toBeGreaterThan(0);
  expect(shifts.length, 'Seeded shifts are required').toBeGreaterThan(0);
  expect(shiftSets.length, 'Seeded shift sets are required').toBeGreaterThan(0);
  expect(schedules.length, 'Seeded employee schedules are required').toBeGreaterThan(0);
  expect(employees.some((employee: any) => employee.today_shift_name)).toBeTruthy();
  expect(employees.every((employee: any) => employee.default_work_center_id)).toBeTruthy();
  expect(schedules.every((schedule: any) => schedule.work_center_id)).toBeTruthy();
  const existingSchedule = schedules.find((schedule: any) => schedule.schedule_status === 'Scheduled' && employees.some((employee: any) =>
    employee.master_id === schedule.employee_id && employee.default_work_center_id === schedule.work_center_id));
  expect(existingSchedule, 'A seeded schedule must match the employee default Work Center').toBeTruthy();
  const conflictResponse = await page.request.post(`${base}/api/mes/master-data/employee-schedules/bulk`, {
    headers,
    data: {
      employee_ids: [existingSchedule.employee_id],
      shift_id: existingSchedule.shift_id,
      work_center_id: existingSchedule.work_center_id,
      date_range: { from: String(existingSchedule.schedule_date).slice(0, 10), to: String(existingSchedule.schedule_date).slice(0, 10) },
      days_of_week: [new Date(existingSchedule.schedule_date).getUTCDay() || 7],
    },
  });
  expect(conflictResponse.status()).toBe(409);
  await expect(conflictResponse.json()).resolves.toMatchObject({ error: 'EMPLOYEE_SCHEDULE_TIME_CONFLICT' });
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const pastDate = yesterday.toISOString().slice(0, 10);
  const pastResponse = await page.request.post(`${base}/api/mes/master-data/employee-schedules/bulk`, {
    headers,
    data: {
      employee_ids: [existingSchedule.employee_id],
      shift_id: existingSchedule.shift_id,
      work_center_id: existingSchedule.work_center_id,
      schedule_entries: [{ employee_id: existingSchedule.employee_id, schedule_date: pastDate }],
    },
  });
  expect(pastResponse.status()).toBe(422);
  await expect(pastResponse.json()).resolves.toMatchObject({ error: 'EMPLOYEE_SCHEDULE_PAST_DATE' });

  const employeeLoad = page.waitForResponse((response) =>
    response.url().includes('/api/mes/master-data/employees') && response.request().method() === 'GET');
  await page.goto('/employees', { waitUntil: 'domcontentloaded' });
  expect((await employeeLoad).ok()).toBeTruthy();
  await expect(page.getByRole('heading', { name: /Employees|Nhân công/i })).toBeVisible();
  await expect(page.getByText(employees[0].code)).toBeVisible();

  const shiftLoad = page.waitForResponse((response) =>
    response.url().includes('/api/mes/master-data/shift-sets') && response.request().method() === 'GET');
  await page.goto('/shifts', { waitUntil: 'domcontentloaded' });
  expect((await shiftLoad).ok()).toBeTruthy();
  await expect(page.getByRole('heading', { name: /Shifts|Ca làm việc/i })).toBeVisible();
  await expect(page.getByText(shiftSets[0].shift_set_code).first()).toBeVisible();
  const configurationResponse = await page.request.get(`${base}/api/mes/master-data/shifts/configuration-status`, { headers });
  expect(configurationResponse.ok()).toBeTruthy();
  const configuration = (await configurationResponse.json()).data;
  const visibleWorkCenterRows = page.locator('tbody tr');
  await expect(visibleWorkCenterRows.first()).toBeVisible();
  expect(await visibleWorkCenterRows.count()).toBeLessThanOrEqual(Number(configuration.total_work_centers));
  await page.getByRole('button', { name: /Create Shift|Tạo ca làm việc/i }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const shiftSetDialog = page.getByRole('dialog');
  await shiftSetDialog.getByRole('combobox', { name: /Work\s*Center/i }).click();
  await page.getByRole('option').filter({ hasText: shiftSets[0].work_center_code }).click();
  await expect(page.locator('input[readonly]').first()).toHaveValue(new RegExp(shiftSets[0].shift_set_code));
  await expect(page.getByRole('button', { name: /Add shift|Thêm ca/i })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('tbody button').first().click();
  const shiftModal = page.getByRole('dialog');
  await expect(shiftModal).toBeVisible();
  const shiftModalBox = await shiftModal.boundingBox();
  expect(shiftModalBox).not.toBeNull();
  expect(Math.abs((shiftModalBox?.x || 0) + (shiftModalBox?.width || 0) / 2 - 1280 / 2)).toBeLessThan(3);
  expect(Math.abs((shiftModalBox?.y || 0) + (shiftModalBox?.height || 0) / 2 - 720 / 2)).toBeLessThan(5);
  expect((shiftModalBox?.height || 0) / 720).toBeGreaterThan(0.7);
  await page.keyboard.press('Escape');
  await page.goto('/employees', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Create Employee|Tạo nhân công/i }).click();
  const employeeModal = page.getByRole('dialog');
  await expect(employeeModal).toBeVisible();
  const employeeModalBox = await employeeModal.boundingBox();
  expect(employeeModalBox).not.toBeNull();
  expect(Math.abs((employeeModalBox?.x || 0) + (employeeModalBox?.width || 0) / 2 - 1280 / 2)).toBeLessThan(3);
  expect(Math.abs((employeeModalBox?.y || 0) + (employeeModalBox?.height || 0) / 2 - 720 / 2)).toBeLessThan(5);
  await page.keyboard.press('Escape');
  await page.goto('/shifts', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText(shiftSets[0].shift_set_code).first()).toBeVisible();
  const firstWorkCenterRow = page.locator('tbody tr').first();
  await firstWorkCenterRow.click();
  await expect(page).toHaveURL(/\/shifts$/);

  await page.goto('/work-calendar', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /Work Calendar|Lịch làm việc/i })).toBeVisible();
  const targetEmployee = employees.find((employee: any) => employee.master_id === existingSchedule.employee_id && employee.default_work_center_id === existingSchedule.work_center_id);
  expect(targetEmployee, 'A seeded scheduled employee is required').toBeTruthy();
  const calendarEmployeesLoad = page.waitForResponse((response) =>
    response.url().includes(`/api/mes/master-data/employees?work_center_id=${targetEmployee.default_work_center_id}`) && response.request().method() === 'GET');
  const calendarScheduleLoad = page.waitForResponse((response) => response.url().includes('/api/mes/master-data/employee-schedules') && response.request().method() === 'GET');
  await page.getByLabel(/WorkCenter/i).click();
  await page.getByRole('option', { name: new RegExp(targetEmployee.default_work_center_code) }).click();
  expect((await calendarEmployeesLoad).ok()).toBeTruthy();
  const calendarScheduleResponse = await calendarScheduleLoad;
  expect(calendarScheduleResponse.ok()).toBeTruthy();
  const targetSchedule = schedules.find((schedule: any) =>
    schedule.employee_id === targetEmployee.master_id && schedule.work_center_id === targetEmployee.default_work_center_id);
  expect(targetSchedule, 'Target employee schedule is required').toBeTruthy();
  const targetTime = `${String(targetSchedule.start_time).slice(0, 5)} - ${String(targetSchedule.end_time).slice(0, 5)}`;
  await expect(page.getByText(targetEmployee.name || targetEmployee.code).first()).toBeVisible();
  await expect(page.getByText(targetTime).first()).toBeVisible();
  await page.getByText(targetEmployee.name || targetEmployee.code).first().click();
  const calendarDetail = page.getByRole('dialog');
  await expect(calendarDetail).toBeVisible();
  await expect(calendarDetail.getByText(targetEmployee.name || targetEmployee.code)).toBeVisible();
  await expect(calendarDetail.getByText(targetTime)).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Assign Schedule|Phân ca làm việc/i }).click();
  await expect(page.getByRole('heading', { name: /Assign Schedule|Phân ca làm việc/i })).toBeVisible();
  await expect(page.getByRole('combobox', { name: /Work Center/i })).toBeVisible();
  await expect(page.locator('input[type="date"]').first()).toHaveAttribute('min', new Date().toISOString().slice(0, 10));
  await expect(page.getByRole('button', { name: /Through date|Đến ngày|End date|Ngày kết thúc/i })).toBeVisible();
  await page.getByRole('button', { name: /Back|Quay lại/i }).click();
  await expect(page.getByRole('heading', { name: /Work Calendar|Lịch làm việc/i })).toBeVisible();
});
