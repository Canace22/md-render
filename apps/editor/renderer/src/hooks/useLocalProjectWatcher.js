import { useEffect, useMemo } from 'react';
import { useEditorStore } from '../store/useEditorStore.js';
import { collectLocalProjectRootPaths, findLocalProjectRoot, findNodeById } from '../store/workspaceUtils.js';
import {
  isLocalProjectSupported,
  registerLocalProjectWatch,
  readLocalProjectDisk,
  onLocalProjectDiskChanged,
} from '../utils/localProjectBridge.js';
import { detectLocalProjectConflicts, getDiskFileContent } from '../utils/localProjectConflict.js';
import { normalizeMarkdown } from '../utils/markdownUtils.js';
import { recordToolActivity } from '../core/agent/activityLog.js';

/**
 * 正在编辑的文档在 app 外被改了（且本地没有未保存的改动，不算冲突）：
 * 刷新后提示用户，可以对比或恢复成改动前的内容（U6）。
 */
export const buildExternalChangeNotice = (state, diskPayload, projectRootPath, isTreeMount) => {
  const node = findNodeById(state.workspace, state.selectedId);
  if (node?.type !== 'file' || node.projectRootPath !== projectRootPath || !node.relativePath) return null;
  const diskContent = getDiskFileContent(diskPayload, node.relativePath, isTreeMount);
  if (diskContent === undefined) return null;
  const previousContent = state.markdown ?? '';
  if (normalizeMarkdown(previousContent) === normalizeMarkdown(diskContent)) return null;
  return { fileId: node.id, fileName: node.name, previousContent, diskContent };
};

export function useLocalProjectWatcher() {
  const workspace = useEditorStore((state) => state.workspace);
  const projectRootPath = useEditorStore((state) => state.projectRootPath);
  const setLocalProjectConflict = useEditorStore((state) => state.setLocalProjectConflict);
  const watchedRootPathsKey = useMemo(() => {
    return collectLocalProjectRootPaths(workspace, projectRootPath)
      .filter(Boolean)
      .sort()
      .join('\n');
  }, [workspace, projectRootPath]);
  const watchedRootPaths = useMemo(() => {
    return watchedRootPathsKey ? watchedRootPathsKey.split('\n') : [];
  }, [watchedRootPathsKey]);

  useEffect(() => {
    if (!isLocalProjectSupported()) return undefined;

    watchedRootPaths.forEach((rootPath) => {
      registerLocalProjectWatch(rootPath).catch((error) => {
        console.error('注册本地项目监听失败:', error);
      });
    });

    return undefined;
  }, [watchedRootPathsKey]);

  useEffect(() => {
    if (!isLocalProjectSupported()) return undefined;

    const unsubscribe = onLocalProjectDiskChanged(async ({ projectRootPath: changedRoot }) => {
      if (!changedRoot) return;
      // app 自己的写入已被 watcher 忽略，能走到这里的都是 app 外的改动（编辑器、git、外部 agent）
      recordToolActivity({ who: 'external', name: 'disk_change', args: {}, result: '本地项目文件在 app 外被修改' });
      if (useEditorStore.getState().localProjectConflict) return;

      const state = useEditorStore.getState();
      const mountedRoot = findLocalProjectRoot(state.workspace);
      const isTreeMount = mountedRoot?.localProjectRoot
        && mountedRoot.projectRootPath === changedRoot;
      const mode = isTreeMount ? 'tree' : 'projects';

      try {
        const result = await readLocalProjectDisk(changedRoot, mode);
        if (!result?.ok) return;

        const diskPayload = {
          workspace: result.workspace,
          projectsChildren: result.projectsChildren,
        };
        const conflicts = detectLocalProjectConflicts(
          state,
          diskPayload,
          changedRoot,
          isTreeMount,
        );

        if (conflicts.length > 0) {
          setLocalProjectConflict({
            projectRootPath: changedRoot,
            isTreeMount,
            diskPayload,
            conflicts,
          });
          return;
        }

        const notice = buildExternalChangeNotice(state, diskPayload, changedRoot, isTreeMount);
        useEditorStore.getState().refreshDiskBackedProject({
          projectRootPath: changedRoot,
          workspace: result.workspace,
          projectsChildren: result.projectsChildren,
          conflictResolution: 'auto',
        });
        if (notice) useEditorStore.getState().setExternalChangeNotice(notice);
      } catch (error) {
        console.error('刷新本地项目失败:', error);
      }
    });

    return unsubscribe;
  }, [setLocalProjectConflict]);
}
