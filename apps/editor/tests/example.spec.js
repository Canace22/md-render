import { test, expect } from '@playwright/test';

test('loads home page and supports typing in BlockNote on paper surface', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/Markdown/i);
  await expect(page.getByTestId('paper-surface')).toBeVisible();
  await expect(page.locator('.blocknote-editor')).toBeVisible();

  await page.getByText('这是一个支持 CommonMark 规范的 Markdown 渲染器示例。').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Hello Playwright');

  await expect(page.locator('#markdown-output').getByText('Hello Playwright')).toBeVisible();
});
