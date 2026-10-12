import { describe, expect, it } from 'vitest';
import {
  appendDailyMarkdown,
  carryOverIncompleteTasks,
  getDailyBlocksForEditor,
  getDailyEntry,
  getDailyMarkdown,
  getDailyRecordedDates,
  normalizeDailyWorkspace,
  setDailyCurrentDate,
  setDailyEntryBlocks,
  setDailyTaskDone,
  shiftDateKey,
} from '../renderer/src/utils/dailyWorkspace.js';
import { markdownToBlocks } from '@shared/daily/dailyMarkdown.js';

const TODAY = '2026-10-09';
const YESTERDAY = shiftDateKey(TODAY, -1);
const TWO_DAYS_AGO = shiftDateKey(TODAY, -2);
const TOMORROW = shiftDateKey(TODAY, 1);

const DAY = (md) => markdownToBlocks(md);
const build = (days, currentDate = TODAY) => Object.entries(days).reduce(
  (ws, [date, md]) => setDailyEntryBlocks(ws, date, DAY(md)),
  { currentDate, entries: {} },
);

const base = () => build({
  [YESTERDAY]: '## 📝 今日任务\n\n- [ ] 写周报\n  - 收集数据\n- [x] 回邮件\n\n## 💡 笔记\n\n- 昨天的想法',
  [TODAY]: '## 📝 今日任务\n\n- [ ] 今天的事',
});

describe('切日期是纯视图', () => {
  it('切到过去 / 未来 / 来回切：不搬任何内容', () => {
    let ws = base();
    const before = JSON.stringify(ws.entries);
    [YESTERDAY, TOMORROW, TWO_DAYS_AGO, YESTERDAY].forEach((date) => { ws = setDailyCurrentDate(ws, date); });
    expect(JSON.stringify(ws.entries)).toBe(before);
    expect(ws.currentDate).toBe(YESTERDAY);
  });

  it('非法日期回退到原 currentDate', () => {
    expect(setDailyCurrentDate(base(), 'not-a-date').currentDate).toBe(TODAY);
  });
});

describe('进入今天：结转未完成任务', () => {
  it('昨天没勾的任务连同子级搬到今天「今日任务」，已勾选和笔记留在原地', () => {
    const ws = carryOverIncompleteTasks(base(), TODAY);
    expect(getDailyMarkdown(ws, TODAY)).toBe('## 📝 今日任务\n\n- [ ] 今天的事\n- [ ] 写周报\n  - 收集数据');
    const yesterday = getDailyMarkdown(ws, YESTERDAY);
    expect(yesterday).toContain('- [x] 回邮件');
    expect(yesterday).toContain('- 昨天的想法');
    expect(yesterday).not.toContain('写周报');
  });

  it('幂等：重复进入今天不会重复', () => {
    const once = carryOverIncompleteTasks(base(), TODAY);
    const twice = carryOverIncompleteTasks(once, TODAY);
    expect(getDailyMarkdown(twice, TODAY)).toBe(getDailyMarkdown(once, TODAY));
  });

  it('今天已有同名未完成任务：不重复加，但旧的那天也清掉', () => {
    const ws = build({ [YESTERDAY]: '- [ ] 同一件事', [TODAY]: '## 📝 今日任务\n\n- [ ] 同一件事' });
    const next = carryOverIncompleteTasks(ws, TODAY);
    expect(getDailyMarkdown(next, TODAY).match(/同一件事/g)).toHaveLength(1);
    expect(next.entries[YESTERDAY]).toBeUndefined();
  });

  it('今天还没写过：用模板，任务替换掉空占位行', () => {
    const ws = build({ [TWO_DAYS_AGO]: '- [ ] 很久以前的事' });
    const md = getDailyMarkdown(carryOverIncompleteTasks(ws, TODAY), TODAY);
    expect(md).toContain('## 📝 今日任务\n\n- [ ] 很久以前的事');
    expect(md).toContain('## 📅 事件');
  });

  it('空 workspace 进入今天：无害空操作', () => {
    const ws = carryOverIncompleteTasks({ currentDate: YESTERDAY, entries: {} }, TODAY);
    expect(ws).toEqual({ currentDate: TODAY, entries: {} });
  });
});

describe('写入', () => {
  it('编辑器写回空内容（只剩模板）就删掉这一天', () => {
    const ws = setDailyEntryBlocks(base(), TODAY, getDailyBlocksForEditor({ entries: {} }, TODAY));
    expect(ws.entries[TODAY]).toBeUndefined();
  });

  it('往任务分区追加多行大纲：顶层变成待勾选任务，子级保留', () => {
    const ws = appendDailyMarkdown(base(), TODAY, 'task', '整理素材\n  - 截图\n  - 配音');
    expect(getDailyMarkdown(ws, TODAY)).toBe('## 📝 今日任务\n\n- [ ] 今天的事\n- [ ] 整理素材\n  - 截图\n  - 配音');
  });

  it('分区不存在时新建分区', () => {
    const ws = appendDailyMarkdown(base(), TODAY, 'note', '- 一个点子');
    expect(getDailyMarkdown(ws, TODAY)).toContain('## 💡 笔记\n\n- 一个点子');
  });

  it('勾选任务：先完全匹配再包含匹配；找不到返回 found=false', () => {
    const done = setDailyTaskDone(base(), TODAY, '今天的事');
    expect(done.found).toBe(true);
    expect(getDailyMarkdown(done.dailyWorkspace, TODAY)).toContain('- [x] 今天的事');
    expect(setDailyTaskDone(base(), YESTERDAY, '周报').text).toBe('写周报');
    expect(setDailyTaskDone(base(), TODAY, '不存在').found).toBe(false);
  });
});

describe('旧数据转换', () => {
  it('旧条目 + 待办池 → 大纲；待办并到当前日期的「今日任务」', () => {
    const ws = normalizeDailyWorkspace({
      currentDate: YESTERDAY,
      entries: {
        [YESTERDAY]: {
          items: [
            { id: 't1', type: 'task', done: true, text: '旧任务' },
            { id: 'e1', type: 'event', text: '开会' },
            { id: 'n1', type: 'note', text: '第一行\n- 子项', richText: [] },
          ],
        },
      },
      todoPool: [{ id: 'todo-1', text: '旧待办' }],
    });
    expect(getDailyMarkdown(ws, YESTERDAY)).toBe('## 📝 今日任务\n\n- [x] 旧任务\n- [ ] 旧待办\n\n## 📅 事件\n\n- 开会\n\n## 💡 笔记\n\n- 第一行\n  - 子项');
    expect(ws.todoPool).toBeUndefined();
    expect(getDailyEntry(ws, YESTERDAY).blocks[1].id).toBe('t1');
  });
});

describe('getDailyRecordedDates（日历打点）', () => {
  it('只返回有内容的日期', () => {
    expect([...getDailyRecordedDates(base())].sort()).toEqual([YESTERDAY, TODAY]);
  });

  it('写回只剩模板的日子不算有记录', () => {
    const ws = setDailyEntryBlocks(base(), TODAY, getDailyBlocksForEditor({ entries: {} }, TODAY));
    expect(getDailyRecordedDates(ws).has(TODAY)).toBe(false);
  });

  it('空工作区 / 缺 entries 返回空集合', () => {
    expect(getDailyRecordedDates(undefined).size).toBe(0);
    expect(getDailyRecordedDates({ currentDate: TODAY }).size).toBe(0);
  });
});
