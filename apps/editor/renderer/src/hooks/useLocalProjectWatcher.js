import { useEffect } from 'react';
import { useEditorStore } from '../store/useEditorStore.js';
import { collectLocalProjectRootPaths, findLocalProjectRoot } from '../store/workspaceUtils.js';
import {
  isLocalProjectSupported,
  registerLocalProjectWatch,
  readLocalProjectDisk,
  onLocalProjectDiskChanged,
} from '../utils/localProjectBridge.js';
import { detectLocalProjectConflicts } from '../utils/localProjectConflict.js';

export function useLocalProjectWatcher() {
  const workspace = useEditorStore((state) => state.workspace);
  const projectRootPath = useEditorStore((state) => state.projectRootPath);
  const setLocalProjectConflict = useEditorStore((state) => state.setLocalProjectConflict);

  useEffect(() => {
    if (!isLocalProjectSupported()) return undefined;

    const rootPaths = collectLocalProjectRootPaths(workspace, projectRootPath);
    rootPaths.forEach((rootPath) => {
      registerLocalProjectWatch(rootPath).catch((error) => {
        console.error('注册本地项目监听失败:', error);
      });
    });

    return undefined;
  }, [workspace, projectRootPath]);

  useEffect(() => {
    if (!isLocalProjectSupported()) return undefined;

    const unsubscribe = onLocalProjectDiskChanged(async ({ projectRootPath: changedRoot }) => {
      if (!changedRoot) return;
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

        useEditorStore.getState().refreshDiskBackedProject({
          projectRootPath: changedRoot,
          workspace: result.workspace,
          projectsChildren: result.projectsChildren,
          conflictResolution: 'auto',
        });
      } catch (error) {
        console.error('刷新本地项目失败:', error);
      }
    });

    return unsubscribe;
  }, [setLocalProjectConflict]);
}
