import { test, expect } from '@playwright/test';

test('loads home page and supports typing in BlockNote on paper surface', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/内容创作工作台/);
  await expect(page.getByTestId('paper-surface')).toBeVisible();
  await expect(page.locator('.blocknote-editor')).toBeVisible();

  await page.getByText('这不是一个单纯的 Markdown 渲染器，而是一个本地优先、面向中文创作者的内容创作工作台。').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Hello Playwright');

  await expect(page.locator('#markdown-output').getByText('Hello Playwright')).toBeVisible();
});
