import { describe, expect, it } from 'vitest';
import {
  collectVisibleFolderIds,
  normalizeExpandedFolderIds,
} from '../renderer/src/store/workspaceUtils.js';

const folder = (id, name, children = []) => ({
  id,
  type: 'folder',
  name,
  children,
});

const file = (id, name) => ({ id, type: 'file', name });

describe('normalizeExpandedFolderIds', () => {
  it('returns empty array for non-array input', () => {
    expect(normalizeExpandedFolderIds(null)).toEqual([]);
    expect(normalizeExpandedFolderIds(undefined)).toEqual([]);
    expect(normalizeExpandedFolderIds('folder-a')).toEqual([]);
  });

  it('drops empty, blank and duplicate ids', () => {
    expect(normalizeExpandedFolderIds(['a', '', '  ', 'a', 'b', null])).toEqual(['a', 'b']);
  });
});

describe('collectVisibleFolderIds', () => {
  it('skips workspace root and files', () => {
    const workspace = folder('root', '工作区', [
      file('file-1', 'a.md'),
      folder('folder-a', '草稿', [file('file-2', 'b.md')]),
    ]);
    expect(collectVisibleFolderIds(workspace)).toEqual(['folder-a']);
  });

  it('walks nested folders in document order', () => {
    const workspace = folder('root', '工作区', [
      folder('folder-a', 'A', [
        folder('folder-b', 'B', [file('file-1', 'c.md')]),
      ]),
      folder('folder-c', 'C'),
    ]);
    expect(collectVisibleFolderIds(workspace)).toEqual(['folder-a', 'folder-b', 'folder-c']);
  });

  it('skips hidden folders and their children', () => {
    const workspace = folder('root', '工作区', [
      folder('folder-a', '可见', []),
      folder('folder-hidden', '.agent', [folder('folder-inside', '内部', [])]),
    ]);
    expect(collectVisibleFolderIds(workspace)).toEqual(['folder-a']);
  });

  it('returns empty for null or empty tree', () => {
    expect(collectVisibleFolderIds(null)).toEqual([]);
    expect(collectVisibleFolderIds(folder('root', '工作区', []))).toEqual([]);
  });
});
