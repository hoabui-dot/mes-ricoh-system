import { expect, test } from '@playwright/test';

const terminal = 'KIOSK-DEMO-01';
const expectedManualOperations = [
  'WST-SEED-OP-BINDING',
  'WST-SEED-OP-TEST5IN1',
  'WST-SEED-OP-AIRTEST',
];

test('Phase 07 renders exactly two grouped WOs with complete manual Job Cards', async ({ page }) => {
  const artifactDir = process.env.PHASE07_ARTIFACT_DIR;

  await page.goto(`/kiosk/${terminal}/login`);
  await page.getByRole('button', { name: 'Xác nhận đăng nhập ca' }).click();
  await page.waitForURL('**/wo-list');

  const workOrders = page.locator('main section article');
  await expect(workOrders).toHaveCount(2);

  for (let index = 0; index < 2; index += 1) {
    const card = workOrders.nth(index);
    await card.getByRole('button', { name: 'Mở Job Card' }).click();

    for (const operationCode of expectedManualOperations) {
      await expect(page.getByRole('button', { name: new RegExp(operationCode) })).toHaveCount(1);
    }
    await expect(page.getByRole('region', { name: 'Trạng thái Print Station' })).toHaveCount(0);

    if (artifactDir) {
      await page.screenshot({ path: `${artifactDir}/kiosk-phase07-work-order-${index + 1}.png`, fullPage: true });
    }

    await page.getByRole('button', { name: 'Trở về danh sách' }).click();
    await page.waitForURL('**/wo-list');
  }

  await page.getByRole('button', { name: 'Đăng xuất ca' }).click();
  await expect(page).toHaveURL(new RegExp(`/kiosk/${terminal}/login$`));
});
