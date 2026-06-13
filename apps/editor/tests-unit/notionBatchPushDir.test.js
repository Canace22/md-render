import { describe, it, expect, beforeEach, vi } from 'vitest';

// 记录每次创建/更新页面时传入的属性，供断言「目录」是否写对
const createdProps = [];
const updatedProps = [];

vi.mock('../renderer/src/utils/notionConverter.js', () => ({
  // 标题取 frontmatter title（简化：内容里出现 "title:xxx" 就用它），否则空
  markdownToNotionPayload: vi.fn((content = '') => {
    const m = String(content).match(/title:(\S+)/);
    return { blocks: [], properties: {}, title: m ? m[1] : '' };
  }),
}));

vi.mock('../renderer/src/utils/notionService.js', () => {
  let counter = 0;
  return {
    cleanPageId: (input) => String(input ?? '').replace(/-/g, ''),
    fetchDatabaseSchema: vi.fn(async () => ({
      titlePropName: 'Name',
      // 默认库里没有「目录」属性
      propertyTypes: { Name: 'title' },
    })),
    ensureDatabaseSelectProperty: vi.fn(async () => true),
    // 用真实等价逻辑：只放行类型匹配的属性
    filterPropertiesToSchema: (properties = {}, propertyTypes = {}) => {
      const out = {};
      for (const [name, value] of Object.entries(properties)) {
        const wantType = Object.keys(value)[0];
        if (propertyTypes[name] === wantType) out[name] = value;
      }
      return out;
    },
    createDatabasePage: vi.fn(async (_dbId, _title, _blocks, _token, _titleProp, props) => {
      createdProps.push(props);
      return { id: `page-${++counter}` };
    }),
    updatePageBlocks: vi.fn(async (_pageId, _blocks, _token, opts) => {
      updatedProps.push(opts?.properties);
    }),
    // 满足 import，不在本测试用到
    queryDatabase: vi.fn(),
    fetchBlocks: vi.fn(),
    createChildPage: vi.fn(),
    extractPageTitle: vi.fn(),
  };
});

import { batchPush, DIR_PROPERTY_NAME } from '../renderer/src/utils/notionBatchSync.js';
import {
  ensureDatabaseSelectProperty,
  createDatabasePage,
  fetchDatabaseSchema,
} from '../renderer/src/utils/notionService.js';

const file = (id, name, content = '正文') => ({ id, type: 'file', name, content });
const folder = (id, name, children, extra = {}) => ({ id, type: 'folder', name, children, ...extra });

beforeEach(() => {
  createdProps.length = 0;
  updatedProps.length = 0;
  ensureDatabaseSelectProperty.mockClear();
  createDatabasePage.mockClear();
  fetchDatabaseSchema.mockClear();
  fetchDatabaseSchema.mockResolvedValue({ titlePropName: 'Name', propertyTypes: { Name: 'title' } });
});

describe('batchPush - 目录 Select 属性', () => {
  // Case 1: 推送前确保「目录」属性存在
  it('应调用 ensureDatabaseSelectProperty 建「目录」属性', async () => {
    const root = folder('root', '同步', [folder('vol', '第一卷', [file('f1', 'a.md')])], { notionSyncRoot: true });
    await batchPush('db-id', root, {}, 'token');
    expect(ensureDatabaseSelectProperty).toHaveBeenCalledTimes(1);
    expect(ensureDatabaseSelectProperty.mock.calls[0][1]).toBe(DIR_PROPERTY_NAME);
  });

  // Case 2: 文件的父文件夹名写入「目录」Select
  it('父文件夹名应写进「目录」属性', async () => {
    const root = folder('root', '同步', [folder('vol', '第一卷', [file('f1', 'a.md')])], { notionSyncRoot: true });
    await batchPush('db-id', root, {}, 'token');
    expect(createdProps[0]?.[DIR_PROPERTY_NAME]).toEqual({ select: { name: '第一卷' } });
  });

  // Case 3: 顶层文件（无父目录）不写「目录」属性
  it('同步根下的顶层文件不写「目录」', async () => {
    const root = folder('root', '同步', [file('f1', 'top.md')], { notionSyncRoot: true });
    await batchPush('db-id', root, {}, 'token');
    expect(createdProps[0]?.[DIR_PROPERTY_NAME]).toBeUndefined();
  });

  // Case 4: 多层嵌套取「直接」父文件夹名
  it('多层嵌套取直接父文件夹名', async () => {
    const root = folder('root', '同步', [
      folder('vol', '第一卷', [folder('ch', '章节', [file('f1', 'x.md')])]),
    ], { notionSyncRoot: true });
    await batchPush('db-id', root, {}, 'token');
    expect(createdProps[0]?.[DIR_PROPERTY_NAME]).toEqual({ select: { name: '章节' } });
  });

  // Case 5: 已有同名属性时，按其真实类型决定是否写入（select 才写）
  it('库里已有「目录」select 属性时仍写入', async () => {
    fetchDatabaseSchema.mockResolvedValue({
      titlePropName: 'Name',
      propertyTypes: { Name: 'title', [DIR_PROPERTY_NAME]: 'select' },
    });
    const root = folder('root', '同步', [folder('vol', '第二卷', [file('f1', 'a.md')])], { notionSyncRoot: true });
    await batchPush('db-id', root, {}, 'token');
    expect(createdProps[0]?.[DIR_PROPERTY_NAME]).toEqual({ select: { name: '第二卷' } });
  });

  // Case 6: 库里同名属性不是 select（如 rich_text）时，不写该属性，避免请求被拒
  it('同名属性非 select 时不写入', async () => {
    fetchDatabaseSchema.mockResolvedValue({
      titlePropName: 'Name',
      propertyTypes: { Name: 'title', [DIR_PROPERTY_NAME]: 'rich_text' },
    });
    const root = folder('root', '同步', [folder('vol', '第三卷', [file('f1', 'a.md')])], { notionSyncRoot: true });
    await batchPush('db-id', root, {}, 'token');
    expect(createdProps[0]?.[DIR_PROPERTY_NAME]).toBeUndefined();
  });
});
