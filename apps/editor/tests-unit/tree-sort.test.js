import { describe, expect, it } from 'vitest';
import {
  sortTreeNodes,
  normalizeTreeSortMode,
  DEFAULT_TREE_SORT_MODE,
  TREE_SORT_UPDATED_ASC,
  TREE_SORT_CREATED_DESC,
  TREE_SORT_NAME_ASC,
  TREE_SORT_NAME_DESC,
} from '../renderer/src/utils/treeSort.js';

const node = (name, extra = {}) => ({ id: name, name, type: 'file', ...extra });
const names = (list) => list.map((n) => n.name);

describe('sortTreeNodes', () => {
  const a = node('a.md', { createdAt: 300, updatedAt: 100 });
  const b = node('b.md', { createdAt: 100, updatedAt: 300 });
  const c = node('c.md', { createdAt: 200, updatedAt: 200 });

  it('默认按修改时间新到旧（保持原行为）', () => {
    expect(names(sortTreeNodes([a, b, c]))).toEqual(['b.md', 'c.md', 'a.md']);
  });

  it('修改时间旧到新 / 创建时间新到旧', () => {
    expect(names(sortTreeNodes([a, b, c], TREE_SORT_UPDATED_ASC))).toEqual(['a.md', 'c.md', 'b.md']);
    expect(names(sortTreeNodes([a, b, c], TREE_SORT_CREATED_DESC))).toEqual(['a.md', 'c.md', 'b.md']);
  });

  it('文件名排序：数字按自然顺序', () => {
    const list = [node('第10章'), node('第2章'), node('第1章')];
    expect(names(sortTreeNodes(list, TREE_SORT_NAME_ASC))).toEqual(['第1章', '第2章', '第10章']);
    expect(names(sortTreeNodes(list, TREE_SORT_NAME_DESC))).toEqual(['第10章', '第2章', '第1章']);
  });

  it('置顶永远在前，不改原数组', () => {
    const pinned = node('z.md', { pinned: true, updatedAt: 1 });
    const input = [a, b, pinned];
    expect(names(sortTreeNodes(input, TREE_SORT_NAME_ASC))).toEqual(['z.md', 'a.md', 'b.md']);
    expect(names(input)).toEqual(['a.md', 'b.md', 'z.md']);
  });

  it('非法排序值回退默认；缺时间戳的节点稳定排在末尾', () => {
    expect(normalizeTreeSortMode('bogus')).toBe(DEFAULT_TREE_SORT_MODE);
    const old1 = node('old1');
    const old2 = node('old2');
    expect(names(sortTreeNodes([old1, a, old2], 'bogus'))).toEqual(['a.md', 'old1', 'old2']);
  });
});
