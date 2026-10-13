import { useEffect, useMemo } from 'react';
import { useEditorStore } from '../store/useEditorStore.js';
import { collectLocalProjectRootPaths, findNodeById } from '../store/workspaceUtils.js';
import {
  isTauriLocalProjectMount,
  isLocalProjectSupported,
  registerLocalProjectWatch,
  readLocalProjectDisk,
  readLocalProjectRevision,
  onLocalProjectDiskChanged,
} from '../utils/localProjectBridge.js';
import { detectLocalProjectConflicts, getDiskFileContent } from '../utils/localProjectConflict.js';
import { normalizeMarkdown } from '../utils/markdownUtils.js';
import { recordToolActivity } from '../core/agent/activityLog.js';

const TAURI_PROJECT_SCAN_INTERVAL_MS = 2500;

const findMountedRootByPath = (workspace, projectRootPath) => (
  (workspace?.children ?? []).find((node) => (
    node.localProjectRoot && node.projectRootPath === projectRootPath
  )) ?? null
);

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
  if (
    node.diskContentSnapshot != null
    && normalizeMarkdown(node.diskContentSnapshot) === normalizeMarkdown(diskContent)
  ) {
    return null;
  }
  if (normalizeMarkdown(previousContent) === normalizeMarkdown(diskContent)) return null;
  return { fileId: node.id, fileName: node.name, previousContent, diskContent };
};

const applyDiskSnapshot = ({ changedRoot, result, setLocalProjectConflict }) => {
  if (!changedRoot || !result?.ok) return;
  if (result.complete === false) {
    console.warn('[local-project] 本次扫描不完整，已保留现有项目快照。', {
      projectRootPath: changedRoot,
      skippedCount: result.skippedCount ?? 0,
    });
    return;
  }
  const state = useEditorStore.getState();
  if (state.localProjectConflict) return;

  const mountedRoot = findMountedRootByPath(state.workspace, changedRoot);
  const isTreeMount = Boolean(mountedRoot);
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
    projectRevision: result.revision,
    conflictResolution: 'auto',
  });
  if (notice) useEditorStore.getState().setExternalChangeNotice(notice);
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
  const tauriMountsKey = useMemo(() => JSON.stringify(
    (workspace?.children ?? [])
      .filter((node) => node.localProjectRoot && isTauriLocalProjectMount(node.projectRootPath))
      .map((node) => ({
        projectRootPath: node.projectRootPath,
        projectRevision: node.projectRevision ?? '',
      })),
  ), [workspace]);

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
      const mountedRoot = findMountedRootByPath(state.workspace, changedRoot);
      const isTreeMount = Boolean(mountedRoot);
      const mode = isTreeMount ? 'tree' : 'projects';

      try {
        const result = await readLocalProjectDisk(changedRoot, mode);
        if (!result?.ok) return;

        applyDiskSnapshot({ changedRoot, result, setLocalProjectConflict });
      } catch (error) {
        console.error('刷新本地项目失败:', error);
      }
    });

    return unsubscribe;
  }, [setLocalProjectConflict]);

  useEffect(() => {
    const mounts = JSON.parse(tauriMountsKey);
    if (mounts.length === 0) return undefined;

    let cancelled = false;
    let scanRunning = false;
    const scan = async () => {
      if (cancelled || scanRunning) return;
      scanRunning = true;
      try {
        for (const mount of mounts) {
          if (cancelled) return;
          const revisionResult = await readLocalProjectRevision(mount.projectRootPath);
          if (cancelled) return;
          if (!revisionResult?.revision || revisionResult.revision === mount.projectRevision) continue;
          const result = await readLocalProjectDisk(mount.projectRootPath, 'tree');
          if (cancelled) return;
          if (!result?.ok) continue;
          applyDiskSnapshot({
            changedRoot: mount.projectRootPath,
            result,
            setLocalProjectConflict,
          });
        }
      } catch (error) {
        if (!cancelled) console.error('轮询 Tauri 本地项目失败:', error);
      } finally {
        scanRunning = false;
      }
    };

    const timerId = window.setInterval(scan, TAURI_PROJECT_SCAN_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timerId);
    };
  }, [setLocalProjectConflict, tauriMountsKey]);
}
