import { test, expect } from '@playwright/test';

const NOVEL_MARKDOWN = `# 第一章

次日，沈临川来到青石城。

沈临川必须调查黑水盟潜入城中的线人。
`;

async function openWithNovelWorkspace(page) {
  await page.addInitScript((markdown) => {
    window.localStorage.clear();
    window.localStorage.setItem(
      'md-renderer-workspace',
      JSON.stringify({
        id: 'root',
        name: '工作区',
        type: 'folder',
        children: [
          {
            id: 'file-default',
            type: 'file',
            name: '小说草稿.md',
            content: markdown,
          },
        ],
      }),
    );
    window.localStorage.setItem('md-renderer-selected-id', 'file-default');
  }, NOVEL_MARKDOWN);

  await page.goto('/');
}

test('novel mode grows scene and entity cards after writing continues', async ({ page }) => {
  await openWithNovelWorkspace(page);

  await page.getByTestId('toggle-novel-mode').click();
  await expect(page.getByTestId('novel-assistant-panel')).toBeVisible();

  await page.getByText('沈临川必须调查黑水盟潜入城中的线人。').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('当夜，沈临川回到黑水营，却发现青石城的地图已经被人偷走。');

  await page.waitForTimeout(1400);

  await expect(page.getByTestId('novel-current-scene')).toContainText('黑水营');
  await expect(page.getByTestId('novel-assistant-panel')).toContainText('沈临川');
  await expect(page.getByTestId('novel-assistant-panel')).toContainText('青石城');
  await expect(page.getByTestId('novel-assistant-panel')).toContainText('实时发现');
  await expect(page.getByTestId('novel-assistant-panel')).toContainText('小说 Agent');
  await expect(page.getByTestId('novel-assistant-panel')).toContainText('确认建卡');
});

test('novel agent actions stay separate from realtime findings', async ({ page }) => {
  await openWithNovelWorkspace(page);

  await page.getByTestId('toggle-novel-mode').click();
  await expect(page.getByTestId('novel-assistant-panel')).toBeVisible();

  await page.waitForTimeout(1400);

  await page.getByRole('button', { name: '补全当前场景' }).click();

  await expect(page.getByTestId('novel-assistant-panel')).toContainText('Agent 建议');
  await expect(page.getByTestId('novel-assistant-panel')).toContainText('Agent 补全当前场景');
  await expect(page.getByTestId('novel-assistant-panel')).toContainText('实时发现');
});
