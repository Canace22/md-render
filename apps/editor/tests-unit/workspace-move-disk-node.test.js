import { describe, expect, it } from 'vitest';
import {
  moveDiskNodeToFolder,
  remapDiskPathReferences,
} from '../renderer/src/store/workspaceUtils.js';

const ROOT_PATH = '/Users/test/Documents/MdRender';

const diskFolder = (relativePath, name, children = []) => ({
  id: `project:${ROOT_PATH}:folder:${relativePath}`,
  type: 'folder',
  name,
  relativePath,
  projectRootPath: ROOT_PATH,
  children,
});

const diskFile = (relativePath, name) => ({
  id: `project:${ROOT_PATH}:file:${relativePath}`,
  type: 'file',
  name,
  relativePath,
  projectRootPath: ROOT_PATH,
  content: '',
});

const memoryFile = (id, name) => ({ id, type: 'file', name, content: '' });

const buildWorkspace = () => ({
  id: 'root',
  type: 'folder',
  name: '工作区',
  children: [
    diskFolder('Projects/blog', 'blog', [
      diskFile('Projects/blog/a.md', 'a.md'),
      diskFolder('Projects/blog/drafts', 'drafts', [
        diskFile('Projects/blog/drafts/b.md', 'b.md'),
      ]),
    ]),
    diskFolder('Projects/notes', 'notes', []),
    memoryFile('mem-1', '内存文件.md'),
  ],
});

const findByPath = (node, relativePath) => {
  if (node.relativePath === relativePath) return node;
  for (const child of node.children ?? []) {
    const found = findByPath(child, relativePath);
    if (found) return found;
  }
  return null;
};

describe('moveDiskNodeToFolder', () => {
  it('把磁盘文件移入另一个文件夹并重映射路径和 id', () => {
    const ws = buildWorkspace();
    const next = moveDiskNodeToFolder(
      ws,
      `project:${ROOT_PATH}:file:Projects/blog/a.md`,
      `project:${ROOT_PATH}:folder:Projects/notes`,
      'Projects/notes/a.md',
    );

    expect(next).not.toBe(ws);
    const moved = findByPath(next, 'Projects/notes/a.md');
    expect(moved).toBeTruthy();
    expect(moved.id).toBe(`project:${ROOT_PATH}:file:Projects/notes/a.md`);
    expect(findByPath(next, 'Projects/blog/a.md')).toBeNull();
  });

  it('移动文件夹时整棵子树的路径跟着重映射', () => {
    const ws = buildWorkspace();
    const next = moveDiskNodeToFolder(
      ws,
      `project:${ROOT_PATH}:folder:Projects/blog/drafts`,
      `project:${ROOT_PATH}:folder:Projects/notes`,
      'Projects/notes/drafts',
    );

    const movedChild = findByPath(next, 'Projects/notes/drafts/b.md');
    expect(movedChild).toBeTruthy();
    expect(movedChild.id).toBe(`project:${ROOT_PATH}:file:Projects/notes/drafts/b.md`);
  });

  it('目标在自己子树里时原样返回', () => {
    const ws = buildWorkspace();
    const next = moveDiskNodeToFolder(
      ws,
      `project:${ROOT_PATH}:folder:Projects/blog`,
      `project:${ROOT_PATH}:folder:Projects/blog/drafts`,
      'Projects/blog/drafts/blog',
    );
    expect(next).toBe(ws);
  });

  it('非磁盘节点或目标缺失时原样返回', () => {
    const ws = buildWorkspace();
    expect(moveDiskNodeToFolder(ws, 'mem-1', `project:${ROOT_PATH}:folder:Projects/notes`, 'Projects/notes/内存文件.md')).toBe(ws);
    expect(moveDiskNodeToFolder(ws, `project:${ROOT_PATH}:file:Projects/blog/a.md`, 'missing', 'x.md')).toBe(ws);
  });

  it('已在目标文件夹里时原样返回', () => {
    const ws = buildWorkspace();
    const next = moveDiskNodeToFolder(
      ws,
      `project:${ROOT_PATH}:file:Projects/blog/a.md`,
      `project:${ROOT_PATH}:folder:Projects/blog`,
      'Projects/blog/a.md',
    );
    expect(next).toBe(ws);
  });
});

describe('remapDiskPathReferences', () => {
  it('选中文件和打开的标签页在移动后指向新 id', () => {
    const prev = buildWorkspace();
    const next = moveDiskNodeToFolder(
      prev,
      `project:${ROOT_PATH}:folder:Projects/blog/drafts`,
      `project:${ROOT_PATH}:folder:Projects/notes`,
      'Projects/notes/drafts',
    );

    const oldFileId = `project:${ROOT_PATH}:file:Projects/blog/drafts/b.md`;
    const refs = remapDiskPathReferences({
      previousWorkspace: prev,
      nextWorkspace: next,
      projectRootPath: ROOT_PATH,
      oldRelativePath: 'Projects/blog/drafts',
      newRelativePath: 'Projects/notes/drafts',
      selectedId: oldFileId,
      openTabs: [
        { id: oldFileId, title: 'b.md' },
        { id: 'mem-1', title: '内存文件.md' },
      ],
    });

    const newFileId = `project:${ROOT_PATH}:file:Projects/notes/drafts/b.md`;
    expect(refs.selectedId).toBe(newFileId);
    expect(refs.openTabs[0].id).toBe(newFileId);
    expect(refs.openTabs[1]).toEqual({ id: 'mem-1', title: '内存文件.md' });
  });

  it('与移动无关的选中项保持不变', () => {
    const prev = buildWorkspace();
    const refs = remapDiskPathReferences({
      previousWorkspace: prev,
      nextWorkspace: prev,
      projectRootPath: ROOT_PATH,
      oldRelativePath: 'Projects/blog/a.md',
      newRelativePath: 'Projects/notes/a.md',
      selectedId: 'mem-1',
      openTabs: [],
    });
    expect(refs.selectedId).toBe('mem-1');
    expect(refs.openTabs).toEqual([]);
  });
});
