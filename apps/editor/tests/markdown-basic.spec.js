import { test, expect } from '@playwright/test';

async function openWithFreshWorkspace(page) {
  await page.goto('/');
  await page.evaluate(() => {
    window.localStorage.clear();
  });
  await page.goto('/');
}

async function pasteClipboardContent(page, { plainText, htmlText }) {
  await page.locator('.blocknote-editor .ProseMirror').first().click();
  await page.evaluate(
    ({ nextPlainText, nextHtmlText }) => {
      const target = document.querySelector('.blocknote-editor .ProseMirror');
      if (!target) return;

      target.focus();
      const clipboardData = new DataTransfer();
      clipboardData.setData('text/plain', nextPlainText);
      if (nextHtmlText) {
        clipboardData.setData('text/html', nextHtmlText);
      }

      const event = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData,
      });

      target.dispatchEvent(event);
    },
    {
      nextPlainText: plainText,
      nextHtmlText: htmlText,
    },
  );
}

async function resetEditorToEmptyParagraph(page) {
  await page.evaluate(() => {
    window.ProseMirror?.commands?.setContent('<p></p>');
  });
}

async function typeIntoFreshEditor(page, text) {
  await resetEditorToEmptyParagraph(page);
  const editor = page.locator('.blocknote-editor .ProseMirror').first();
  await editor.click();
  await page.keyboard.type(text);
  return editor;
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

test('pasting copied code block keeps code block structure', async ({ page }) => {
  await openWithFreshWorkspace(page);

  await resetEditorToEmptyParagraph(page);

  const codeBlocks = page.locator('.blocknote-editor [data-content-type="codeBlock"]');
  await expect(codeBlocks).toHaveCount(0);

  await pasteClipboardContent(page, {
    plainText: '- const foo = 1;\n- const bar = 2;',
    htmlText: '<pre><code>- const foo = 1;\n- const bar = 2;</code></pre>',
  });

  await expect(codeBlocks).toHaveCount(1);
  await expect(codeBlocks.filter({ hasText: '- const foo = 1;' })).toHaveCount(1);
  await expect(codeBlocks.filter({ hasText: '- const bar = 2;' })).toHaveCount(1);
});

test('pasting markdown fenced code still parses as markdown code block', async ({ page }) => {
  await openWithFreshWorkspace(page);

  await resetEditorToEmptyParagraph(page);

  const codeBlocks = page.locator('.blocknote-editor [data-content-type="codeBlock"]');
  await expect(codeBlocks).toHaveCount(0);

  await pasteClipboardContent(page, {
    plainText: '```javascript\nconst foo = 1;\nconst bar = 2;\n```',
    htmlText: '<pre><code>```javascript\nconst foo = 1;\nconst bar = 2;\n```</code></pre>',
  });

  await expect(codeBlocks).toHaveCount(1);
  await expect(codeBlocks.filter({ hasText: 'const foo = 1;' })).toHaveCount(1);
  await expect(codeBlocks.filter({ hasText: 'const bar = 2;' })).toHaveCount(1);
});

test('typing fenced markdown code converts to code block', async ({ page }) => {
  await openWithFreshWorkspace(page);
  await typeIntoFreshEditor(page, '```javascript');
  const codeBlocks = page.locator('.blocknote-editor [data-content-type="codeBlock"]');

  await page.keyboard.press('Enter');
  await expect(codeBlocks).toHaveCount(1);

  await page.keyboard.type('const foo = 1;');

  await expect(codeBlocks).toHaveCount(1);
  await expect(codeBlocks.filter({ hasText: 'const foo = 1;' })).toHaveCount(1);
});

test('typing heading markdown shortcut converts immediately', async ({ page }) => {
  await openWithFreshWorkspace(page);
  await typeIntoFreshEditor(page, '# ');
  await page.keyboard.type('即时标题');

  await expect(page.locator('.blocknote-editor [data-content-type="heading"]')).toHaveCount(1);
  await expect(page.locator('.blocknote-editor').getByRole('heading', { name: '即时标题' })).toBeVisible();
});

test('typing list and quote markdown shortcuts converts immediately', async ({ page }) => {
  await openWithFreshWorkspace(page);

  await typeIntoFreshEditor(page, '- ');
  await page.keyboard.type('列表项');
  await expect(page.locator('.blocknote-editor [data-content-type="bulletListItem"]')).toHaveCount(1);

  await typeIntoFreshEditor(page, '1. ');
  await page.keyboard.type('有序项');
  await expect(page.locator('.blocknote-editor [data-content-type="numberedListItem"]')).toHaveCount(1);

  await typeIntoFreshEditor(page, '> ');
  await page.keyboard.type('引用内容');
  await expect(page.locator('.blocknote-editor [data-content-type="quote"]')).toHaveCount(1);
});

test('typing divider markdown shortcut converts immediately', async ({ page }) => {
  await openWithFreshWorkspace(page);
  await typeIntoFreshEditor(page, '---');

  await expect(page.locator('.blocknote-editor [data-content-type="divider"]')).toHaveCount(1);
});

test('code block shows language selector and allows switching language', async ({ page }) => {
  await openWithFreshWorkspace(page);
  await typeIntoFreshEditor(page, '```javascript');
  await page.keyboard.press('Enter');
  await page.keyboard.type('const foo = 1;');

  const codeBlock = page.locator('.blocknote-editor [data-content-type="codeBlock"]').first();
  const languageSelect = codeBlock.locator('select');

  await expect(languageSelect).toHaveCount(1);
  await expect(languageSelect).toHaveValue('javascript');

  await languageSelect.selectOption('typescript');
  await expect(languageSelect).toHaveValue('typescript');
  await expect(codeBlock).toContainText('const foo = 1;');
});

test('code block uses syntax highlight tokens', async ({ page }) => {
  await openWithFreshWorkspace(page);
  await typeIntoFreshEditor(page, '```javascript');
  await page.keyboard.press('Enter');
  await page.keyboard.type('const foo = 1;');

  const codeBlock = page.locator('.blocknote-editor [data-content-type="codeBlock"]').first();
  await expect(codeBlock.locator('pre span').first()).toBeVisible();
});
