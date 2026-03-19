import { test, expect } from '@playwright/test';

test('theme selection lives in settings panel and persists after reload', async ({ page }) => {
  await page.goto('/');

  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('settings-panel')).toBeVisible();

  await page.getByRole('button', { name: '切换到浅色' }).click();
  let bodyClass = await page.evaluate(() => document.body.className);
  expect(bodyClass).toContain('theme-light');
  expect(bodyClass).not.toContain('theme-dark');

  await page.reload();
  await expect(page.getByTestId('settings-panel')).toBeVisible();
  bodyClass = await page.evaluate(() => document.body.className);
  expect(bodyClass).toContain('theme-light');

  await page.getByRole('button', { name: '切换到深色' }).click();
  bodyClass = await page.evaluate(() => document.body.className);
  expect(bodyClass).toContain('theme-dark');
  expect(bodyClass).not.toContain('theme-light');

  await page.getByRole('button', { name: '切换到跟随系统' }).click();
  bodyClass = await page.evaluate(() => document.body.className);
  expect(bodyClass).not.toContain('theme-dark');
  expect(bodyClass).not.toContain('theme-light');
});
