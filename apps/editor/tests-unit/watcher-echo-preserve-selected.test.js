import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from '../renderer/src/store/useEditorStore.js';
import { findNodeById } from '../renderer/src/store/workspaceUtils.js';

// 本地项目「读写 + 文件监听回灌」的核心约定：
// - 自写 echo（磁盘 == 上次保存的基线）→ 保留本地、不重建编辑器（否则抢焦点）。
// - 真·外部改动（磁盘 != 基线、无在途保存）→ 重载并采用磁盘内容（外部改动热更新）。
// - 有在途保存（未落盘的编辑）→ 保留本地，避免半写覆盖。
// - 手动 use-disk 同步 → 明确采用磁盘、重建编辑器。
const ROOT = '/proj';

const rawDiskTree = (fileContent) => ({
  id: 'proj-root',
  type: 'folder',
  name: 'proj',
  children: [
    {
      id: 'proj-a',
      type: 'file',
      name: 'a.md',
      relativePath: 'a.md',
      content: fileContent,
      updatedAt: 1,
    },
  ],
});

const refresh = (payload) => useEditorStore.getState().refreshDiskBackedProject({
  projectRootPath: ROOT,
  workspace: rawDiskTree(payload.disk),
  conflictResolution: payload.conflictResolution ?? 'auto',
  conflictFileIds: payload.conflictFileIds ?? [],
});

describe('本地项目读写 / 文件监听回灌', () => {
  beforeEach(() => {
    useEditorStore.getState().openLocalProjectWorkspace(rawDiskTree('磁盘原文'), ROOT);
  });

  it('自写 echo：磁盘 == 保存后的基线 → 不重建编辑器、保留本地内容', () => {
    const selectedId = useEditorStore.getState().selectedId;
    // 模拟一次完整保存：内容落盘为 "已保存正文"，并把基线更新为该正文。
    useEditorStore.getState().updateSelectedFileContent('已保存正文');
    useEditorStore.getState().markLocalFileDiskSaved(selectedId, '已保存正文');
    const tokenBefore = useEditorStore.getState().editorReloadToken;

    // 文件监听回灌：磁盘上正是我们刚写下去的内容（自写 echo）。
    refresh({ disk: '已保存正文' });

    const after = useEditorStore.getState();
    expect(after.editorReloadToken).toBe(tokenBefore); // 编辑器未重建
    expect(findNodeById(after.workspace, selectedId).content).toBe('已保存正文');
  });

  it('真·外部改动：磁盘 != 基线且无在途保存 → 重载并采用磁盘内容', () => {
    const selectedId = useEditorStore.getState().selectedId;
    useEditorStore.getState().updateSelectedFileContent('已保存正文');
    useEditorStore.getState().markLocalFileDiskSaved(selectedId, '已保存正文');
    const tokenBefore = useEditorStore.getState().editorReloadToken;

    // 外部程序改了这个文件：磁盘内容和基线不一致。
    refresh({ disk: '外部改动内容' });

    const after = useEditorStore.getState();
    expect(after.editorReloadToken).toBe(tokenBefore + 1); // 重载编辑器
    expect(after.markdown).toBe('外部改动内容');
    expect(findNodeById(after.workspace, selectedId).content).toBe('外部改动内容');
  });

  it('有在途保存（未落盘编辑）→ 保留本地、不重建，即便磁盘不同', () => {
    const selectedId = useEditorStore.getState().selectedId;
    useEditorStore.getState().updateSelectedFileContent('正在编辑未保存');
    useEditorStore.getState().setDiskSavePending(selectedId, true);
    const tokenBefore = useEditorStore.getState().editorReloadToken;

    refresh({ disk: '磁盘上的旧内容' });

    const after = useEditorStore.getState();
    expect(after.editorReloadToken).toBe(tokenBefore); // 未重建
    expect(findNodeById(after.workspace, selectedId).content).toBe('正在编辑未保存');
  });

  it('手动 use-disk 同步 → 采用磁盘内容并重建编辑器', () => {
    const selectedId = useEditorStore.getState().selectedId;
    useEditorStore.getState().updateSelectedFileContent('本地编辑内容');
    useEditorStore.getState().markLocalFileDiskSaved(selectedId, '本地编辑内容');
    const tokenBefore = useEditorStore.getState().editorReloadToken;

    refresh({ disk: '磁盘最新', conflictResolution: 'use-disk', conflictFileIds: [selectedId] });

    const after = useEditorStore.getState();
    expect(after.editorReloadToken).toBe(tokenBefore + 1);
    expect(findNodeById(after.workspace, selectedId).content).toBe('磁盘最新');
  });
});
