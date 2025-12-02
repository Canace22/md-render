import { test, expect } from '@playwright/test';

async function openWithFreshWorkspace(page) {
  // 先进入应用，再在同源环境下清理 localStorage
  await page.goto('/');
  await page.evaluate(() => {
    window.localStorage.clear();
  });
  await page.goto('/');
}

test('renders default example markdown on first load', async ({ page }) => {
  await openWithFreshWorkspace(page);

  const preview = page.locator('#markdown-output');
  await expect(preview).toBeVisible();

  // 默认文档中的关键内容
  await expect(preview.getByRole('heading', { name: '欢迎使用 Markdown 渲染器' })).toBeVisible();
  await expect(preview.getByText('功能特性', { exact: false })).toBeVisible();
  await expect(preview.getByText('支持表格', { exact: false })).toBeVisible();

  // 默认表格的表头
  await expect(preview.getByRole('columnheader', { name: '功能' })).toBeVisible();
  await expect(preview.getByRole('columnheader', { name: '状态' })).toBeVisible();
  await expect(preview.getByRole('columnheader', { name: '说明' })).toBeVisible();
});

test('updates preview when typing markdown', async ({ page }) => {
  await openWithFreshWorkspace(page);

  const editor = page.locator('#markdown-input');
  const preview = page.locator('#markdown-output');

  await editor.fill('# Title\n\n- item 1\n- item 2');

  await expect(preview.getByRole('heading', { name: 'Title' })).toBeVisible();
  await expect(preview.getByText('item 1')).toBeVisible();
  await expect(preview.getByText('item 2')).toBeVisible();
});


