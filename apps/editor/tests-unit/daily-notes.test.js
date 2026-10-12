import { describe, expect, it } from 'vitest';
import {
  appendDailyMarkdown,
  getDailyMarkdown,
  getWeekStartDateKey,
  setDailyNoteOrganized,
} from '../renderer/src/utils/dailyWorkspace.js';
import { collectDailyNotes, filterNotes, groupNotesByWeek, NOTE_FILTERS } from '../renderer/src/utils/dailyNotes.js';
import { isBlockOrganized, setBlockOrganized, stripOrganizedTag } from '@shared/daily/dailyBlocks.js';
import { markdownToBlocks } from '@shared/daily/dailyMarkdown.js';

const TODAY = '2026-10-12'; // 周一

const buildWorkspace = () => {
  let ws = { currentDate: TODAY, entries: {} };
  ws = appendDailyMarkdown(ws, '2026-10-05', 'note', '- 上周一的想法\n  - 细节 A');
  ws = appendDailyMarkdown(ws, '2026-10-11', 'note', '- 上周日的灵感');
  ws = appendDailyMarkdown(ws, '2026-10-11', 'task', '- 不是笔记的任务');
  ws = appendDailyMarkdown(ws, '2026-10-12', 'note', '- 今天的笔记 #已整理');
  return ws;
};

describe('按周归档', () => {
  it('周一开头，周日算上一周', () => {
    expect(getWeekStartDateKey('2026-10-12')).toBe('2026-10-12');
    expect(getWeekStartDateKey('2026-10-11')).toBe('2026-10-05');
    expect(getWeekStartDateKey('2026-10-14')).toBe('2026-10-12');
  });

  it('只收「笔记」分区，按周分组、新的在前', () => {
    const notes = collectDailyNotes(buildWorkspace());
    expect(notes.map((note) => note.title)).toEqual(['今天的笔记', '上周日的灵感', '上周一的想法']);
    expect(notes[2].detail).toBe('细节 A');
    const groups = groupNotesByWeek(notes, TODAY);
    expect(groups.map((group) => [group.weekStart, group.tag, group.notes.length, group.organizedCount])).toEqual([
      ['2026-10-12', '本周', 1, 1],
      ['2026-10-05', '上周', 2, 0],
    ]);
    expect(groups[1].label).toBe('10月5日 – 10月11日');
  });

  it('筛选未整理 / 已整理', () => {
    const notes = collectDailyNotes(buildWorkspace());
    expect(filterNotes(notes, NOTE_FILTERS.PENDING)).toHaveLength(2);
    expect(filterNotes(notes, NOTE_FILTERS.ORGANIZED)).toHaveLength(1);
  });
});

describe('已整理标记', () => {
  it('加上 / 去掉标签，重复操作幂等', () => {
    const [item] = markdownToBlocks('- **加粗**想法');
    const marked = setBlockOrganized(item, true);
    expect(isBlockOrganized(marked)).toBe(true);
    expect(setBlockOrganized(marked, true)).toBe(marked);
    const unmarked = setBlockOrganized(marked, false);
    expect(isBlockOrganized(unmarked)).toBe(false);
    expect(unmarked.content).toEqual(item.content);
  });

  it('标签要独立成词，展示时去掉', () => {
    expect(isBlockOrganized(markdownToBlocks('- 讨论#已整理的定义')[0])).toBe(false);
    expect(stripOrganizedTag('想法 #已整理')).toBe('想法');
  });

  it('按 id 标记写回那一天，Markdown 里能看到标签', () => {
    const ws = buildWorkspace();
    const note = collectDailyNotes(ws).find((item) => item.date === '2026-10-05');
    const result = setDailyNoteOrganized(ws, note.date, note.blockId, true);
    expect(result.found).toBe(true);
    expect(getDailyMarkdown(result.dailyWorkspace, '2026-10-05')).toContain('- 上周一的想法 #已整理');
    expect(collectDailyNotes(result.dailyWorkspace).find((item) => item.blockId === note.blockId).organized).toBe(true);
    expect(setDailyNoteOrganized(ws, note.date, 'missing', true).found).toBe(false);
  });

  it('Markdown 往返后标签还在', () => {
    const blocks = markdownToBlocks('## 💡 笔记\n\n- 想法 #已整理\n  - 子级');
    const markdown = getDailyMarkdown({ entries: { [TODAY]: { date: TODAY, blocks } } }, TODAY);
    expect(isBlockOrganized(markdownToBlocks(markdown)[1])).toBe(true);
  });
});
