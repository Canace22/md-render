import { test, expect } from '@playwright/test';

test('theme switcher toggles body class and persists selection', async ({ page }) => {
  await page.goto('/');

  const themeSelect = page.getByTestId('theme-select');
  await expect(themeSelect).toBeVisible();
  await expect(themeSelect).toHaveValue('system');

  // 切换到浅色主题
  await themeSelect.selectOption('light');
  await expect(themeSelect).toHaveValue('light');
  let bodyClass = await page.evaluate(() => document.body.className);
  expect(bodyClass).toContain('theme-light');
  expect(bodyClass).not.toContain('theme-dark');

  // 刷新页面后应保持浅色选择
  await page.reload();
  await expect(themeSelect).toHaveValue('light');
  bodyClass = await page.evaluate(() => document.body.className);
  expect(bodyClass).toContain('theme-light');

  // 切换到深色主题
  await themeSelect.selectOption('dark');
  await expect(themeSelect).toHaveValue('dark');
  bodyClass = await page.evaluate(() => document.body.className);
  expect(bodyClass).toContain('theme-dark');
  expect(bodyClass).not.toContain('theme-light');

  // 切回跟随系统
  await themeSelect.selectOption('system');
  await expect(themeSelect).toHaveValue('system');
});


