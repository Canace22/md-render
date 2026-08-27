import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCommands, filterCommands } from '../renderer/src/core/commands/commandRegistry.js';
import {
  getCommandUsage,
  recordCommandUse,
  sortByUsage,
  COMMAND_USAGE_STORAGE_KEY,
} from '../renderer/src/utils/commandUsage.js';
import { VALID_SURFACES } from '../renderer/src/store/useEditorStore.js';

describe('command registry', () => {
  it('命令 id 唯一，且声明的 surface 都是合法值', () => {
    const commands = createCommands({});
    const ids = commands.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);

    commands.filter((c) => c.surface).forEach((c) => {
      expect(VALID_SURFACES.has(c.surface)).toBe(true);
    });
  });

  it('除 folder 外每个 surface 都有对应命令（folder 由文档命令按选中项解析）', () => {
    const covered = new Set(createCommands({}).map((c) => c.surface).filter(Boolean));
    covered.add('folder');
    expect(covered).toEqual(VALID_SURFACES);
  });

  it('中文与拼音关键词都能命中', () => {
    const commands = createCommands({});
    expect(filterCommands(commands, '画布').map((c) => c.id)).toContain('surface.canvas');
    expect(filterCommands(commands, '公众号').map((c) => c.id)).toContain('doc.copy-wechat');
    expect(filterCommands(commands, 'huabu').map((c) => c.id)).toContain('surface.canvas');
    // 空查询返回全部
    expect(filterCommands(commands, '  ')).toHaveLength(commands.length);
  });

  it('导入命令已收进面板，可被中文与英文关键词命中并调用 ctx', () => {
    const importMarkdown = vi.fn();
    const commands = createCommands({ importMarkdown });
    expect(filterCommands(commands, '导入').map((c) => c.id)).toContain('doc.import-markdown');
    expect(filterCommands(commands, 'docx').map((c) => c.id)).toContain('doc.import-markdown');
    commands.find((c) => c.id === 'doc.import-markdown').run();
    expect(importMarkdown).toHaveBeenCalledTimes(1);
  });

  it('run 调用注入的 ctx，缺失的 ctx 项不抛错', () => {
    const openSurface = vi.fn();
    const exportAs = vi.fn();
    const commands = createCommands({ openSurface, exportAs });

    commands.find((c) => c.id === 'surface.graph').run();
    expect(openSurface).toHaveBeenCalledWith('graph');

    commands.find((c) => c.id === 'doc.export.pdf').run();
    expect(exportAs).toHaveBeenCalledWith('pdf');

    // ctx 没给 toggleTheme，执行时应静默跳过而不是崩
    expect(() => commands.find((c) => c.id === 'app.toggle-theme').run()).not.toThrow();
  });
});

// 单测环境是 node（vitest.config.js: environment: 'node'），没有 window。
// commandUsage 内部已按 typeof window 做了守卫，这里补一个最小 localStorage 桩来跑真实路径。
const installLocalStorageStub = () => {
  const store = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
  };
  return globalThis.window.localStorage;
};

describe('command usage', () => {
  beforeEach(() => {
    installLocalStorageStub();
  });

  afterEach(() => {
    delete globalThis.window;
  });

  it('累加计数，并按次数倒序、同次数保持注册顺序', () => {
    recordCommandUse('b');
    recordCommandUse('b');
    recordCommandUse('c');
    expect(getCommandUsage()).toEqual({ b: 2, c: 1 });

    const commands = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
    expect(sortByUsage(commands).map((c) => c.id)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('数据损坏时降级为空对象', () => {
    const storage = installLocalStorageStub();
    storage.setItem(COMMAND_USAGE_STORAGE_KEY, 'not-json');
    expect(getCommandUsage()).toEqual({});
  });

  it('写入抛异常时不崩，仍返回累加后的结果', () => {
    const storage = installLocalStorageStub();
    storage.setItem = () => { throw new Error('QuotaExceeded'); };
    expect(() => recordCommandUse('x')).not.toThrow();
    expect(recordCommandUse('x')).toEqual({ x: 1 });
  });

  it('没有 window 时读写都降级，不抛错', () => {
    delete globalThis.window;
    expect(getCommandUsage()).toEqual({});
    expect(() => recordCommandUse('y')).not.toThrow();
  });
});
