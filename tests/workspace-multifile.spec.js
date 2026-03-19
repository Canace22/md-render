import { test, expect } from '@playwright/test';

async function openWithFreshWorkspace(page) {
  await page.goto('/');
  await page.evaluate(() => {
    window.localStorage.clear();
  });
  await page.goto('/');
}

async function editActiveDocument(page, text) {
  const editor = page.locator('.blocknote-editor .ProseMirror').first();
  await editor.click();
  await page.keyboard.type(text);
}

test('multiple files keep independent content when switching', async ({ page }) => {
  await openWithFreshWorkspace(page);

  await expect(page.locator('#markdown-output').getByRole('heading', { name: '欢迎使用 Markdown 渲染器' })).toBeVisible();

  await page.getByRole('button', { name: '新建文件' }).click();
  await editActiveDocument(page, 'File A content');

  await page.getByRole('button', { name: '新建文件' }).click();
  await editActiveDocument(page, 'File B content');

  await page.locator('.tree-node-text', { hasText: '未命名.md' }).click();
  await expect(page.locator('#markdown-output').getByText('File A content')).toBeVisible();

  await page.locator('.tree-node-text', { hasText: '未命名 1.md' }).click();
  await expect(page.locator('#markdown-output').getByText('File B content')).toBeVisible();

  await page.locator('.tree-node-text', { hasText: '示例文档.md' }).click();
  await expect(page.locator('#markdown-output').getByRole('heading', { name: '欢迎使用 Markdown 渲染器' })).toBeVisible();
});

test('workspace with multiple files persists after reload', async ({ page }) => {
  await openWithFreshWorkspace(page);

  await page.getByRole('button', { name: '新建文件' }).click();
  await editActiveDocument(page, 'Persisted content 123');

  await page.reload();

  await page.locator('.tree-node-text', { hasText: '未命名.md' }).click();
  await expect(page.locator('#markdown-output').getByText('Persisted content 123')).toBeVisible();
});
