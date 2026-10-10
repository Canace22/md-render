import { describe, expect, it } from 'vitest';
import {
  addThread,
  appendReply,
  countOpenThreads,
  createCommentThread,
  findQuoteOffset,
  normalizeCommentThreads,
  updateThread,
} from '../renderer/src/utils/commentThreads.js';

const ANCHOR = { blockId: 'b1', quote: '选择推动故事', offset: 3 };
const NOW = '2026-10-10T08:00:00.000Z';

describe('createCommentThread', () => {
  it('锚点 + 正文 → 一条未解决的线程', () => {
    const thread = createCommentThread(ANCHOR, '  这里写得好  ', NOW);
    expect(thread.anchor).toEqual(ANCHOR);
    expect(thread.comments).toHaveLength(1);
    expect(thread.comments[0].body).toBe('这里写得好');
    expect(thread.resolved).toBe(false);
    expect(thread.createdAt).toBe(NOW);
  });

  it('正文为空或锚点缺块 id / 引文时返回 null', () => {
    expect(createCommentThread(ANCHOR, '   ')).toBeNull();
    expect(createCommentThread({ quote: 'x' }, '评论')).toBeNull();
    expect(createCommentThread({ blockId: 'b1', quote: '  ' }, '评论')).toBeNull();
  });
});

describe('线程增删改', () => {
  it('addThread / updateThread / 删除最后一条时移除整个文件键', () => {
    const thread = createCommentThread(ANCHOR, '评论', NOW);
    let map = addThread({}, 'f1', thread);
    expect(map.f1).toHaveLength(1);
    map = updateThread(map, 'f1', thread.id, (t) => ({ ...t, resolved: true }));
    expect(map.f1[0].resolved).toBe(true);
    map = updateThread(map, 'f1', thread.id, () => null);
    expect(map).toEqual({});
  });

  it('appendReply 追加回复，空回复不变', () => {
    const thread = createCommentThread(ANCHOR, '评论', NOW);
    expect(appendReply(thread, '  ')).toBe(thread);
    const next = appendReply(thread, '同意', '2026-10-10T09:00:00.000Z');
    expect(next.comments.map((c) => c.body)).toEqual(['评论', '同意']);
    expect(next.updatedAt).toBe('2026-10-10T09:00:00.000Z');
  });

  it('countOpenThreads 只数未解决的', () => {
    const a = createCommentThread(ANCHOR, 'a', NOW);
    const b = { ...createCommentThread(ANCHOR, 'b', NOW), resolved: true };
    expect(countOpenThreads({ f1: [a, b] }, 'f1')).toBe(1);
    expect(countOpenThreads({}, 'f1')).toBe(0);
  });
});

describe('normalizeCommentThreads', () => {
  it('丢掉脏数据，保留合法线程', () => {
    const good = createCommentThread(ANCHOR, '评论', NOW);
    const result = normalizeCommentThreads({
      f1: [good, { id: 'x', anchor: ANCHOR, comments: [] }, null],
      f2: 'not-array',
      f3: [{ anchor: {}, comments: [{ body: 'hi' }] }],
    });
    expect(result).toEqual({ f1: [good] });
  });

  it('非对象输入返回空对象', () => {
    expect(normalizeCommentThreads(null)).toEqual({});
    expect(normalizeCommentThreads([])).toEqual({});
  });
});

describe('findQuoteOffset', () => {
  it('取离记录偏移最近的一处', () => {
    const text = '玩家玩家玩家';
    expect(findQuoteOffset(text, '玩家', 0)).toBe(0);
    expect(findQuoteOffset(text, '玩家', 4)).toBe(4);
  });

  it('前面插了字，仍能找到引文', () => {
    expect(findQuoteOffset('新增：电影里选择推动故事', '选择推动故事', 3)).toBe(6);
  });

  it('找不到 / 空输入返回 -1', () => {
    expect(findQuoteOffset('原文被改了', '选择推动故事', 0)).toBe(-1);
    expect(findQuoteOffset('', '引文', 0)).toBe(-1);
    expect(findQuoteOffset('正文', '', 0)).toBe(-1);
  });
});
