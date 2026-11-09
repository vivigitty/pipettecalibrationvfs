import { expect,test } from '@playwright/test';

test('FR-21 read-only preview inventory and search', async ({ page }) => {
  await page.goto('/assets');
  await expect(page.getByRole('heading',{ name: 'Pipette inventory',exact: true })).toBeVisible();
  await expect(page.getByText('Read-only preview',{ exact: true }).first()).toBeVisible();
  await page.getByRole('searchbox',{ name: 'Search records' }).fill('LK20869');
  await page.getByRole('button',{ name: 'Apply',exact: true }).click();
  await expect(page.getByRole('cell',{ name: 'LK20869',exact: true })).toBeVisible();
  await expect(page.getByRole('cell',{ name: 'LK20870',exact: true })).toHaveCount(0);
  await page.screenshot({ path: `test-results/inventory-${test.info().project.name}.png`,fullPage: true });
});

test('FR-19 preview rejects writes even when called directly', async ({ request }) => {
  const response = await request.post('/api/v1/customers',{ headers: { Origin: 'http://127.0.0.1:3100' },data: {} });
  expect(response.status()).toBe(403);
});

test('FR-07 preview uses the server ISO resolver', async ({ request }) => {
  const response = await request.get('/api/v1/z-factor?temperature=29.4&pressure=1008.8');
  expect(response.status()).toBe(200);
  const json: unknown = await response.json();
  expect(json).toMatchObject({ zCorrectionValue: '1.0052' });
});

test('FR-01 form is labeled and cannot save preview data', async ({ page }) => {
  await page.goto('/customers?new=1');
  await expect(page.getByLabel('Customer name',{ exact: true })).toBeVisible();
  await expect(page.getByRole('button',{ name: 'Save record' })).toBeDisabled();
});