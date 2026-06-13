import { describe, it, expect, beforeEach, vi } from 'vitest';

// mock 掉真实网络层，只验证调用关系与层级
vi.mock('../renderer/src/utils/notionService.js', () => {
  let counter = 0;
  return {
    cleanPageId: (input) => String(input ?? '').replace(/-/g, ''),
    createChildPage: vi.fn(async (parentPageId, title) => ({
      id: `page-${++counter}`,
      _parent: parentPageId,
      _title: title,
    })),
    updatePageBlocks: vi.fn(async () => {}),
    // 以下导出仅为满足 import，不在层级推送里用到
    queryDatabase: vi.fn(),
    fetchBlocks: vi.fn(),
    createDatabasePage: vi.fn(),
    fetchDatabaseSchema: vi.fn(),
    filterPropertiesToSchema: vi.fn(),
    extractPageTitle: vi.fn(),
  };
});

import { pushTreeToPage } from '../renderer/src/utils/notionBatchSync.js';
import { createChildPage, updatePageBlocks } from '../renderer/src/utils/notionService.js';

const file = (id, name, content = '正文') => ({ id, type: 'file', name, content });
const folder = (id, name, children) => ({ id, type: 'folder', name, children });

beforeEach(() => {
  createChildPage.mockClear();
  updatePageBlocks.mockClear();
});

describe('pushTreeToPage - 保留目录层级推送', () => {
  // Case 1: 单个文件 → 在父页面下建一个子页面
  it('单个文件应在父页面下建子页面', async () => {
    const root = folder('root', '根', [file('f1', 'a.md')]);
    const res = await pushTreeToPage('parent-id', root, {}, 'token');
    expect(res.created).toBe(1);
    expect(createChildPage).toHaveBeenCalledTimes(1);
    expect(createChildPage.mock.calls[0][0]).toBe('parentid'); // 父页面 ID 已清洗
    const created = await createChildPage.mock.results[0].value;
    expect(res.newMappings.f1).toBe(created.id);
  });

  // Case 2: 嵌套文件夹应保留层级（子文件挂在文件夹页下）
  it('嵌套文件夹应保留层级', async () => {
    const root = folder('root', '根', [
      folder('sub', '子文件夹', [file('f1', 'inner.md')]),
    ]);
    await pushTreeToPage('parent-id', root, {}, 'token');
    const calls = createChildPage.mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][1]).toBe('子文件夹'); // 先建文件夹页
    expect(calls[0][0]).toBe('parentid');
    expect(calls[1][1]).toBe('inner'); // 再建文件页（去掉 .md）
    // 文件页挂在文件夹页下：其 parent === 文件夹页返回的 id
    const folderPage = await createChildPage.mock.results[0].value;
    expect(calls[1][0]).toBe(folderPage.id);
  });

  // Case 3: 已有映射的文件走更新，不新建
  it('已有映射的文件应走 updatePageBlocks', async () => {
    const root = folder('root', '根', [file('f1', 'a.md')]);
    const res = await pushTreeToPage('parent-id', root, { f1: 'existing-page' }, 'token');
    expect(updatePageBlocks).toHaveBeenCalledTimes(1);
    expect(updatePageBlocks.mock.calls[0][0]).toBe('existing-page');
    expect(createChildPage).not.toHaveBeenCalled();
    expect(res.updated).toBe(1);
    expect(res.created).toBe(0);
  });

  // Case 4: frontmatter.title 优先作为子页面标题
  it('应优先用 frontmatter.title 作为标题', async () => {
    const md = ['---', 'title: 真标题', '---', '正文'].join('\n');
    const root = folder('root', '根', [file('f1', '文件名.md', md)]);
    await pushTreeToPage('parent-id', root, {}, 'token');
    expect(createChildPage.mock.calls[0][1]).toBe('真标题');
  });

  // Case 5: 空目录应抛错
  it('没有文件时应抛错', async () => {
    const root = folder('root', '空', []);
    await expect(pushTreeToPage('parent-id', root, {}, 'token')).rejects.toThrow('没有可推送的文件');
  });

  // Case 6: 无效父页面 ID 应抛错
  it('无效父页面 ID 应抛错', async () => {
    const root = folder('root', '根', [file('f1', 'a.md')]);
    await expect(pushTreeToPage('', root, {}, 'token')).rejects.toThrow('无效的父页面 ID');
  });

  // Case 7: 单个失败不阻断其余文件
  it('单文件失败应记入 failed 而不中断', async () => {
    createChildPage
      .mockImplementationOnce(async () => { throw new Error('boom'); })
      .mockImplementationOnce(async () => ({ id: 'page-ok' }));
    const root = folder('root', '根', [file('f1', 'bad.md'), file('f2', 'good.md')]);
    const res = await pushTreeToPage('parent-id', root, {}, 'token');
    expect(res.failed).toHaveLength(1);
    expect(res.failed[0].fileId).toBe('f1');
    expect(res.created).toBe(1);
    expect(res.newMappings.f2).toBe('page-ok');
  });
});
