import { test, expect } from '@playwright/test';

async function openWithFreshWorkspace(page) {
  await page.goto('/');
  await page.evaluate(() => {
    window.localStorage.clear();
  });
  await page.goto('/');
}

test('renders default example markdown on first load in immersive paper mode', async ({ page }) => {
  await openWithFreshWorkspace(page);

  const preview = page.locator('#markdown-output');
  await expect(page.getByTestId('paper-surface')).toBeVisible();
  await expect(page.locator('.blocknote-editor')).toBeVisible();
  await expect(page.locator('.right-area-header')).toHaveCount(1);
  await expect(page.locator('.panel-tabs')).toHaveCount(0);
  await expect(page.locator('.right-area-doc-title')).toContainText('示例文档.md');

  await expect(preview.getByRole('heading', { name: '欢迎使用 Markdown 渲染器' })).toBeVisible();
  await expect(preview.getByText('功能特性', { exact: false })).toBeVisible();
  await expect(preview.getByText('支持表格', { exact: false })).toBeVisible();

  await expect(preview.getByRole('columnheader', { name: '功能' })).toBeVisible();
  await expect(preview.getByRole('columnheader', { name: '状态' })).toBeVisible();
  await expect(preview.getByRole('columnheader', { name: '说明' })).toBeVisible();
});

test('updates content when typing in BlockNote editor', async ({ page }) => {
  await openWithFreshWorkspace(page);

  await page.getByText('这是一个支持 CommonMark 规范的 Markdown 渲染器示例。').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' 这是新的段落内容。');

  await expect(page.locator('#markdown-output').getByText('这是新的段落内容。')).toBeVisible();
});

test('paper copy button fades in on hover', async ({ page }) => {
  await openWithFreshWorkspace(page);

  const surface = page.getByTestId('paper-surface');
  const copyButton = page.getByTestId('paper-copy-wechat');

  await expect(copyButton).toHaveCSS('opacity', '0');
  await surface.hover();
  await expect(copyButton).toHaveCSS('opacity', '1');
});
