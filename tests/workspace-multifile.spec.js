import { test, expect } from '@playwright/test';

async function openWithFreshWorkspace(page) {
  await page.goto('/');
  await page.evaluate(() => {
    window.localStorage.clear();
  });
  await page.goto('/');
}

test('multiple files keep independent content when switching', async ({ page }) => {
  await openWithFreshWorkspace(page);

  const editor = page.locator('#markdown-input');

  // 1. 记录默认示例文档的部分内容
  const originalText = await editor.inputValue();
  expect(originalText).toContain('欢迎使用 Markdown 渲染器');

  // 2. 新建第一个文件，输入内容 A
  await page.getByTitle('新建文档').click();
  await expect(editor).toHaveValue('');
  await editor.fill('File A content');

  // 3. 再新建第二个文件，输入内容 B
  await page.getByTitle('新建文档').click();
  await expect(editor).toHaveValue('');
  await editor.fill('File B content');

  // 4. 切回第一个新建文件（未命名.md）
  await page.locator('.tree-node-text', { hasText: '未命名.md' }).click();
  await expect(editor).toHaveValue('File A content');

  // 5. 切回第二个新建文件（未命名 1.md）
  await page.locator('.tree-node-text', { hasText: '未命名 1.md' }).click();
  await expect(editor).toHaveValue('File B content');

  // 6. 再次回到默认示例文档，确认内容未被覆盖
  await page.locator('.tree-node-text', { hasText: '示例文档.md' }).click();
  const restored = await editor.inputValue();
  expect(restored).toContain('欢迎使用 Markdown 渲染器');
});

test('workspace with multiple files persists after reload', async ({ page }) => {
  await openWithFreshWorkspace(page);

  const editor = page.locator('#markdown-input');

  // 新建文件并写入内容
  await page.getByTitle('新建文档').click();
  await editor.fill('Persisted content 123');

  // 刷新页面后，工作区结构应从 localStorage 恢复
  await page.reload();

  // 点击未命名文件，确认内容被恢复
  await page.locator('.tree-node-text', { hasText: '未命名.md' }).click();
  await expect(editor).toHaveValue('Persisted content 123');
});


