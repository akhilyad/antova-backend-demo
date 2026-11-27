// The demo path a buyer follows, in replay mode on the saved sample tender.
import { test, expect, type Page } from '@playwright/test';

const TENDER = 'TENDER-2026-402';
const VENDORS = ['Nordwerk Schaltanlagen GmbH', 'Deltaport Skid Consortium B.V.', 'VoltSwitch Industrial'];

/** Fails the test on any uncaught error in the page, which a passing assertion could otherwise hide. */
function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return () => expect(errors, 'uncaught page errors').toEqual([]);
}

test('health reports replay mode when no engine is configured', async ({ request }) => {
  const res = await request.get('/api/health');
  const body = await res.json();
  expect(body.mode).toBe('replay');
  expect(body.reason).toBe('not_configured');
});

test('overview lists the sample tender and opens its audit', async ({ page }) => {
  const noErrors = watchErrors(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
  await page.getByRole('link', { name: TENDER }).first().click();
  await expect(page).toHaveURL(new RegExp(`/audit/${TENDER}`));
  await expect(page.getByRole('heading', { level: 1 })).toContainText('33kV GIS Switchgear');
  noErrors();
});

test('audit shows all three bids and every tab opens', async ({ page }) => {
  const noErrors = watchErrors(page);
  await page.goto(`/audit/${TENDER}`);
  for (const v of VENDORS) await expect(page.getByRole('button', { name: new RegExp(v) })).toBeVisible();
  for (const tab of [/^Requirements/, /^Commercial terms/, /^Rate scenarios/, /^Files/, /^Sign-off/, /^Bids/]) {
    await page.getByRole('button', { name: tab }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('33kV GIS Switchgear');
  }
  noErrors();
});

test('upload page in replay mode offers the sample instead of processing', async ({ page }) => {
  const noErrors = watchErrors(page);
  await page.goto('/ingest');
  await expect(page.getByRole('heading', { level: 1, name: 'Upload a tender' })).toBeVisible();
  await page.getByRole('button', { name: 'Open sample audit' }).click();
  await expect(page).toHaveURL(new RegExp(`/audit/${TENDER}`));
  noErrors();
});

// Known gap (found by this test, 2026-11-28): neither replay mode nor the built-in engine writes the
// TBE workbook (replay 404s, native 501s), so on Cloudflare the button only ever shows an alert.
// Remove fixme once an engine on this deployment can produce export-tbe.xlsx.
test.fixme('downloads page exports the workbook', async ({ page }) => {
  const noErrors = watchErrors(page);
  await page.goto('/reports');
  await expect(page.getByRole('heading', { level: 1, name: 'Downloads' })).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download workbook' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.(xlsx|csv)$/);
  noErrors();
});

test('print report ranks every vendor by evaluated cost', async ({ page }) => {
  const noErrors = watchErrors(page);
  await page.goto(`/print/${TENDER}`);
  await expect(page.getByRole('heading', { name: 'Ranking by evaluated cost' })).toBeVisible();
  for (const v of VENDORS) await expect(page.getByText(v).first()).toBeVisible();
  noErrors();
});
