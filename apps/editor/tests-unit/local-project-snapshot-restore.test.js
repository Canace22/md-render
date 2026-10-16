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
  localProjectSource: 'tauri-directory',
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

  it('失效挂载恢复为可编辑副本，同时保留重新授权入口', () => {
    const result = restoreImportedLocalProjectSnapshots(
      makeWorkspace([makeSnapshot()]),
      { runtimeKind: 'tauri', activeMounts: new Map() },
    );
    const [folder] = result.children;
    const [file] = folder.children;

    expect(folder.projectRootPath).toBe('legacy');
    expect(folder.localProjectSource).toBe('tauri-directory');
    expect(folder.access).toBe('reauthorization-required');
    expect(folder).not.toHaveProperty('readOnly');
    expect(file.access).toBe('reauthorization-required');
    expect(file.relativePath).toBe('Projects/原稿/示例.md');
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

  it('Electron 数据库目录保持为数据库节点，不要变成本地挂载', () => {
    const legacyRoot = '/Users/test/Documents/MdRender';
    const strippedSnapshot = {
      id: `project:${legacyRoot}:folder:Projects/笔记`,
      name: '笔记',
      type: 'folder',
      children: [{
        id: `project:${legacyRoot}:file:Projects/笔记/示例.md`,
        name: '示例.md',
        type: 'file',
        content: '![x](../../assets/x.png)',
      }],
    };
    const result = restoreImportedLocalProjectSnapshots(
      makeWorkspace([strippedSnapshot]),
      {
        runtimeKind: 'tauri',
        activeMounts: new Map(),
        legacyProjectRootPath: legacyRoot,
      },
    );
    const [folder] = result.children;
    const [file] = folder.children;

    expect(folder.relativePath).toBe('Projects/笔记');
    expect(file.relativePath).toBe('Projects/笔记/示例.md');
    expect(folder).not.toHaveProperty('projectRootPath');
    expect(folder).not.toHaveProperty('localProjectRoot');
    expect(folder).not.toHaveProperty('access');
    expect(file).not.toHaveProperty('projectRootPath');
    expect(file).not.toHaveProperty('access');
    expect(file).not.toHaveProperty('readOnly');
  });

  it('修复已被误转成不透明本地挂载的数据库节点', () => {
    const identity = 'local-project:v1:legacy-migration';
    const mistakenSnapshot = {
      id: `project:${identity}`,
      name: '工作管理',
      type: 'folder',
      localProjectRoot: true,
      projectRootPath: identity,
      access: 'reauthorization-required',
      readOnly: true,
      children: [],
    };
    const result = restoreImportedLocalProjectSnapshots(
      makeWorkspace([mistakenSnapshot]),
      { runtimeKind: 'tauri', activeMounts: new Map() },
    );
    const [folder] = result.children;

    expect(folder.id).toBe(mistakenSnapshot.id);
    expect(folder).not.toHaveProperty('projectRootPath');
    expect(folder).not.toHaveProperty('localProjectRoot');
    expect(folder).not.toHaveProperty('access');
    expect(folder).not.toHaveProperty('readOnly');
  });

  it('Electron 数据库中的旧本地根也回到数据库语义', () => {
    const localRoot = {
      id: 'project:/Users/test/Documents/MdRender/Clippings',
      name: 'Clippings',
      type: 'folder',
      localProjectRoot: true,
      projectRootPath: '/Users/test/Documents/MdRender/Clippings',
      children: [],
    };
    const result = restoreImportedLocalProjectSnapshots(
      makeWorkspace([localRoot]),
      { runtimeKind: 'tauri', activeMounts: new Map() },
    );
    const [folder] = result.children;

    expect(folder.id).toBe(localRoot.id);
    expect(folder).not.toHaveProperty('localProjectRoot');
    expect(folder).not.toHaveProperty('projectRootPath');
    expect(folder).not.toHaveProperty('access');
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
