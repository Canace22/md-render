import { test, expect } from '@playwright/test';

const NOVEL_MARKDOWN = `# 第一章

乔文达低声说，声音温柔得让人心底发痒。

乔文达抬手替她拢了拢耳边的碎发。`;

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
            name: '示例文档.md',
            content: markdown,
          },
        ],
      }),
    );
    window.localStorage.setItem('md-renderer-selected-id', 'file-default');
  }, NOVEL_MARKDOWN);

  await page.goto('/');
}

async function clickTextInEditor(page, keyword) {
  const position = await page.locator('.blocknote-editor .ProseMirror').evaluate((root, text) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();

    while (node) {
      const content = node.textContent ?? '';
      const index = content.indexOf(text);
      if (index >= 0) {
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + text.length);
        const rect = range.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          return {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
          };
        }
      }
      node = walker.nextNode();
    }

    return null;
  }, keyword);

  if (!position) {
    throw new Error(`Unable to find text in editor: ${keyword}`);
  }

  await page.mouse.click(position.x, position.y);
}

test('entity preview modal supports editing summary and aliases', async ({ page }) => {
  await openWithNovelWorkspace(page);

  await page.getByTestId('toggle-novel-mode').click();
  await page.waitForTimeout(1400);

  await clickTextInEditor(page, '乔文达');
  await expect(page.getByTestId('novel-entity-preview-summary-input')).toBeVisible();

  const summaryInput = page.getByTestId('novel-entity-preview-summary-input');
  await summaryInput.fill('乔文达说话很轻，却总能拿稳局面。');
  await summaryInput.blur();

  const aliasesInput = page.getByTestId('novel-entity-preview-aliases-input');
  await aliasesInput.fill('乔郎，文达');
  await aliasesInput.blur();

  const traitsInput = page.getByTestId('novel-entity-preview-traits-input');
  await traitsInput.fill('温柔，克制');
  await traitsInput.blur();

  await page.locator('.novel-entity-preview-ant-modal .ant-modal-close').click();

  await expect(page.getByTestId('novel-assistant-panel')).toContainText('乔文达说话很轻，却总能拿稳局面。');
  await expect(page.getByTestId('novel-assistant-panel')).toContainText('乔郎、文达');
});
