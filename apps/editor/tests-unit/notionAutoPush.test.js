import { describe, expect, it, vi } from 'vitest';
import {
  createAutoPushScheduler,
  deriveParentDirFromRelativePath,
} from '../renderer/src/utils/notionAutoPush.js';
import { remapNotionFilePagesAfterPathChange } from '../renderer/src/store/workspaceUtils.js';

describe('deriveParentDirFromRelativePath', () => {
  it('取最近一层父文件夹名', () => {
    expect(deriveParentDirFromRelativePath('Projects/blog/a.md')).toBe('blog');
    expect(deriveParentDirFromRelativePath('a/b/c/d.md')).toBe('c');
  });

  it('顶层文件和空输入返回空字符串', () => {
    expect(deriveParentDirFromRelativePath('a.md')).toBe('');
    expect(deriveParentDirFromRelativePath('')).toBe('');
    expect(deriveParentDirFromRelativePath(null)).toBe('');
  });
});

describe('createAutoPushScheduler', () => {
  it('防抖窗口内同一文件多次保存只推送最后一份内容', async () => {
    vi.useFakeTimers();
    const pushed = [];
    const scheduler = createAutoPushScheduler({
      pushFile: async (s) => { pushed.push(s); },
      debounceMs: 1000,
    });

    scheduler.schedule({ fileId: 'f1', markdown: 'v1' });
    vi.advanceTimersByTime(500);
    scheduler.schedule({ fileId: 'f1', markdown: 'v2' });
    vi.advanceTimersByTime(999);
    expect(pushed).toHaveLength(0);
    vi.advanceTimersByTime(1);
    await vi.runAllTimersAsync();

    expect(pushed).toHaveLength(1);
    expect(pushed[0].markdown).toBe('v2');
    vi.useRealTimers();
  });

  it('不同文件互不影响，cancel 可移除待推送任务', async () => {
    vi.useFakeTimers();
    const pushed = [];
    const scheduler = createAutoPushScheduler({
      pushFile: async (s) => { pushed.push(s.fileId); },
      debounceMs: 1000,
    });

    scheduler.schedule({ fileId: 'a' });
    scheduler.schedule({ fileId: 'b' });
    expect(scheduler.pendingCount()).toBe(2);
    scheduler.cancel('a');
    await vi.runAllTimersAsync();

    expect(pushed).toEqual(['b']);
    vi.useRealTimers();
  });

  it('缺少 fileId 时忽略；dispose 清空全部任务', async () => {
    vi.useFakeTimers();
    const pushed = [];
    const scheduler = createAutoPushScheduler({
      pushFile: async (s) => { pushed.push(s.fileId); },
      debounceMs: 1000,
    });

    scheduler.schedule({});
    expect(scheduler.pendingCount()).toBe(0);
    scheduler.schedule({ fileId: 'x' });
    scheduler.dispose();
    await vi.runAllTimersAsync();

    expect(pushed).toEqual([]);
    vi.useRealTimers();
  });
});

describe('remapNotionFilePagesAfterPathChange', () => {
  const ROOT = '/Users/test/Documents/MdRender';
  const key = (rel) => `project:${ROOT}:file:${rel}`;

  it('文件移动后映射 key 跟着迁移', () => {
    const pages = { [key('Projects/blog/a.md')]: 'page-1', 'file-mem': 'page-2' };
    const next = remapNotionFilePagesAfterPathChange(
      pages, ROOT, 'Projects/blog/a.md', 'Projects/notes/a.md',
    );
    expect(next[key('Projects/notes/a.md')]).toBe('page-1');
    expect(next[key('Projects/blog/a.md')]).toBeUndefined();
    expect(next['file-mem']).toBe('page-2');
  });

  it('文件夹移动后子路径映射批量迁移', () => {
    const pages = {
      [key('Projects/blog/drafts/b.md')]: 'page-b',
      [key('Projects/blog/other.md')]: 'page-o',
    };
    const next = remapNotionFilePagesAfterPathChange(
      pages, ROOT, 'Projects/blog/drafts', 'Projects/notes/drafts',
    );
    expect(next[key('Projects/notes/drafts/b.md')]).toBe('page-b');
    expect(next[key('Projects/blog/other.md')]).toBe('page-o');
  });

  it('无关路径不变时返回原对象引用', () => {
    const pages = { [key('Projects/x.md')]: 'page-x' };
    const next = remapNotionFilePagesAfterPathChange(pages, ROOT, 'Projects/y.md', 'Projects/z.md');
    expect(next).toBe(pages);
  });
});
