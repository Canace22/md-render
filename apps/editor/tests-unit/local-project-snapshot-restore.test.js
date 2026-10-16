import { describe, expect, it } from 'vitest';
import { restoreImportedLocalProjectSnapshots } from '../renderer/src/store/useEditorStore.js';

const makeWorkspace = (children) => ({
  id: 'root',
  name: '工作区',
  type: 'folder',
  children,
});

const makeSnapshot = () => ({
  id: 'project:legacy:folder:Projects/原稿',
  name: '原稿',
  type: 'folder',
  localProjectRoot: true,
  projectRootPath: '/Users/test/Documents/MdRender:folder:Projects/原稿',
  projectMountId: 'tauri-project:expired',
  projectIdentity: 'legacy',
  projectRevision: 'revision-1',
  relativePath: '',
  readOnly: true,
  access: 'reauthorization-required',
  children: [{
    id: 'project:legacy:file:Projects/原稿/示例.md',
    name: '示例.md',
    type: 'file',
    content: '# 原文',
    relatedIds: ['file-2'],
    projectRootPath: '/Users/test/Documents/MdRender:folder:Projects/原稿',
    projectMountId: 'tauri-project:expired',
    relativePath: 'Projects/原稿/示例.md',
    diskContentSnapshot: '# 原文',
    readOnly: true,
    access: 'reauthorization-required',
  }],
});

describe('restoreImportedLocalProjectSnapshots', () => {
  it('非 Tauri 环境原样保留工作区', () => {
    const workspace = makeWorkspace([makeSnapshot()]);
    expect(restoreImportedLocalProjectSnapshots(workspace, { runtimeKind: 'electron' }))
      .toBe(workspace);
  });

  it('普通内置节点不受影响', () => {
    const normalFolder = { id: 'folder-1', name: '笔记', type: 'folder', children: [] };
    const result = restoreImportedLocalProjectSnapshots(
      makeWorkspace([normalFolder]),
      { runtimeKind: 'tauri', activeMounts: new Map() },
    );
    expect(result.children[0]).toBe(normalFolder);
  });

  it('失效挂载递归变为可编辑副本', () => {
    const result = restoreImportedLocalProjectSnapshots(
      makeWorkspace([makeSnapshot()]),
      { runtimeKind: 'tauri', activeMounts: new Map() },
    );
    const [folder] = result.children;
    const [file] = folder.children;

    expect(folder).not.toHaveProperty('projectRootPath');
    expect(folder).not.toHaveProperty('readOnly');
    expect(file).not.toHaveProperty('projectMountId');
    expect(file).not.toHaveProperty('diskContentSnapshot');
  });

  it('恢复编辑时保留 ID、内容和关联', () => {
    const snapshot = makeSnapshot();
    const result = restoreImportedLocalProjectSnapshots(
      makeWorkspace([snapshot]),
      { runtimeKind: 'tauri', activeMounts: new Map() },
    );
    const file = result.children[0].children[0];

    expect(result.children[0].id).toBe(snapshot.id);
    expect(file.id).toBe(snapshot.children[0].id);
    expect(file.content).toBe('# 原文');
    expect(file.relatedIds).toEqual(['file-2']);
  });

  it('当前会话仍有效的挂载继续保持磁盘属性', () => {
    const snapshot = makeSnapshot();
    const result = restoreImportedLocalProjectSnapshots(
      makeWorkspace([snapshot]),
      {
        runtimeKind: 'tauri',
        activeMounts: new Map([['tauri-project:expired', snapshot]]),
      },
    );

    expect(result.children[0]).toBe(snapshot);
    expect(result.children[0].projectRootPath).toBeTruthy();
    expect(result.children[0].readOnly).toBe(true);
  });
});
