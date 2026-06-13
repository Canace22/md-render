import { describe, it, expect, vi } from 'vitest';
import {
  parseIndex,
  serializeIndex,
  diffPages,
  incrementalPull,
} from '../renderer/src/utils/notionIncrementalSync.js';

// ── parseIndex / serializeIndex ──────────────────────────────────────────────

describe('parseIndex', () => {
  // Case 1: 空内容 → 空映射（首次拉取）
  it('空内容返回空映射', () => {
    expect(parseIndex(null)).toEqual({});
    expect(parseIndex('')).toEqual({});
  });

  // Case 2: 损坏 JSON → 空映射，不抛
  it('损坏 JSON 返回空映射', () => {
    expect(parseIndex('{ not json')).toEqual({});
  });

  // Case 3: 正常解析 pages
  it('正常解析 pages 字段', () => {
    const raw = JSON.stringify({ version: 1, pages: { p1: { relativePath: 'a.md', lastEditedTime: 't1' } } });
    expect(parseIndex(raw)).toEqual({ p1: { relativePath: 'a.md', lastEditedTime: 't1' } });
  });

  // Case 4: 序列化往返一致
  it('serializeIndex → parseIndex 往返一致', () => {
    const pages = { p1: { relativePath: 'x.md', lastEditedTime: 't' } };
    expect(parseIndex(serializeIndex(pages))).toEqual(pages);
  });
});

// ── diffPages ────────────────────────────────────────────────────────────────

describe('diffPages', () => {
  // Case 5: 全新页面 → create
  it('索引中没有的页面标记 create', () => {
    const { plans, deletedPageIds } = diffPages(
      [{ id: 'p1', title: 'A', lastEditedTime: 't1' }],
      {},
    );
    expect(plans).toEqual([{ pageId: 'p1', title: 'A', action: 'create' }]);
    expect(deletedPageIds).toEqual([]);
  });

  // Case 6: 时间未变 → skip
  it('last_edited_time 未变标记 skip', () => {
    const index = { p1: { relativePath: 'A.md', lastEditedTime: 't1' } };
    const { plans } = diffPages([{ id: 'p1', title: 'A', lastEditedTime: 't1' }], index);
    expect(plans[0]).toMatchObject({ action: 'skip', relativePath: 'A.md' });
  });

  // Case 7: 时间变了 → update，复用旧路径
  it('last_edited_time 变了标记 update 并复用旧路径', () => {
    const index = { p1: { relativePath: 'A.md', lastEditedTime: 't1' } };
    const { plans } = diffPages([{ id: 'p1', title: 'A 改名', lastEditedTime: 't2' }], index);
    expect(plans[0]).toMatchObject({ action: 'update', relativePath: 'A.md', title: 'A 改名' });
  });

  // Case 8: 远端缺失 → deletedPageIds
  it('索引有但远端没有的页面进入 deletedPageIds', () => {
    const index = {
      p1: { relativePath: 'A.md', lastEditedTime: 't1' },
      p2: { relativePath: 'B.md', lastEditedTime: 't1' },
    };
    const { plans, deletedPageIds } = diffPages([{ id: 'p1', title: 'A', lastEditedTime: 't1' }], index);
    expect(plans).toHaveLength(1);
    expect(deletedPageIds).toEqual(['p2']);
  });
});

// ── incrementalPull 集成（用内存 IO + 假 Notion） ─────────────────────────────

function makeMemoryIO(initialFiles = {}) {
  const files = { ...initialFiles };
  return {
    files,
    ensureDir: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn(async (rel) => (rel in files ? files[rel] : null)),
    writeFile: vi.fn(async (rel, content) => { files[rel] = content; }),
  };
}

function makeNotion(pages, mdByPage) {
  return {
    queryPages: vi.fn().mockResolvedValue(pages),
    extractTitle: (page) => page._title,
    fetchPageMarkdown: vi.fn(async (id) => mdByPage[id]),
  };
}

describe('incrementalPull', () => {
  const dbDirRelative = 'Projects/notion-sync/db1';
  const indexPath = `${dbDirRelative}/.notion-sync.json`;

  // Case 9: 首次拉取 → 全部 create，落盘 + 写索引
  it('首次拉取全部新建并写索引', async () => {
    const io = makeMemoryIO();
    const notion = makeNotion(
      [
        { id: 'p1', _title: '文章一', last_edited_time: 't1' },
        { id: 'p2', _title: '文章二', last_edited_time: 't1' },
      ],
      { p1: '# 一', p2: '# 二' },
    );

    const res = await incrementalPull({ databaseId: 'db1', dbDirRelative, io, notion });

    expect(res.created).toBe(2);
    expect(res.updated).toBe(0);
    expect(res.skipped).toBe(0);
    expect(io.files[`${dbDirRelative}/文章一.md`]).toBe('# 一');
    expect(io.files[`${dbDirRelative}/文章二.md`]).toBe('# 二');
    const index = parseIndex(io.files[indexPath]);
    expect(index.p1).toMatchObject({ relativePath: `${dbDirRelative}/文章一.md`, lastEditedTime: 't1' });
  });

  // Case 10: 二次拉取 → 一个变、一个不变 → 只 fetch 变的那个
  it('二次拉取只更新变化页，未变页跳过且不发 blocks 请求', async () => {
    const existingIndex = serializeIndex({
      p1: { relativePath: `${dbDirRelative}/文章一.md`, lastEditedTime: 't1' },
      p2: { relativePath: `${dbDirRelative}/文章二.md`, lastEditedTime: 't1' },
    });
    const io = makeMemoryIO({
      [indexPath]: existingIndex,
      [`${dbDirRelative}/文章一.md`]: '# 一',
      [`${dbDirRelative}/文章二.md`]: '# 二',
    });
    const notion = makeNotion(
      [
        { id: 'p1', _title: '文章一', last_edited_time: 't1' },      // 未变
        { id: 'p2', _title: '文章二', last_edited_time: 't2' },      // 变了
      ],
      { p2: '# 二（已更新）' },
    );

    const res = await incrementalPull({ databaseId: 'db1', dbDirRelative, io, notion });

    expect(res.skipped).toBe(1);
    expect(res.updated).toBe(1);
    expect(res.created).toBe(0);
    // 只对 p2 发了 blocks 请求
    expect(notion.fetchPageMarkdown).toHaveBeenCalledTimes(1);
    expect(notion.fetchPageMarkdown).toHaveBeenCalledWith('p2');
    expect(io.files[`${dbDirRelative}/文章二.md`]).toBe('# 二（已更新）');
  });

  // Case 11: 远端删除 → deleted 计数，本地文件保留，索引打标
  it('远端删除的页面本地保留并在索引打 deletedRemote 标', async () => {
    const existingIndex = serializeIndex({
      p1: { relativePath: `${dbDirRelative}/文章一.md`, lastEditedTime: 't1' },
      p2: { relativePath: `${dbDirRelative}/文章二.md`, lastEditedTime: 't1' },
    });
    const io = makeMemoryIO({
      [indexPath]: existingIndex,
      [`${dbDirRelative}/文章一.md`]: '# 一',
      [`${dbDirRelative}/文章二.md`]: '# 二',
    });
    const notion = makeNotion(
      [{ id: 'p1', _title: '文章一', last_edited_time: 't1' }], // p2 远端没了
      {},
    );

    const res = await incrementalPull({ databaseId: 'db1', dbDirRelative, io, notion });

    expect(res.deleted).toBe(1);
    expect(io.files[`${dbDirRelative}/文章二.md`]).toBe('# 二'); // 本地保留
    const index = parseIndex(io.files[indexPath]);
    expect(index.p2.deletedRemote).toBe(true);
  });

  // Case 12: 单页 fetch 失败 → 记入 failed，不中断其余
  it('单页拉取失败记入 failed 不阻断其余', async () => {
    const io = makeMemoryIO();
    const notion = {
      queryPages: vi.fn().mockResolvedValue([
        { id: 'p1', _title: '好页', last_edited_time: 't1' },
        { id: 'p2', _title: '坏页', last_edited_time: 't1' },
      ]),
      extractTitle: (page) => page._title,
      fetchPageMarkdown: vi.fn(async (id) => {
        if (id === 'p2') throw new Error('boom');
        return '# 好';
      }),
    };

    const res = await incrementalPull({ databaseId: 'db1', dbDirRelative, io, notion });

    expect(res.created).toBe(1);
    expect(res.failed).toEqual([{ title: '坏页', error: 'boom' }]);
    expect(io.files[`${dbDirRelative}/好页.md`]).toBe('# 好');
  });
});
