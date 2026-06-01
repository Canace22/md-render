import { describe, expect, it } from 'vitest';
import {
  collectFiles,
  collectRecentFiles,
  ensureFileTimestamps,
} from '../src/store/workspaceUtils.js';

const ws = {
  id: 'root', type: 'folder', name: '工作区',
  children: [
    { id: 'a', type: 'file', name: 'A.md', content: '', updatedAt: 100 },
    {
      id: 'd', type: 'folder', name: '夹',
      children: [
        { id: 'b', type: 'file', name: 'B.md', content: '', updatedAt: 300 },
        { id: 'c', type: 'file', name: 'C.md', content: '', updatedAt: 200 },
        { id: 'e', type: 'file', name: 'E.md', content: '' }, // 无 updatedAt
      ],
    },
  ],
};

describe('collectFiles', () => {
  it('flattens all files recursively', () => {
    expect(collectFiles(ws).map((f) => f.id).sort()).toEqual(['a', 'b', 'c', 'e']);
  });
});

describe('collectRecentFiles', () => {
  it('sorts by updatedAt desc and excludes files without timestamp', () => {
    expect(collectRecentFiles(ws).map((f) => f.id)).toEqual(['b', 'c', 'a']);
  });

  it('respects the limit', () => {
    expect(collectRecentFiles(ws, 2).map((f) => f.id)).toEqual(['b', 'c']);
  });

  it('returns empty array when no files have updatedAt', () => {
    const bare = { id: 'r', type: 'folder', name: 'r', children: [
      { id: 'x', type: 'file', name: 'x', content: '' },
    ]};
    expect(collectRecentFiles(bare)).toEqual([]);
  });
});

describe('ensureFileTimestamps', () => {
  const tree = {
    id: 'r', type: 'folder', name: 'r', children: [
      { id: 'a', type: 'file', name: 'A', content: '' },
      { id: 'd', type: 'folder', name: '夹', children: [
        { id: 'b', type: 'file', name: 'B', content: '', updatedAt: 999 },
        { id: 'c', type: 'file', name: 'C', content: '' },
      ]},
    ],
  };

  it('fills missing timestamps and keeps existing ones', () => {
    const out = ensureFileTimestamps(tree, 1000000);
    const flat = {};
    const walk = (n) => n.type === 'file' ? (flat[n.id] = n.updatedAt) : n.children.forEach(walk);
    walk(out);
    expect(flat.a).toBeGreaterThan(0);
    expect(flat.c).toBeGreaterThan(0);
    expect(flat.b).toBe(999); // 已有不变
    expect(flat.a).toBeGreaterThan(flat.c); // 先遍历的更新
  });

  it('is idempotent: returns same reference when nothing to fill', () => {
    const filled = ensureFileTimestamps(tree, 1000000);
    expect(ensureFileTimestamps(filled, 2000000)).toBe(filled);
  });
});
