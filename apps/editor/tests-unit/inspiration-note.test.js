import { describe, expect, it } from 'vitest';
import {
  buildInspirationDailyMarkdown,
  buildInspirationEntry,
  INSPIRATION_DAILY_SECTION,
} from '../renderer/src/core/agent/inspirationNote.js';
import { appendDailyMarkdown, getDailyEntry } from '../renderer/src/utils/dailyWorkspace.js';
import { blockPlainText } from '@shared/daily/dailyBlocks.js';

const DATE = '2026-10-05';
const EMPTY_DAILY = { currentDate: DATE, entries: {} };

const pinToDaily = (input, daily = EMPTY_DAILY) => appendDailyMarkdown(
  daily, DATE, INSPIRATION_DAILY_SECTION, buildInspirationDailyMarkdown(input),
);

/** 「💡 笔记」标题后面的块 */
const noteItems = (daily) => {
  const blocks = getDailyEntry(daily, DATE).blocks;
  const start = blocks.findIndex((block) => blockPlainText(block).includes('笔记'));
  return blocks.slice(start + 1).filter((block) => blockPlainText(block));
};

describe('inspiration note → 今日速记', () => {
  it('拒绝空内容', () => {
    expect(() => buildInspirationEntry({ text: '  ' })).toThrow('没有可记录');
  });

  it('去重来源并生成标题', () => {
    expect(buildInspirationEntry({
      text: '点子', title: '会话', sources: ['文档 A', '文档 A', '链接 B'],
    })).toMatchObject({
      heading: '灵感 · 会话',
      sourceLine: '来源：文档 A / 链接 B',
    });
  });

  it('写进笔记分区：标题条目下挂正文和来源', () => {
    const [item] = noteItems(pinToDaily({ text: '第一个点子\n第二行', title: '新会话' }));
    expect(item.type).toBe('bulletListItem');
    expect(blockPlainText(item)).toBe('灵感 · 新会话');
    expect(item.children.map(blockPlainText)).toEqual(['第一个点子', '第二行', '来源：对话']);
  });

  it('正文里的标题不会变成新分区，列表和代码块保留', () => {
    const daily = pinToDaily({ text: '## 小标题\n- 要点\n```js\nconst a = 1;\n```', title: '会话' });
    const blocks = getDailyEntry(daily, DATE).blocks;
    expect(blocks.filter((block) => block.type === 'heading')).toHaveLength(3);
    const [item] = noteItems(daily);
    expect(item.children.map((block) => block.type)).toEqual(['paragraph', 'bulletListItem', 'codeBlock', 'bulletListItem']);
    expect(blockPlainText(item.children[0])).toBe('小标题');
    expect(blockPlainText(item.children[2])).toBe('const a = 1;');
  });

  it('多次记录依次追加，不覆盖之前的', () => {
    const first = pinToDaily({ text: '点子 A', title: '会话 1' });
    const items = noteItems(pinToDaily({ text: '点子 B', title: '会话 2' }, first));
    expect(items.map(blockPlainText)).toEqual(['灵感 · 会话 1', '灵感 · 会话 2']);
  });
});
