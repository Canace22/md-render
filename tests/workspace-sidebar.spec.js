import { test, expect } from '@playwright/test';

async function openWithFreshWorkspace(page) {
  await page.goto('/');
  await page.evaluate(() => {
    window.localStorage.clear();
  });
  await page.goto('/');
}

test('can create a new file from workspace toolbar', async ({ page }) => {
  await openWithFreshWorkspace(page);

  // 点击「新建文件」图标
  await page.getByRole('button', { name: '新建文件' }).click();

  // 树中应出现默认命名的新文件
  const newFileNode = page.locator('.tree-node-text', { hasText: '未命名' });
  await expect(newFileNode).toBeVisible();

  // 编辑器应为空白
  const editor = page.locator('#markdown-input');
  await expect(editor).toHaveValue('');
});

test('can create a new folder from node menu', async ({ page }) => {
  await openWithFreshWorkspace(page);

  // 点击某节点的三点菜单，选择「新建文件夹」
  await page.locator('.tree-node-more-btn').first().click();
  await page.getByRole('button', { name: /新建文件夹/ }).click();

  // 新建文件夹名称以「新建文件夹」开头（可能带序号）
  const folderNode = page.locator('.tree-node-text', { hasText: '新建文件夹' });
  await expect(folderNode).toBeVisible();
});

test('can create a new folder from add button', async ({ page }) => {
  await openWithFreshWorkspace(page);

  // 点击「新建文件夹」图标
  await page.getByRole('button', { name: '新建文件夹' }).click();

  const folderNode = page.locator('.tree-node-text', { hasText: '新建文件夹' });
  await expect(folderNode).toBeVisible();
});

test('file tree shows documents without workspace root', async ({ page }) => {
  await openWithFreshWorkspace(page);

  // 不显示「工作区」层级，直接显示文件
  await expect(page.locator('.tree-node-text', { hasText: '工作区' })).not.toBeVisible();
  await expect(page.locator('.tree-node-text', { hasText: '示例文档' })).toBeVisible();
});


