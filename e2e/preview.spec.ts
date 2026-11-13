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

test('Signup explains the approval sequence and verified users see approval guidance', async ({ page }) => {
  await page.goto('/signup');
  await expect(page.getByRole('listitem').filter({ hasText: 'sign in once to submit your access request' })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'After approval, sign in again' })).toBeVisible();
  await expect(page.getByText('No approval notification emails are currently sent;',{ exact: false })).toBeVisible();
  await page.goto('/login?error=approval');
  await expect(page.getByRole('status')).toContainText('Your email is verified');
  await expect(page.getByRole('status')).toContainText('administrator review in User access');
  await expect(page.getByRole('status')).toContainText('no second confirmation email is needed');
});

test('Password recovery is linked from login and requires a verified reset session', async ({ page,request }) => {
  await page.goto('/login');
  await page.getByRole('link',{ name: 'Forgot password?',exact: true }).click();
  await expect(page.getByRole('heading',{ name: 'Forgot password',exact: true })).toBeVisible();
  await expect(page.getByLabel('Email',{ exact: true })).toBeVisible();
  await page.goto('/reset-password');
  await expect(page).toHaveURL(/forgot-password\?error=invalid$/);
  await expect(page.getByRole('alert')).toContainText('invalid, expired or already used');
  const response = await request.get(`/reset-password/confirm?token_hash=${'a'.repeat(64)}`);
  expect(response.headers()['referrer-policy']).toBe('no-referrer');
  expect(response.headers()['cache-control']).toContain('no-store');
  await page.goto(`/reset-password/confirm?token_hash=${'a'.repeat(64)}`);
  await expect(page.getByRole('button',{ name: 'Continue to reset password' })).toBeVisible();
  expect((await page.context().cookies()).some((cookie) => cookie.name==='vfl-password-recovery')).toBe(false);
  await page.goto('/login?reset=1');
  await expect(page.getByRole('status')).toContainText('Your password has been updated');
});

test('Calibration setup stays in the pipette flow with mandatory, type-filtered instruments', async ({ page }) => {
  await page.goto('/assets/00000000-0000-4000-8000-000000000100');
  const navigation = page.getByRole('navigation',{ name: 'Main navigation' });
  await expect(navigation.getByRole('link',{ name: 'Pipette inventory' })).toBeVisible();
  await expect(navigation.getByRole('link',{ name: /Customers|Ranges & limits|Lab instruments|Lab conditions/ })).toHaveCount(0);

  await page.getByRole('combobox',{ name: 'Lab conditions / sitting' }).selectOption('00000000-0000-4000-8000-000000000040');
  const summary = page.getByRole('region',{ name: 'Selected lab conditions' });
  await expect(summary).toContainText('Testo 108 / LAB-3');
  await expect(summary).toContainText('Sartorius BCE224 / LAB-1');
  await page.getByLabel('Next calibration due (months)').fill('6');

  const add = page.getByRole('button',{ name: 'Add lab conditions',exact: true });
  await expect(add).toHaveClass(/primary/);
  await add.click();
  await expect(page.getByRole('heading',{ name: 'New lab conditions',exact: true })).toBeVisible();
  for (const label of ['Balance','Air thermometer','Water thermometer']) {
    await expect(page.getByRole('combobox',{ name: label,exact: true })).toHaveAttribute('required','');
  }
  await expect(page.getByRole('combobox',{ name: 'Water thermometer',exact: true }).getByRole('option',{ name: /Testo 108/ })).toHaveCount(1);
  await expect(page.getByRole('combobox',{ name: 'Water thermometer',exact: true }).getByRole('option',{ name: /Sartorius|Testo 622/ })).toHaveCount(0);
  await page.getByRole('button',{ name: 'Add water thermometer',exact: true }).click();
  await expect(page.getByRole('combobox',{ name: 'Instrument type',exact: true })).toHaveValue('water_thermometer');
  await expect(page.getByRole('combobox',{ name: 'Instrument type',exact: true }).getByRole('option')).toHaveCount(1);
  await page.getByRole('button',{ name: 'Close form',exact: true }).last().click();
  await page.getByRole('button',{ name: 'Close form',exact: true }).click();
  await expect(page.getByLabel('Next calibration due (months)')).toHaveValue('6');
  await expect(page.getByRole('combobox',{ name: 'Lab conditions / sitting' })).toHaveValue('00000000-0000-4000-8000-000000000040');
});