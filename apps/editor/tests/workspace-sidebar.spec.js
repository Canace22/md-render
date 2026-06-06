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

  await page.getByRole('button', { name: '新建文件' }).click();

  const newFileNode = page.locator('.tree-node-text', { hasText: '未命名' });
  await expect(newFileNode).toBeVisible();
  await expect(page.locator('.blocknote-editor')).toBeVisible();
});

test('can create a new folder from context menu', async ({ page }) => {
  await openWithFreshWorkspace(page);

  // 右键点击第一个文件夹节点，弹出上下文菜单
  await page.locator('.tree-node.folder .tree-node-row').first().click({ button: 'right' });
  await page.getByRole('button', { name: /新建文件夹/ }).click();

  const folderNode = page.locator('.tree-node-text', { hasText: '新建文件夹' });
  await expect(folderNode).toBeVisible();
});

test('can create a new folder from add button', async ({ page }) => {
  await openWithFreshWorkspace(page);

  await page.getByRole('button', { name: '新建文件夹' }).click();

  const folderNode = page.locator('.tree-node-text', { hasText: '新建文件夹' });
  await expect(folderNode).toBeVisible();
});

test('file tree shows documents without workspace root', async ({ page }) => {
  await openWithFreshWorkspace(page);

  await expect(page.locator('.tree-node-text', { hasText: '工作区' })).not.toBeVisible();
  await expect(page.locator('.tree-node-text', { hasText: '示例文档' })).toBeVisible();
});
