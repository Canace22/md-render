import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from '../renderer/src/store/useEditorStore.js';
import { findNodeById } from '../renderer/src/store/workspaceUtils.js';

// 回归：本地项目文件监听（auto）回灌时，绝不能重建“当前正在编辑文件”的编辑器。
// 否则自己保存触发的 watcher echo 会 bump editorReloadToken → BlockNote 整体重建 → 丢焦点。
const ROOT = '/proj';

// 原始磁盘树（未标记），交给 store 自行 markLocalProjectNode 派生稳定 id。
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

describe('文件监听回灌保护当前编辑文件', () => {
  beforeEach(() => {
    useEditorStore.getState().openLocalProjectWorkspace(rawDiskTree('磁盘原文'), ROOT);
  });

  it('auto 刷新不 bump editorReloadToken，且保留本地内容（模拟自写 echo 竞态）', () => {
    const store = useEditorStore.getState();
    const selectedId = store.selectedId;

    // 用户编辑后已保存完成：pending 标志已清除（这正是 echo 到达时的竞态窗口）。
    store.updateSelectedFileContent('本地编辑内容');
    expect(useEditorStore.getState().diskSavePendingFileIds[selectedId]).toBeFalsy();

    const tokenBefore = useEditorStore.getState().editorReloadToken;

    // 监听回灌：磁盘上是我们刚写回的内容（这里用不同串代表任意回灌）。
    useEditorStore.getState().refreshDiskBackedProject({
      projectRootPath: ROOT,
      workspace: rawDiskTree('磁盘变更'),
      conflictResolution: 'auto',
    });

    const after = useEditorStore.getState();
    expect(after.editorReloadToken).toBe(tokenBefore); // 编辑器未被重建
    const node = findNodeById(after.workspace, selectedId);
    expect(node.content).toBe('本地编辑内容'); // 本地内容保留，未被磁盘冲掉
  });

  it('手动 use-disk 同步仍然采用磁盘内容并重建编辑器', () => {
    const store = useEditorStore.getState();
    const selectedId = store.selectedId;
    store.updateSelectedFileContent('本地编辑内容');
    const tokenBefore = useEditorStore.getState().editorReloadToken;

    useEditorStore.getState().refreshDiskBackedProject({
      projectRootPath: ROOT,
      workspace: rawDiskTree('磁盘最新'),
      conflictResolution: 'use-disk',
      conflictFileIds: [selectedId],
    });

    const after = useEditorStore.getState();
    expect(after.editorReloadToken).toBe(tokenBefore + 1); // 明确要求用磁盘 → 重建
    expect(findNodeById(after.workspace, selectedId).content).toBe('磁盘最新');
  });
});
