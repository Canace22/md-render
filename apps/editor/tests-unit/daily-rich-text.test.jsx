import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import DailyNotebook from '../renderer/src/components/DailyNotebook.jsx';
import DailyItemRow from '../renderer/src/components/daily/DailyItemRow.jsx';
import DailyRichContent from '../renderer/src/components/daily/DailyRichContent.jsx';
import {
  hasRichFormatting,
  normalizeRichText,
  plainTextToRichText,
  richTextToPlainText,
} from '../renderer/src/utils/dailyRichText.js';
import {
  addDailyEntryItem,
  getDailyEntry,
  promoteTodoToDaily,
  sendDailyEntryTaskToTodo,
  updateDailyEntryItem,
} from '../renderer/src/utils/dailyWorkspace.js';

const DATE = '2026-09-08';

const RICH = [
  { type: 'paragraph', content: [{ type: 'text', text: '今天的重点', styles: { bold: true } }] },
  { type: 'bulletListItem', content: [{ type: 'text', text: '第一件事', styles: { textColor: 'red' } }] },
  { type: 'bulletListItem', content: [{ type: 'text', text: '第二件事', styles: {} }] },
  { type: 'checkListItem', props: { checked: true }, content: [{ type: 'text', text: '已完成的', styles: {} }] },
];

const createWorkspace = () => ({ currentDate: DATE, entries: {}, todoPool: [] });

describe('今日速记富文本内容（dailyRichText 纯函数）', () => {
  it('不支持的块类型降级成段落，内容不丢', () => {
    const blocks = normalizeRichText([
      { type: 'table', content: [{ type: 'text', text: '表格内容', styles: {} }] },
    ]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('paragraph');
    expect(richTextToPlainText(blocks)).toBe('表格内容');
  });

  it('非法颜色与危险链接被剔除，链接文字保留', () => {
    const blocks = normalizeRichText([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: '着色', styles: { textColor: 'rgb(1,2,3)', bold: true } },
          { type: 'link', href: 'javascript:alert(1)', content: [{ type: 'text', text: '危险链接', styles: {} }] },
          { type: 'link', href: 'https://example.com', content: [{ type: 'text', text: '正常链接', styles: {} }] },
        ],
      },
    ]);
    const [paragraph] = blocks;
    expect(paragraph.content[0].styles).toEqual({ bold: true });
    expect(paragraph.content[1]).toMatchObject({ type: 'text', text: '危险链接' });
    expect(paragraph.content[2]).toMatchObject({ type: 'link', href: 'https://example.com' });
  });

  it('纯文本投影是多行的 Markdown 风格文本', () => {
    expect(richTextToPlainText(RICH)).toBe('今天的重点\n- 第一件事\n- 第二件事\n- [x] 已完成的');
  });

  it('纯文本还原成富文本时识别列表前缀', () => {
    const blocks = plainTextToRichText('普通一行\n- 列表项\n1. 编号项\n- [ ] 待办项');
    expect(blocks.map((block) => block.type)).toEqual([
      'paragraph', 'bulletListItem', 'numberedListItem', 'checkListItem',
    ]);
  });

  it('只有单段无样式文字时不算「有格式」，避免白存一份 richText', () => {
    expect(hasRichFormatting(plainTextToRichText('一行普通文字'))).toBe(false);
    expect(hasRichFormatting(RICH)).toBe(true);
  });
});

describe('今日速记富文本落盘（dailyWorkspace）', () => {
  it('存富文本时纯文本由它派生，两者不会漂移', () => {
    const workspace = addDailyEntryItem(createWorkspace(), DATE, { type: 'note', text: '旧文本', richText: RICH });
    const [item] = getDailyEntry(workspace, DATE).items;
    expect(item.text).toBe(richTextToPlainText(RICH));
    expect(item.richText).toHaveLength(4);
  });

  it('纯文本条目保留换行，不再被压成一行', () => {
    const workspace = addDailyEntryItem(createWorkspace(), DATE, { type: 'note', text: '第一行\n第二行\n\n\n第三行' });
    expect(getDailyEntry(workspace, DATE).items[0].text).toBe('第一行\n第二行\n\n第三行');
  });

  it('改成纯文本时清掉旧的 richText，不留残影', () => {
    let workspace = addDailyEntryItem(createWorkspace(), DATE, { type: 'note', text: '', richText: RICH });
    const [item] = getDailyEntry(workspace, DATE).items;
    workspace = updateDailyEntryItem(workspace, DATE, item.id, '改成纯文本', []);
    const [updated] = getDailyEntry(workspace, DATE).items;
    expect(updated.text).toBe('改成纯文本');
    expect(updated.richText).toBeUndefined();
  });

  it('任务移到待办池再取回，富文本不丢', () => {
    let workspace = addDailyEntryItem(createWorkspace(), DATE, { type: 'task', text: '', richText: RICH });
    const [task] = getDailyEntry(workspace, DATE).items;
    workspace = sendDailyEntryTaskToTodo(workspace, DATE, task.id);
    expect(workspace.todoPool[0].richText).toHaveLength(4);
    workspace = promoteTodoToDaily(workspace, workspace.todoPool[0].id, DATE);
    const restored = getDailyEntry(workspace, DATE).items.find((entry) => entry.type === 'task');
    expect(restored.richText).toHaveLength(4);
    expect(restored.text).toBe(richTextToPlainText(RICH));
  });
});

describe('今日速记富文本渲染（只读展示）', () => {
  it('加粗、列表、颜色都渲染成对应结构', () => {
    const html = renderToStaticMarkup(<DailyRichContent richText={RICH} text="" />);
    expect(html).toContain('<strong>');
    expect(html).toContain('<ul');
    expect(html).toContain('var(--daily-rich-text-red)');
    expect(html).toContain('daily-rich-checkbox is-checked');
  });

  it('纯文本的换行按多个段落渲染', () => {
    const html = renderToStaticMarkup(<DailyRichContent richText={undefined} text={'第一行\n第二行'} />);
    expect(html.match(/class="daily-rich-paragraph"/g)).toHaveLength(2);
  });

  it('段落下挂子列表时不产生 <ul> 套 <p> 的非法嵌套', () => {
    const blocks = [{
      type: 'paragraph',
      content: [{ type: 'text', text: '父段落', styles: {} }],
      children: [{ type: 'bulletListItem', content: [{ type: 'text', text: '子项', styles: {} }] }],
    }];
    const html = renderToStaticMarkup(<DailyRichContent richText={blocks} text="" />);
    expect(html).not.toMatch(/<p[^>]*>[\s\S]*<ul/);
    expect(html).toContain('子项');
  });

  it('富文本内容里的标签被转义，不会注入 HTML', () => {
    const blocks = [{ type: 'paragraph', content: [{ type: 'text', text: '<script>bad()</script>', styles: {} }] }];
    const html = renderToStaticMarkup(<DailyRichContent richText={blocks} text="" />);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;bad()&lt;/script&gt;');
  });

  it('列表条目在今日记录列表里完整展示', () => {
    const workspace = addDailyEntryItem(createWorkspace(), DATE, { type: 'note', text: '', richText: RICH });
    const html = renderToStaticMarkup(<DailyNotebook dailyWorkspace={workspace} />);
    expect(html).toContain('今天的重点');
    expect(html).toContain('第一件事');
    expect(html).toContain('<ul');
  });

  it('没有 DOM 时编辑态降级成可换行的多行输入框', () => {
    const html = renderToStaticMarkup(<DailyItemRow
      item={{ id: 'saved', type: 'note', text: '一行' }}
      currentDate={DATE} isEditing editingDraft={{ text: '一行', richText: [] }}
    />);
    expect(html).toContain('<textarea');
    expect(html).toContain('daily-notebook-editor-hint');
    expect(html).toMatch(/保\s*存/);
  });
});
