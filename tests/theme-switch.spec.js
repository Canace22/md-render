import { test, expect } from '@playwright/test';

test('theme switcher toggles body class and persists selection', async ({ page }) => {
  await page.goto('/');

  const themeBtn = page.getByTestId('theme-select');
  await expect(themeBtn).toBeVisible();
  await expect(themeBtn).toHaveAttribute('data-theme', 'system');

  // 切换到浅色主题（点击 1 次：system → light）
  await themeBtn.click();
  await expect(themeBtn).toHaveAttribute('data-theme', 'light');
  let bodyClass = await page.evaluate(() => document.body.className);
  expect(bodyClass).toContain('theme-light');
  expect(bodyClass).not.toContain('theme-dark');

  // 刷新页面后应保持浅色选择
  await page.reload();
  await expect(themeBtn).toHaveAttribute('data-theme', 'light');
  bodyClass = await page.evaluate(() => document.body.className);
  expect(bodyClass).toContain('theme-light');

  // 切换到深色主题（点击 1 次：light → dark）
  await themeBtn.click();
  await expect(themeBtn).toHaveAttribute('data-theme', 'dark');
  bodyClass = await page.evaluate(() => document.body.className);
  expect(bodyClass).toContain('theme-dark');
  expect(bodyClass).not.toContain('theme-light');

  // 用户只能选浅色/深色，再点击切回浅色（dark → light）
  await themeBtn.click();
  await expect(themeBtn).toHaveAttribute('data-theme', 'light');
});


