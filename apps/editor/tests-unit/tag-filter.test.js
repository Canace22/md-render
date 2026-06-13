import { describe, expect, it } from 'vitest';
import { collectTags, filterWorkspaceByTag } from '../renderer/src/store/workspaceUtils.js';

const ws = {
  id: 'root', type: 'folder', name: 'r', children: [
    { id: 'a', type: 'file', name: 'A', content: '', tags: ['工作', '灵感'] },
    { id: 'd', type: 'folder', name: '夹', children: [
      { id: 'b', type: 'file', name: 'B', content: '', tags: ['工作'] },
      { id: 'c', type: 'file', name: 'C', content: '' }, // 无标签
    ]},
  ],
};

const fileNames = (n) => !n ? [] : n.type === 'file' ? [n.name] : (n.children ?? []).flatMap(fileNames);

describe('collectTags', () => {
  it('counts tags and sorts by usage desc', () => {
    expect(collectTags(ws)).toEqual([{ tag: '工作', count: 2 }, { tag: '灵感', count: 1 }]);
  });

  it('returns empty when no tags', () => {
    const bare = { id: 'r', type: 'folder', name: 'r', children: [
      { id: 'x', type: 'file', name: 'x', content: '' },
    ]};
    expect(collectTags(bare)).toEqual([]);
  });
});

describe('filterWorkspaceByTag', () => {
  it('keeps only files with the tag', () => {
    expect(fileNames(filterWorkspaceByTag(ws, '工作')).sort()).toEqual(['A', 'B']);
    expect(fileNames(filterWorkspaceByTag(ws, '灵感'))).toEqual(['A']);
  });

  it('preserves parent folder path', () => {
    const folder = filterWorkspaceByTag(ws, '工作').children.find((c) => c.id === 'd');
    expect(folder.children.map((c) => c.name)).toEqual(['B']);
  });

  it('returns null when no match', () => {
    expect(filterWorkspaceByTag(ws, '不存在')).toBeNull();
  });

  it('returns original tree when tag is falsy', () => {
    expect(filterWorkspaceByTag(ws, null)).toBe(ws);
  });
});
