import { expect, test } from '@playwright/test';
import { apiJson, credentials, login } from './phase3-helpers';

const masterData = '/api/mes/master-data';

async function selectItemAndRevision(page: any, prefix: string, itemLabel: RegExp, itemCode?: string) {
  const item = page.getByLabel(itemLabel);
  await item.click();
  const itemOption = itemCode ? page.getByRole('option').filter({ hasText: itemCode }).first() : page.getByRole('option').first();
  await expect(itemOption).toBeVisible();
  await expect(itemOption.locator('.italic').first()).toBeVisible();
  await itemOption.click();
  await expect(page.getByTestId(`${prefix}-item-value`)).not.toHaveValue('');

  const readOnlyRevision = page.getByTestId(`${prefix}-revision-readonly`);
  if (!await readOnlyRevision.isVisible().catch(() => false)) {
    await page.getByTestId(`${prefix}-revision-select`).click();
    await page.getByRole('option').first().click();
  }
  await expect(page.getByTestId(`${prefix}-revision-value`)).not.toHaveValue('');
}

test.describe('MBOM atomic creation', () => {
  test('requires an explicit revision when the selected Item has multiple revisions', async ({ page }) => {
    await login(page, credentials.manager);
    await page.route('**/api/mes/master-data/item-revisions*', async (route) => {
      const response = await route.fetch();
      const payload = await response.json();
      const rows = Array.isArray(payload?.data) ? payload.data : [];
      const source = rows.find((row: any) => row.item_id);
      if (source) rows.push({ ...source, master_id: '00000000-0000-4000-8000-000000009999', revision_code: `${source.revision_code || 'R1'}-E2E-ALT` });
      await route.fulfill({ response, json: payload });
    });
    await page.goto('/master-data/mboms/new', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('mbom-create-screen')).toBeVisible();
    await page.getByLabel(/Output Item|Item đầu ra|出力Item|출력 Item/i).click();
    await page.getByRole('option').first().click();
    await expect(page.getByTestId('mbom-output-revision-readonly')).toBeHidden();
    await expect(page.getByTestId('mbom-output-revision-select')).toBeVisible();
    await expect(page.getByTestId('mbom-output-revision-value')).toHaveValue('');
    await page.getByTestId('mbom-output-revision-select').click();
    await expect(page.getByRole('option')).toHaveCount(2);
    await page.getByRole('option').last().click();
    await expect(page.getByTestId('mbom-output-revision-value')).not.toHaveValue('');
  });

  test('filters component and substitute Items by the MBOM output Item Type', async ({ page }) => {
    await login(page, credentials.manager);
    await page.goto('/master-data/mboms/new', { waitUntil: 'domcontentloaded' });
    await selectItemAndRevision(page, 'mbom-output', /Output Item|Item đầu ra|出力Item|출력 Item/i, 'FG-WS-CM01');
    await page.getByTestId('mbom-create-add-component').click();
    await page.getByLabel(/Component Item|Item thành phần|構成Item|구성 Item/i).click();
    const rawMaterialOption = page.getByRole('option').filter({ hasText: 'RM-STL-05' });
    const semiFinishedOption = page.getByRole('option').filter({ hasText: 'SFG-MET-CM01' });
    await expect(rawMaterialOption).toBeVisible();
    await expect(rawMaterialOption).toContainText(/\((Nguyên vật liệu|Raw material|原材料|원자재)\)/);
    await expect(semiFinishedOption).toBeVisible();
    await expect(semiFinishedOption).toContainText(/\((Bán thành phẩm|Semi-finished good|半製品|반제품)\)/);
    await expect(page.getByRole('option').filter({ hasText: 'WST-SEED-FG-SEAL-ASM-01' })).toHaveCount(0);
    await page.getByRole('option').filter({ hasText: 'WST-SEED-COMP-SEAL-RING-01' }).click();

    await page.getByTestId('mbom-line-editor').getByRole('button', { name: /Add substitute|Thêm vật tư thay thế|代替|대체/i }).click();
    await page.getByLabel(/Substitute Item|Item vật tư thay thế|代替Item|대체 Item/i).click();
    await expect(page.getByRole('option').filter({ hasText: 'SFG-RUB-CM01' })).toBeVisible();
    await expect(page.getByRole('option').filter({ hasText: 'FG-WS-CM01' })).toHaveCount(0);
    await page.getByRole('option').filter({ hasText: 'RM-STL-05' }).click();
    const validation = page.getByTestId('mbom-substitute-validation');
    await expect(validation).toBeVisible();
    await expect(validation.locator('[data-valid="false"]')).not.toHaveCount(0);
    await expect(validation).toContainText(/WON.*RM_METAL_BASE|RM_METAL_BASE.*WON/);
    await page.getByRole('dialog').getByRole('button', { name: /Lưu vật tư thay thế|Save substitute|代替品を保存|대체품 저장/i }).click();
    await expect(page.getByText(/Vật tư thay thế không tương thích|substitute is not compatible|代替品は構成品と互換性|대체품이 구성품과 호환/)).toBeVisible();
    await page.getByRole('button', { name: /Xem chi tiết|More details|詳細を表示|상세 보기/i }).click();
    await expect(page.getByText(/Khác nhóm kỹ thuật|Technical group mismatch|技術グループ不一致|기술 그룹 불일치/)).toBeVisible();
  });

  test('allows only raw materials when the MBOM output is semi-finished', async ({ page }) => {
    await login(page, credentials.manager);
    await page.goto('/master-data/mboms/new', { waitUntil: 'domcontentloaded' });
    await selectItemAndRevision(page, 'mbom-output', /Output Item|Item đầu ra|出力Item|출력 Item/i, 'SFG-MET-CM01');
    await page.getByTestId('mbom-create-add-component').click();
    await page.getByLabel(/Component Item|Item thành phần|構成Item|구성 Item/i).click();
    await expect(page.getByRole('option').filter({ hasText: 'RM-STL-05' })).toBeVisible();
    await expect(page.getByRole('option').filter({ hasText: 'SFG-RUB-CM01' })).toHaveCount(0);
    await expect(page.getByRole('option').filter({ hasText: 'FG-WS-CM01' })).toHaveCount(0);
  });

  test('applies the same Item Type filter while editing an MBOM line', async ({ page, request }) => {
    const { base, headers } = await login(page, credentials.manager);
    const mbomResult = await apiJson(request, base, `${masterData}/mbom-headers?limit=500`, { headers });
    const mbom = mbomResult.body.find((row: any) => row.output_item_type === 'FG' && Number(row.line_count) > 0);
    expect(mbom).toBeTruthy();

    await page.goto(`/master-data/mboms/${mbom.master_id}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main table tbody tr').first()).toBeVisible();
    await page.locator('main table tbody tr').first().getByRole('button', { name: /Actions|Thao tác|操作|작업/i }).click();
    await page.getByRole('button', { name: /Edit|Sửa|編集|편집/i }).last().click();
    await page.getByLabel(/Component Item|Item thành phần|構成Item|구성 Item/i).click();
    await expect(page.getByRole('option').filter({ hasText: 'RM-STL-05' })).toBeVisible();
    await expect(page.getByRole('option').filter({ hasText: 'SFG-MET-CM01' })).toBeVisible();
    await expect(page.getByRole('option').filter({ hasText: 'FG-WS-CM01' })).toHaveCount(0);
  });

  test('creates header and component on one route with one aggregate request', async ({ page, request }) => {
    expect(process.env.ALLOW_E2E_MUTATION, 'ALLOW_E2E_MUTATION must be true for mutating MBOM tests').toBe('true');
    const { base, headers } = await login(page, credentials.manager);
    let createdId = '';
    const createRequests: string[] = [];
    let aggregatePayload: Record<string, unknown> | undefined;
    page.on('request', (req) => {
      if (req.method() === 'POST' && /\/api\/mes\/master-data\/(mbom-headers|mbom-lines)/.test(req.url())) createRequests.push(req.url());
      if (req.method() === 'POST' && req.url().endsWith('/api/mes/master-data/mbom-headers/aggregate')) aggregatePayload = req.postDataJSON();
    });

    try {
      await page.goto('/master-data/mboms/new', { waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('mbom-create-screen')).toBeVisible();

      await selectItemAndRevision(page, 'mbom-output', /Output Item|Item đầu ra|出力Item|출력 Item/i, 'FG-WS-CM01');
      await page.locator('fieldset').first().locator('input').fill(`MBOM atomic E2E ${Date.now()}`);

      await page.getByTestId('mbom-create-add-component').click();
      await expect(page.getByTestId('mbom-line-editor')).toBeVisible();
      await selectItemAndRevision(page, 'mbom-component', /Component Item|Item thành phần|構成Item|구성 Item/i, 'WST-SEED-COMP-SEAL-RING-01');
      await page.getByRole('dialog').getByRole('button', { name: /Lưu thành phần|Save component|構成品を保存|구성품 저장/i }).click();
      await expect(page.getByTestId('mbom-line-editor')).toBeHidden();

      const invalidControls = await page.getByTestId('mbom-create-screen').locator('form').first().locator(':invalid').evaluateAll((controls) => controls.map((control) => ({
        tag: control.tagName,
        type: (control as HTMLInputElement).type,
        name: (control as HTMLInputElement).name,
        value: (control as HTMLInputElement).value,
        ariaLabel: control.getAttribute('aria-label'),
      })));
      expect(invalidControls, JSON.stringify(invalidControls)).toEqual([]);
      const aggregateResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/mes/master-data/mbom-headers/aggregate'));
      await page.getByTestId('mbom-create-submit').click();
      const response = await aggregateResponse;
      expect(response.status(), await response.text()).toBe(201);
      const body = await response.json();
      createdId = body.data.master_id;
      expect(body.data).not.toHaveProperty('site_id');
      expect(Number(body.data.version_no)).toBe(1);
      expect(body.data.business_version).toBe('1');

      await expect(page).toHaveURL(new RegExp(`/master-data/mboms/${createdId}$`));
      await expect(page.locator('main table tbody tr')).toHaveCount(1, { timeout: 20_000 });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.locator('main table tbody tr')).toHaveCount(1, { timeout: 20_000 });
      await page.locator('main table tbody tr').first().getByRole('button', { name: /Actions|Thao tác|操作|작업/i }).click();
      await page.getByRole('button', { name: /Edit|Sửa|編集|편집/i }).last().click();
      await page.getByRole('dialog').getByRole('button', { name: /Add substitute|Thêm vật tư thay thế|代替|대체/i }).click();
      await page.getByLabel(/Substitute Item|Item vật tư thay thế|代替Item|대체 Item/i).click();
      await expect(page.getByRole('option').filter({ hasText: 'SFG-RUB-CM01' })).toBeVisible();
      await expect(page.getByRole('option').filter({ hasText: 'FG-WS-CM01' })).toHaveCount(0);
      expect(createRequests.filter((url) => url.endsWith('/mbom-headers/aggregate'))).toHaveLength(1);
      expect(aggregatePayload).not.toHaveProperty('site_id');
      expect(createRequests.filter((url) => /\/mbom-lines$/.test(url))).toHaveLength(0);
      expect(createRequests.filter((url) => /\/mbom-headers$/.test(url))).toHaveLength(0);
      const removedVersionEndpoint = await apiJson(request, base, `${masterData}/mbom-headers/${createdId}/create-new-version`, { method: 'POST', headers, data: {} }, false);
      expect(removedVersionEndpoint.response.status()).toBe(404);
    } finally {
      if (createdId) await apiJson(request, base, `${masterData}/mbom-headers/${createdId}`, { method: 'DELETE', headers }, false);
    }
  });

  test('rejects an invalid component type through the aggregate API', async ({ page, request }) => {
    const { base, headers } = await login(page, credentials.manager);
    const revisionResult = await apiJson(request, base, `${masterData}/item-revisions?limit=500&lifecycle_status=Released&usage=component`, { headers });
    const fgRevisions = revisionResult.body.filter((row: any) => row.item_type === 'FG');
    const [outputFg, componentFg] = fgRevisions;
    const marker = `MBOM invalid type E2E ${Date.now()}`;
    expect(outputFg).toBeTruthy();
    expect(componentFg).toBeTruthy();

    const failed = await apiJson(request, base, `${masterData}/mbom-headers/aggregate`, {
      method: 'POST', headers,
      data: {
        name: { vi: marker, en: marker, ja: marker, ko: marker }, description: { vi: '', en: '', ja: '', ko: '' },
        item_revision_id: outputFg.master_id, base_uom_id: outputFg.base_uom_id,
        base_quantity: '1', purpose: 'Standard', effective_from: new Date().toISOString().slice(0, 10),
        lines: [{ client_id: 'invalid-fg-component', seq: 10, component_revision_id: componentFg.master_id, quantity_per: '1', scrap_rate: '0', substitutes: [] }],
      },
    }, false);
    expect(failed.response.status()).toBe(422);
    expect(failed.body.error).toBe('MBOM_COMPONENT_ITEM_TYPE_INVALID');
  });

  test('returns exact group and UOM reasons for an incompatible substitute and rolls back', async ({ page, request }) => {
    const { base, headers } = await login(page, credentials.manager);
    const revisionResult = await apiJson(request, base, `${masterData}/item-revisions?limit=500&lifecycle_status=Released&usage=component`, { headers });
    const byItemCode = new Map(revisionResult.body.map((row: any) => [row.item_code, row]));
    const output = byItemCode.get('FG-WS-CM01') as any;
    const component = byItemCode.get('RM-STL-05') as any;
    const substitute = byItemCode.get('RM-CHEM-BOND') as any;
    const marker = `MBOM incompatible substitute E2E ${Date.now()}`;
    expect(output).toBeTruthy();
    expect(component).toBeTruthy();
    expect(substitute).toBeTruthy();

    const failed = await apiJson(request, base, `${masterData}/mbom-headers/aggregate`, {
      method: 'POST', headers,
      data: {
        name: { vi: marker, en: marker, ja: marker, ko: marker }, description: { vi: '', en: '', ja: '', ko: '' },
        item_revision_id: output.master_id, base_uom_id: output.base_uom_id,
        base_quantity: '1', purpose: 'Standard', effective_from: new Date().toISOString().slice(0, 10),
        lines: [{
          client_id: 'component-with-invalid-substitute', seq: 10, component_revision_id: component.master_id,
          quantity_per: '1', scrap_rate: '0', substitutes: [{
            client_id: 'invalid-substitute', substitute_revision_id: substitute.master_id, priority: 1,
            conversion_factor: '1', max_usage_percent: '100', effective_from: new Date().toISOString().slice(0, 10),
          }],
        }],
      },
    }, false);
    expect(failed.response.status()).toBe(422);
    expect(failed.body.error).toBe('MBOM_SUBSTITUTE_COMPATIBILITY_INVALID');
    expect(failed.body.details).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'MBOM_SUBSTITUTE_ITEM_GROUP_MISMATCH', component_item_code: 'RM-STL-05', substitute_item_code: 'RM-CHEM-BOND',
        expected_group: 'RM_METAL_BASE', actual_group: 'RM_CHEMICALS',
      }),
      expect.objectContaining({
        code: 'MBOM_SUBSTITUTE_UOM_CONVERSION_MISSING', component_item_code: 'RM-STL-05', substitute_item_code: 'RM-CHEM-BOND',
        component_uom_code: 'PCS', substitute_uom_code: 'KG',
      }),
    ]));

    const headersAfter = await apiJson(request, base, `${masterData}/mbom-headers?limit=500`, { headers });
    expect(headersAfter.body.some((row: any) => row.name?.vi === marker || row.name === marker)).toBe(false);
  });

  test('keeps MBOM site-free and derives Production Version Site from Routing', async ({ page, request }) => {
    const { base, headers } = await login(page, credentials.manager);
    const [mboms, routings, productionVersions] = await Promise.all([
      apiJson(request, base, `${masterData}/mbom-headers?limit=500`, { headers }),
      apiJson(request, base, `${masterData}/routing-headers?limit=500`, { headers }),
      apiJson(request, base, `${masterData}/production-versions?limit=500`, { headers }),
    ]);
    expect(mboms.body.length).toBeGreaterThan(0);
    for (const mbom of mboms.body) {
      expect(mbom).not.toHaveProperty('site_id');
      expect(mbom).not.toHaveProperty('site_code');
    }
    const routingById = new Map(routings.body.map((routing: any) => [String(routing.master_id), routing]));
    for (const productionVersion of productionVersions.body) {
      const routing: any = routingById.get(String(productionVersion.routing_header_id));
      expect(routing, `Routing ${productionVersion.routing_header_id} must be available`).toBeTruthy();
      expect(Number(routing.factory_count)).toBe(1);
      expect(productionVersion.site_id).toBe(routing.site_id);
    }
  });

  test('rolls back the header and first line when a later line fails', async ({ page, request }) => {
    expect(process.env.ALLOW_E2E_MUTATION, 'ALLOW_E2E_MUTATION must be true for mutating MBOM tests').toBe('true');
    const { base, headers } = await login(page, credentials.manager);
    const outputResult = await apiJson(request, base, `${masterData}/item-revisions?limit=500&lifecycle_status=Released`, { headers });
    const componentResult = await apiJson(request, base, `${masterData}/item-revisions?limit=500&lifecycle_status=Released&usage=component`, { headers });
    const output = outputResult.body[0];
    const allowedTypes = output?.item_type === 'FG' ? ['SFG', 'RM'] : ['RM'];
    const component = componentResult.body.find((row: any) => row.master_id !== output.master_id && allowedTypes.includes(row.item_type));
    expect(output).toBeTruthy(); expect(component).toBeTruthy();
    const marker = `MBOM rollback E2E ${Date.now()}`;

    const failed = await apiJson(request, base, `${masterData}/mbom-headers/aggregate`, {
      method: 'POST', headers,
      data: {
        name: { vi: marker, en: marker, ja: marker, ko: marker }, description: { vi: '', en: '', ja: '', ko: '' },
        item_revision_id: output.master_id, base_uom_id: output.base_uom_id,
        base_quantity: '100', purpose: 'Standard', business_version: '1', effective_from: new Date().toISOString().slice(0, 10),
        lines: [
          { client_id: 'valid-first-line', seq: 10, component_revision_id: component.master_id, quantity_per: '1', scrap_rate: '0', backflush_flag: true, substitutes: [] },
          { client_id: 'invalid-second-line', seq: 20, component_revision_id: component.master_id, quantity_per: '0', scrap_rate: '0', substitutes: [] },
        ],
      },
    }, false);
    expect(failed.response.status()).toBe(422);
    expect(failed.body.error).toBe('MBOM_LINE_QUANTITY_INVALID');

    const headersAfter = await apiJson(request, base, `${masterData}/mbom-headers?limit=500`, { headers });
    expect(headersAfter.body.some((row: any) => row.name?.vi === marker || row.name === marker)).toBe(false);
  });
});
