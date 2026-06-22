import { describe, expect, it } from 'vitest';
import {
  addDailyEntryItem,
  carryOverIncompleteTasks,
  getDailyEntry,
  setDailyCurrentDate,
  toggleDailyEntryTaskDone,
} from '../renderer/src/utils/dailyWorkspace.js';

// 构造一个含未完成任务 + 笔记的今天，再补一条昨天的笔记
function buildWorkspace(today) {
  let ws = { currentDate: today, entries: {}, todoPool: [] };
  ws = addDailyEntryItem(ws, today, { type: 'task', text: '写周报' });
  ws = addDailyEntryItem(ws, today, { type: 'note', text: '今天的想法' });
  return ws;
}

const TODAY = '2026-06-16';
const YESTERDAY = '2026-06-15';
const TOMORROW = '2026-06-17';

describe('setDailyCurrentDate (纯视图切换)', () => {
  it('case1: 只改 currentDate，不动条目', () => {
    const ws = buildWorkspace(TODAY);
    const next = setDailyCurrentDate(ws, YESTERDAY);
    expect(next.currentDate).toBe(YESTERDAY);
    // 今天的条目原封不动
    expect(getDailyEntry(next, TODAY).items).toHaveLength(2);
  });

  it('case2: 来回切日期多次，今天的数据不丢失/不重置', () => {
    let ws = buildWorkspace(TODAY);
    const before = getDailyEntry(ws, TODAY).items.map((i) => i.id).sort();
    for (const d of [YESTERDAY, TOMORROW, YESTERDAY, TODAY, TOMORROW, YESTERDAY]) {
      ws = setDailyCurrentDate(ws, d);
    }
    const after = getDailyEntry(ws, TODAY).items.map((i) => i.id).sort();
    expect(after).toEqual(before);
    // 任务没有被偷偷搬进待办池
    expect(ws.todoPool).toHaveLength(0);
  });

  it('case3: 切到未来日期不会把今天的未完成任务搬走', () => {
    const ws = buildWorkspace(TODAY);
    const next = setDailyCurrentDate(ws, TOMORROW);
    expect(getDailyEntry(next, TODAY).items.filter((i) => i.type === 'task')).toHaveLength(1);
    expect(next.todoPool).toHaveLength(0);
  });

  it('case4: 切到过去日期不会删除过去那天的条目', () => {
    let ws = buildWorkspace(TODAY);
    ws = addDailyEntryItem(ws, YESTERDAY, { type: 'note', text: '昨天的笔记' });
    const next = setDailyCurrentDate(ws, YESTERDAY);
    expect(getDailyEntry(next, YESTERDAY).items).toHaveLength(1);
  });

  it('case5: 非法日期回退到原 currentDate', () => {
    const ws = buildWorkspace(TODAY);
    const next = setDailyCurrentDate(ws, 'not-a-date');
    expect(next.currentDate).toBe(TODAY);
  });
});

describe('carryOverIncompleteTasks (进入今天才结转)', () => {
  it('case6: 昨天未完成任务沉到待办池', () => {
    let ws = { currentDate: YESTERDAY, entries: {}, todoPool: [] };
    ws = addDailyEntryItem(ws, YESTERDAY, { type: 'task', text: '昨天没做完' });
    const next = carryOverIncompleteTasks(ws, TODAY);
    expect(next.todoPool.map((t) => t.text)).toContain('昨天没做完');
    expect(getDailyEntry(next, YESTERDAY).items.filter((i) => i.type === 'task')).toHaveLength(0);
  });

  it('case7: 已完成的任务不会被搬进待办池', () => {
    let ws = { currentDate: YESTERDAY, entries: {}, todoPool: [] };
    ws = addDailyEntryItem(ws, YESTERDAY, { type: 'task', text: '昨天做完了' });
    const taskId = getDailyEntry(ws, YESTERDAY).items[0].id;
    ws = toggleDailyEntryTaskDone(ws, YESTERDAY, taskId);
    const next = carryOverIncompleteTasks(ws, TODAY);
    expect(next.todoPool).toHaveLength(0);
  });

  it('case8: 昨天的笔记带到今天，重复结转不产生重复笔记（幂等）', () => {
    let ws = { currentDate: YESTERDAY, entries: {}, todoPool: [] };
    ws = addDailyEntryItem(ws, YESTERDAY, { type: 'note', text: '昨天的灵感' });
    let next = carryOverIncompleteTasks(ws, TODAY);
    next = carryOverIncompleteTasks(next, TODAY);
    const todayNotes = getDailyEntry(next, TODAY).items.filter((i) => i.type === 'note');
    expect(todayNotes.filter((n) => n.text === '昨天的灵感')).toHaveLength(1);
  });

  it('case9: 今天的条目在结转后保留', () => {
    let ws = { currentDate: TODAY, entries: {}, todoPool: [] };
    ws = addDailyEntryItem(ws, TODAY, { type: 'task', text: '今天的任务' });
    const next = carryOverIncompleteTasks(ws, TODAY);
    expect(getDailyEntry(next, TODAY).items.map((i) => i.text)).toContain('今天的任务');
  });

  it('case10: 没有昨天数据时结转是无害的空操作', () => {
    const ws = { currentDate: TODAY, entries: {}, todoPool: [] };
    const next = carryOverIncompleteTasks(ws, TODAY);
    expect(next.currentDate).toBe(TODAY);
    expect(next.todoPool).toHaveLength(0);
    expect(Object.keys(next.entries)).toHaveLength(0);
  });

  it('case11: 跨多天（含中间空档）的历史笔记都汇聚到今天，原日期不再保留', () => {
    let ws = { currentDate: '2026-06-15', entries: {}, todoPool: [] };
    // 6/15、6/18 都有笔记，6/16、6/17 空着；今天是 6/22（中间断链）
    ws = addDailyEntryItem(ws, '2026-06-15', { type: 'note', text: '6/15 的想法' });
    ws = addDailyEntryItem(ws, '2026-06-18', { type: 'note', text: '6/18 的想法' });
    const next = carryOverIncompleteTasks(ws, '2026-06-22');
    const todayNotes = getDailyEntry(next, '2026-06-22').items
      .filter((i) => i.type === 'note')
      .map((i) => i.text);
    expect(todayNotes).toEqual(['6/15 的想法', '6/18 的想法']);
    // 历史日期的 note 被移走
    expect(getDailyEntry(next, '2026-06-15').items.filter((i) => i.type === 'note')).toHaveLength(0);
    expect(getDailyEntry(next, '2026-06-18').items.filter((i) => i.type === 'note')).toHaveLength(0);
  });

  it('case12: 历史 event 不被带到今天，留在原日期', () => {
    let ws = { currentDate: YESTERDAY, entries: {}, todoPool: [] };
    ws = addDailyEntryItem(ws, YESTERDAY, { type: 'event', text: '昨天的会议' });
    ws = addDailyEntryItem(ws, YESTERDAY, { type: 'note', text: '昨天的笔记' });
    const next = carryOverIncompleteTasks(ws, TODAY);
    expect(getDailyEntry(next, YESTERDAY).items.map((i) => i.text)).toEqual(['昨天的会议']);
    expect(getDailyEntry(next, TODAY).items.filter((i) => i.type === 'note')).toHaveLength(1);
  });

  it('case13: 多天历史笔记重复结转保持幂等（不重复、不复活）', () => {
    let ws = { currentDate: '2026-06-15', entries: {}, todoPool: [] };
    ws = addDailyEntryItem(ws, '2026-06-15', { type: 'note', text: 'A' });
    ws = addDailyEntryItem(ws, '2026-06-18', { type: 'note', text: 'B' });
    let next = carryOverIncompleteTasks(ws, '2026-06-22');
    next = carryOverIncompleteTasks(next, '2026-06-22');
    next = carryOverIncompleteTasks(next, '2026-06-22');
    const todayNotes = getDailyEntry(next, '2026-06-22').items
      .filter((i) => i.type === 'note')
      .map((i) => i.text);
    expect(todayNotes).toEqual(['A', 'B']);
  });
});
