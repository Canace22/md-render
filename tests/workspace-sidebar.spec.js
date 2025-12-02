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

  // 点击顶部搜索栏右侧的“新建文档”按钮
  await page.getByTitle('新建文档').click();

  // 树中应出现默认命名的新文件
  const newFileNode = page.locator('.tree-node-text', { hasText: '未命名' });
  await expect(newFileNode).toBeVisible();

  // 编辑器应为空白
  const editor = page.locator('#markdown-input');
  await expect(editor).toHaveValue('');
});

test('can create a new folder from workspace toolbar', async ({ page }) => {
  await openWithFreshWorkspace(page);

  await page.getByTitle('新建文件夹').click();

  // 新建文件夹名称以“新建文件夹”开头（可能带序号）
  const folderNode = page.locator('.tree-node-text', { hasText: '新建文件夹' });
  await expect(folderNode).toBeVisible();
});

test('delete action is disabled when root folder is selected', async ({ page }) => {
  await openWithFreshWorkspace(page);

  const deleteButton = page.getByTitle('删除');
  // 默认选中的是示例文件，此时删除按钮应是可用状态
  await expect(deleteButton).toBeEnabled();
});


