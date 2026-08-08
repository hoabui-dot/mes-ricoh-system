import { test, expect } from "@playwright/test";
import { Client } from "pg";
import {
  credentials,
  login,
  requireMutationEnvironment,
} from "./phase3-helpers";

async function cleanupAggregateLine(lineId: string) {
  const client = new Client({
    connectionString: process.env.MES_MASTER_DATA_DATABASE_URL,
  });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "DELETE FROM md_production_line_resource_scope WHERE production_line_id = $1::uuid",
      [lineId],
    );
    await client.query(
      "DELETE FROM md_production_line_work_center WHERE production_line_id = $1::uuid",
      [lineId],
    );
    await client.query(
      "DELETE FROM md_production_line WHERE master_id = $1::uuid",
      [lineId],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

test("[@phase6] Production Line master-data authoring route is available in MES Console", async ({
  page,
}) => {
  requireMutationEnvironment();
  const { base, headers } = await login(page, credentials.manager);

  const listResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/mes/master-data/production-lines") &&
      response.request().method() === "GET",
  );
  await page.goto("/master-data/production-lines", {
    waitUntil: "domcontentloaded",
  });
  await expect
    .poll(async () => (await listResponse).ok(), { timeout: 15_000 })
    .toBeTruthy();
  await expect(
    page.getByRole("heading", {
      name: /Production Lines|Dây chuyền sản xuất/i,
    }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Create|Tạo/i })).toBeVisible();

  await page.getByRole("button", { name: /Create|Tạo/i }).click();
  await expect(page).toHaveURL(/\/master-data\/production-lines\/new$/);
  await expect(
    page.getByRole("heading", {
      name: /Create.*Production Lines|Tạo.*Dây chuyền sản xuất/i,
    }),
  ).toBeVisible();
  await expect(page.getByText(/Site|Factory|Nhà máy/i).first()).toBeVisible();
  await expect(
    page.getByText(/Production Area|Khu vực sản xuất/i).first(),
  ).toBeVisible();
  await expect(page.getByText(/Line type|Loại dây chuyền/i)).toBeVisible();

  const [sitesResponse, areasResponse] = await Promise.all([
    page.request.get(`${base}/api/mes/master-data/sites?limit=1`, { headers }),
    page.request.get(`${base}/api/mes/master-data/production-areas?limit=20`, {
      headers,
    }),
  ]);
  const sites = (await sitesResponse.json()).data || [];
  const areas = (await areasResponse.json()).data || [];
  const area = areas.find((item: any) => item.site_id === sites[0]?.master_id);
  expect(area, "Site with a Production Area is required").toBeTruthy();
  const code = `E2E-LINE-${Date.now()}`;
  const createdResponse = await page.request.post(
    `${base}/api/mes/master-data/production-lines`,
    {
      headers,
      data: {
        code,
        name: { vi: code, en: code },
        site_id: area.site_id,
        area_id: area.master_id,
        lifecycle_status: "Draft",
      },
    },
  );
  expect(createdResponse.ok()).toBeTruthy();
  const created = (await createdResponse.json()).data;
  expect(created.lifecycle_status).toBe("Draft");
  const deleted = await page.request.delete(
    `${base}/api/mes/master-data/production-lines/${created.master_id}`,
    { headers },
  );
  expect(deleted.ok()).toBeTruthy();
});

test("[@phase6] Production Line form enforces hierarchy and controlled line types", async ({
  page,
}) => {
  await login(page, credentials.manager);
  const catalogsLoaded = page.waitForResponse(
    (response) =>
      response
        .url()
        .includes("/api/mes/master-data/business-codes/reservations") &&
      response.request().method() === "POST",
  );
  await page.goto("/master-data/production-lines/new", {
    waitUntil: "domcontentloaded",
  });
  await expect
    .poll(async () => (await catalogsLoaded).ok(), { timeout: 20_000 })
    .toBeTruthy();

  const factory = page.getByTestId("production-line-factory-select");
  const shopfloor = page.getByTestId("production-line-shopfloor-select");
  const area = page.getByTestId("production-line-area-select");
  const lineType = page.getByTestId("production-line-type-select");

  await expect(factory).toBeEnabled();
  await expect(shopfloor).toBeDisabled();
  await expect(area).toBeDisabled();

  await factory.click();
  const factoryOptions = page.getByRole("option");
  await expect(factoryOptions.first()).toBeVisible();
  expect(
    await factoryOptions.count(),
    "At least one active Factory is required",
  ).toBeGreaterThan(0);
  await factoryOptions.first().click();
  await expect(shopfloor).toBeEnabled();
  await expect(area).toBeDisabled();

  await shopfloor.click();
  const shopfloorOptions = page.getByRole("option");
  expect(
    await shopfloorOptions.count(),
    "Selected Factory must have an active Shopfloor",
  ).toBeGreaterThan(0);
  await shopfloorOptions.first().click();
  await expect(area).toBeEnabled();

  await area.click();
  expect(
    await page.getByRole("option").count(),
    "Selected Factory must have an active Production Area",
  ).toBeGreaterThan(0);
  await page.keyboard.press("Escape");

  await lineType.click();
  const lineTypeOptions = page.getByRole("option");
  await expect(lineTypeOptions).toHaveCount(4);
  await expect(lineTypeOptions).toContainText([
    /Production|Sản xuất/i,
    /Assembly|Lắp ráp/i,
    /Packaging|Đóng gói/i,
    /Inspection|Kiểm tra/i,
  ]);
});

test("[@phase6] Production Line aggregate creates Work Center and Workstation scope atomically", async ({
  page,
}) => {
  requireMutationEnvironment();
  const { base, headers } = await login(page, credentials.manager);
  const [workCentersResponse, workstationsResponse, assignmentsResponse] = await Promise.all([
    page.request.get(`${base}/api/mes/master-data/work-centers?limit=200`, { headers }),
    page.request.get(`${base}/api/mes/master-data/workstations?limit=200`, { headers }),
    page.request.get(`${base}/api/mes/master-data/resource-assignments?limit=500`, { headers }),
  ]);
  expect(workCentersResponse.ok()).toBeTruthy();
  expect(workstationsResponse.ok()).toBeTruthy();
  expect(assignmentsResponse.ok()).toBeTruthy();
  const workCenters = (await workCentersResponse.json()).data || [];
  const workstations = (await workstationsResponse.json()).data || [];
  const assignments = (await assignmentsResponse.json()).data || [];
  const workstation = workstations.find((item: any) =>
    item.active_flag !== false &&
    item.lifecycle_status === "Released" &&
    assignments.some((assignment: any) =>
      assignment.workstation_id === item.master_id &&
      assignment.lifecycle_status !== "Inactive" &&
      assignment.lifecycle_status !== "Obsolete",
    ),
  );
  const workCenter = workCenters.find((item: any) =>
    item.master_id === workstation?.work_center_id &&
    item.active_flag !== false &&
    item.lifecycle_status === "Released",
  );
  expect(workCenter, "A released Work Center with an assigned Workstation is required").toBeTruthy();
  expect(workstation, "A released Workstation with an active assignment is required").toBeTruthy();

  const code = `E2E-AGG-LINE-${Date.now()}`;
  let createdId = "";
  try {
    const createdResponse = await page.request.post(
      `${base}/api/mes/master-data/production-lines/aggregate`,
      {
        headers,
        data: {
          code,
          name: { vi: code, en: code },
          description: { vi: "E2E aggregate", en: "E2E aggregate" },
          site_id: workCenter.site_id,
          area_id: workCenter.area_id,
          shopfloor_id: workCenter.shopfloor_id,
          line_type: "Production",
          work_centers: [{ work_center_id: workCenter.master_id, sequence_no: 1, mandatory_flag: true }],
          workstation_ids: [workstation.master_id],
        },
      },
    );
    expect(createdResponse.status()).toBe(201);
    const created = (await createdResponse.json()).data;
    createdId = created.master_id;
    expect(created.lifecycle_status).toBe("Draft");
    expect(created.work_centers).toHaveLength(1);
    expect(created.workstation_ids).toEqual([workstation.master_id]);
    expect(created.resource_scopes.length).toBeGreaterThan(0);

    const duplicateResponse = await page.request.post(
      `${base}/api/mes/master-data/production-lines/aggregate`,
      {
        headers,
        data: {
          code,
          name: { vi: `${code} duplicate`, en: `${code} duplicate` },
          description: { vi: "E2E duplicate", en: "E2E duplicate" },
          site_id: workCenter.site_id,
          area_id: workCenter.area_id,
          shopfloor_id: workCenter.shopfloor_id,
          line_type: "Production",
          work_centers: [{ work_center_id: workCenter.master_id, sequence_no: 1, mandatory_flag: true }],
          workstation_ids: [workstation.master_id],
        },
      },
    );
    expect(duplicateResponse.status()).toBe(409);
    expect((await duplicateResponse.json()).error).toBe("RESOURCE_ASSIGNMENT_LINE_SCOPE_OVERLAP");

    const invalidResponse = await page.request.post(
      `${base}/api/mes/master-data/production-lines/aggregate`,
      {
        headers,
        data: {
          code: `${code}-INVALID`,
          name: { vi: `${code}-INVALID`, en: `${code}-INVALID` },
          site_id: workCenter.site_id,
          area_id: workCenter.area_id,
          shopfloor_id: workCenter.shopfloor_id,
          line_type: "Production",
          work_centers: [{ work_center_id: workCenter.master_id, sequence_no: 1, mandatory_flag: true }],
          workstation_ids: ["00000000-0000-0000-0000-000000000000"],
        },
      },
    );
    expect(invalidResponse.status()).toBe(404);
    const invalidList = await page.request.get(
      `${base}/api/mes/master-data/production-lines?search=${encodeURIComponent(`${code}-INVALID`)}`,
      { headers },
    );
    expect(invalidList.ok()).toBeTruthy();
    expect((await invalidList.json()).data || []).toHaveLength(0);
  } finally {
    if (createdId) {
      await page.request.put(`${base}/api/mes/master-data/production-lines/${createdId}/resource-scopes`, {
        headers,
        data: { workstation_ids: [] },
      });
      await page.request.put(`${base}/api/mes/master-data/production-lines/${createdId}/work-centers`, {
        headers,
        data: { work_centers: [] },
      });
      await cleanupAggregateLine(createdId);
    }
  }
});

test("[@phase6] MES navigation uses a single-open business accordion", async ({
  page,
}) => {
  await login(page, credentials.manager);
  await page.goto("/master-data/production-lines/new", {
    waitUntil: "domcontentloaded",
  });

  await expect(
    page.getByText(/Master Data - Tier 1|Master Data - Tier 2/i),
  ).toHaveCount(0);
  const sectionButtons = page.locator('button[aria-controls^="mes-nav-"]');
  await expect(sectionButtons).toHaveCount(4);
  await expect(
    page.locator('button[aria-controls^="mes-nav-"][aria-expanded="true"]'),
  ).toHaveCount(1);

  await page.locator('button[aria-controls="mes-nav-product"]').click();
  await expect(
    page.locator('button[aria-controls="mes-nav-product"]'),
  ).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.locator('button[aria-controls="mes-nav-resources"]'),
  ).toHaveAttribute("aria-expanded", "false");
  await expect(
    page.locator('button[aria-controls^="mes-nav-"][aria-expanded="true"]'),
  ).toHaveCount(1);

  await page.locator('button[aria-controls="mes-nav-labor"]').click();
  await expect(
    page.locator('button[aria-controls="mes-nav-labor"]'),
  ).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.locator('button[aria-controls="mes-nav-product"]'),
  ).toHaveAttribute("aria-expanded", "false");
  await expect(
    page.locator('button[aria-controls^="mes-nav-"][aria-expanded="true"]'),
  ).toHaveCount(1);
  await page.screenshot({
    path: "artifacts/playwright/production-line-navigation-desktop.png",
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: /Menu|Trình đơn/i }).click();
  await expect(
    page.locator(
      'nav[aria-label="Điều hướng MES"], nav[aria-label="MES navigation"]',
    ).last(),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/playwright/production-line-navigation-mobile.png",
    fullPage: true,
  });
});

test("[@phase6] Production Line detail exposes resource hierarchy tabs and backend readiness", async ({
  page,
}) => {
  requireMutationEnvironment();
  const { base, headers } = await login(page, credentials.manager);
  const response = await page.request.get(
    `${base}/api/mes/master-data/production-lines?limit=100`,
    { headers },
  );
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  let line: any;
  for (const candidate of body.data || []) {
    if (candidate.lifecycle_status !== "Released") continue;
    const scopes = await page.request.get(
      `${base}/api/mes/master-data/production-lines/${candidate.master_id}/resource-scopes`,
      { headers },
    );
    if (
      scopes.ok() &&
      ((await scopes.json()).data || []).some(
        (item: any) => item.active_flag !== false && !item.effective_to,
      )
    ) {
      line = candidate;
      break;
    }
  }
  expect(
    line?.master_id,
    "seeded Production Line with resource scope is required",
  ).toBeTruthy();

  await page.goto(`/master-data/production-lines/${line.master_id}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByTestId("production-line-detail")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Overview|Tổng quan/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Work Centers|Work Center/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: /Workstations?|Execution Resource Scope|Phạm vi nguồn lực thực thi/i,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Eligibility|Đủ điều kiện/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Readiness|sẵn sàng/i }),
  ).toBeVisible();

  await page.getByRole("button", { name: /Readiness|sẵn sàng/i }).click();
  await expect(
    page.getByText(/Backend readiness|Readiness từ backend/i),
  ).toBeVisible();
  await expect(
    page.getByText(/Work Center count|Số Work Center/i),
  ).toBeVisible();

  await page
    .getByRole("button", {
      name: /Workstations?|Execution Resource Scope|Phạm vi nguồn lực thực thi/i,
    })
    .click();
  await expect(page.getByTestId("line-resource-scope-editor")).toBeVisible();
  const scopeRows = page.getByTestId("line-resource-scope-row");
  if (await scopeRows.count()) {
    const countBeforeRemove = await scopeRows.count();
    await page.getByTestId("line-resource-scope-remove").first().click();
    await expect(scopeRows).toHaveCount(countBeforeRemove - 1);
    const rejectedSave = page.waitForResponse(
      (item) =>
        item
          .url()
          .includes(`/production-lines/${line.master_id}/resource-scopes`) &&
        item.request().method() === "PUT",
    );
    await page
      .getByTestId("line-resource-scope-editor")
      .getByRole("button", { name: /Save|Lưu/i })
      .click();
    const rejectedResponse = await rejectedSave;
    expect(
      rejectedResponse.request().postDataJSON().resource_scopes,
    ).toHaveLength(countBeforeRemove - 1);
    expect(rejectedResponse.status()).toBe(409);
    await expect(rejectedResponse.json()).resolves.toMatchObject({
      error: "PRODUCTION_LINE_RELEASED_RESOURCE_SCOPE_REMOVE_FORBIDDEN",
    });
    await expect(page.getByRole("alert")).toContainText(/Released|lifecycle|RESOURCE_SCOPE/i);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("production-line-detail")).toBeVisible();
    await page
      .getByRole("button", {
        name: /Workstations?|Execution Resource Scope|Phạm vi nguồn lực thực thi/i,
      })
      .click();
    await expect(page.getByTestId("line-resource-scope-row")).toHaveCount(
      countBeforeRemove,
    );
    await page.screenshot({
      path: "artifacts/playwright/phase4-production-line-resource-scope.png",
      fullPage: true,
    });
    const scopeSave = page.waitForResponse(
      (item) =>
        item
          .url()
          .includes(`/production-lines/${line.master_id}/resource-scopes`) &&
        item.request().method() === "PUT",
    );
    const scopeReload = page.waitForResponse(
      (item) =>
        item
          .url()
          .includes(`/production-lines/${line.master_id}/resource-scopes`) &&
        item.request().method() === "GET",
    );
    await page
      .getByTestId("line-resource-scope-editor")
      .getByRole("button", { name: /Save|Lưu/i })
      .click();
    expect((await scopeSave).ok()).toBeTruthy();
    expect((await scopeReload).ok()).toBeTruthy();
  } else throw new Error("Seeded Production Line resource scope is required");

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("production-line-detail")).toBeVisible();
  await page.getByRole("button", { name: /Work Centers|Work Center/i }).click();
  await expect(page.getByText(/Mandatory|Bắt buộc/i).first()).toBeVisible();
  const workCenterSave = page.waitForResponse(
    (item) =>
      item.url().includes(`/production-lines/${line.master_id}/work-centers`) &&
      item.request().method() === "PUT",
  );
  await page
    .getByTestId("line-work-center-editor")
    .getByRole("button", { name: /Save|Lưu/i })
    .click();
  expect((await workCenterSave).ok()).toBeTruthy();
});

test("[@phase6] Planning constraint resource selectors are constrained controls", async ({
  page,
}) => {
  requireMutationEnvironment();
  await login(page, credentials.manager);

  await page.goto("/master-data/resource-calendars/new", {
    waitUntil: "domcontentloaded",
  });
  const resourceType = page
    .locator("label")
    .filter({ hasText: /Resource type|Loại tài nguyên/i })
    .locator("button");
  await expect(resourceType).toBeVisible();
  await resourceType.click();
  await expect(page.getByRole("option", { name: "Equipment" })).toBeVisible();
  await expect(page.getByRole("option", { name: /Work ?Center|Trung tâm làm việc/i })).toBeVisible();
  await expect(page.getByRole("option", { name: /Workstation|Trạm làm việc/i })).toBeVisible();
  await page.keyboard.press("Escape");

  await expect(page.getByLabel(/Factory|Nhà máy/i)).toHaveCount(0);
  await expect(page.getByText(/Generated automatically|Tự động sinh mã/i)).toHaveCount(0);
  await expect(page.getByLabel(/Downtime start date and time|Ngày giờ bắt đầu downtime/i)).toBeVisible();
  await expect(page.getByLabel(/Downtime end date and time|Ngày giờ kết thúc downtime/i)).toBeVisible();
  await expect(page.getByLabel(/Reason|Lý do/i)).toBeVisible();
  await expect(page.getByLabel(/Availability status|Trạng thái khả dụng/i)).toHaveCount(0);
});
