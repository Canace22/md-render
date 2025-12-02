import { test, expect } from '@playwright/test';

test('loads home page and renders editor', async ({ page }) => {
  await page.goto('/');

  // 检查页面标题或核心 UI 是否存在
  await expect(page).toHaveTitle(/Markdown/i);

  // 左侧 Markdown 文本区域
  const editor = page.locator('#markdown-input');
  await expect(editor).toBeVisible();

  await editor.fill('# Hello Playwright');

  // 右侧预览区域容器
  const preview = page.locator('#markdown-output');
  // 标题会被渲染为 <h1>Hello Playwright</h1>
  await expect(preview.getByRole('heading', { name: 'Hello Playwright' })).toBeVisible();
});


