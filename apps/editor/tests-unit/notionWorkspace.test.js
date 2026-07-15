import { describe, expect, it } from 'vitest';
import { buildLazyNotionTree, NOTION_WORKSPACE_FOLDER_NAME } from '../renderer/src/utils/notionWorkspace.js';

const page = (id, title, dir = '', lastEdited = '2026-07-01T00:00:00.000Z') => ({
  id,
  last_edited_time: lastEdited,
  properties: {
    Name: { type: 'title', title: [{ plain_text: title }] },
    ...(dir ? { 目录: { type: 'select', select: { name: dir } } } : {}),
  },
});

describe('buildLazyNotionTree', () => {
  it('页面变成懒加载文件节点并建立映射', () => {
    const { folder, mappings } = buildLazyNotionTree([page('p1', '文章 A')], 'db1');

    expect(folder.name).toBe(NOTION_WORKSPACE_FOLDER_NAME);
    expect(folder.notionSyncRoot).toBe(true);
    expect(folder.children).toHaveLength(1);
    const file = folder.children[0];
    expect(file.name).toBe('文章 A.md');
    expect(file.notionLazy).toBe(true);
    expect(file.content).toBe('');
    expect(mappings[file.id]).toBe('p1');
  });

  it('按「目录」Select 分组到子文件夹', () => {
    const { folder } = buildLazyNotionTree([
      page('p1', 'A', '博客'),
      page('p2', 'B', '博客'),
      page('p3', 'C'),
    ], 'db1');

    const blogFolder = folder.children.find((c) => c.type === 'folder' && c.name === '博客');
    expect(blogFolder.children).toHaveLength(2);
    expect(folder.children.filter((c) => c.type === 'file')).toHaveLength(1);
  });

  it('同名页面自动去重命名，非法字符被清洗', () => {
    const { folder } = buildLazyNotionTree([
      page('p1', '重复'),
      page('p2', '重复'),
      page('p3', 'a/b:c'),
    ], 'db1');

    const names = folder.children.map((c) => c.name);
    expect(names).toContain('重复.md');
    expect(names).toContain('重复 1.md');
    expect(names).toContain('a-b-c.md');
  });

  it('空列表返回空文件夹', () => {
    const { folder, mappings } = buildLazyNotionTree([], 'db1');
    expect(folder.children).toEqual([]);
    expect(mappings).toEqual({});
  });
});
