import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  createId,
  createDefaultWorkspace,
  getDefaultMarkdown,
  DEFAULT_FILE_ID,
  findNodeById,
  updateNodeById,
  removeNodeById,
  addChildNode,
  ensureFileTimestamps,
  findFirstFileId,
  nameExists,
  buildUniqueName,
  resolveTargetFolderId,
  resolveLocalProjectCreateTarget,
  buildUniqueNameInFolder,
  createLocalProjectFileNode,
  createLocalProjectFolderNode,
  stripLocalProjectMounts,
  mergeProjectsChildren,
  syncProjectsChildrenFromDisk,
  replaceLocalProjectMount,
  findLocalProjectRoot,
  remapDiskNodeAfterRename,
  findNodeIdByRelativePath,
} from './workspaceUtils.js';
import { TEMPLATES } from '../utils/wechatTemplates.js';
import { normalizeMarkdown } from '../utils/markdownUtils.js';

const STORAGE_KEY = 'md-renderer-workspace';
const SELECTED_ID_STORAGE_KEY = 'md-renderer-selected-id';
const THEME_STORAGE_KEY = 'md-renderer-theme';
const COPY_STYLE_STORAGE_KEY = 'md-renderer-copy-style';
const SURFACE_STORAGE_KEY = 'md-renderer-surface';
const STORAGE_MODE_STORAGE_KEY = 'md-renderer-storage-mode';
const PROJECT_ROOT_STORAGE_KEY = 'md-renderer-project-root';
const NOTION_TOKEN_STORAGE_KEY = 'md-renderer-notion-token';
const NOTION_FILE_PAGES_STORAGE_KEY = 'md-renderer-notion-file-pages';
const NOTION_DATABASE_ID_STORAGE_KEY = 'md-renderer-notion-database-id';

const safeParseJSON = (value, fallback) => {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
};

/** 避免启动时用空 Notion 配置覆盖 localStorage 中已有值 */
let editorPersistHydrated = false;

const readNotionPersistSnapshot = () => {
  try {
    const notionToken = window.localStorage.getItem(NOTION_TOKEN_STORAGE_KEY) ?? '';
    const notionFilePagesRaw = window.localStorage.getItem(NOTION_FILE_PAGES_STORAGE_KEY);
    const notionFilePages = safeParseJSON(notionFilePagesRaw, {});
    const notionDatabaseId = window.localStorage.getItem(NOTION_DATABASE_ID_STORAGE_KEY) ?? '';
    return {
      notionToken: typeof notionToken === 'string' ? notionToken : '',
      notionFilePages:
        notionFilePages && typeof notionFilePages === 'object' ? notionFilePages : {},
      notionDatabaseId: typeof notionDatabaseId === 'string' ? notionDatabaseId : '',
    };
  } catch {
    return { notionToken: '', notionFilePages: {}, notionDatabaseId: '' };
  }
};

const persistNotionStringField = (key, nextValue) => {
  if (nextValue == null) return;
  const next = String(nextValue);
  if (!editorPersistHydrated) {
    const existing = window.localStorage.getItem(key) ?? '';
    if (next === '' && existing !== '') return;
  }
  window.localStorage.setItem(key, next);
};

const persistNotionFilePagesField = (nextPages) => {
  if (nextPages == null) return;
  if (!editorPersistHydrated) {
    const existing = safeParseJSON(
      window.localStorage.getItem(NOTION_FILE_PAGES_STORAGE_KEY),
      {},
    );
    const hasExisting = existing && typeof existing === 'object' && Object.keys(existing).length > 0;
    const hasNext =
      nextPages && typeof nextPages === 'object' && Object.keys(nextPages).length > 0;
    if (!hasNext && hasExisting) return;
  }
  window.localStorage.setItem(NOTION_FILE_PAGES_STORAGE_KEY, JSON.stringify(nextPages));
};

const persistNotionSnapshot = (state) => {
  persistNotionStringField(NOTION_TOKEN_STORAGE_KEY, state.notionToken);
  persistNotionFilePagesField(state.notionFilePages);
  persistNotionStringField(NOTION_DATABASE_ID_STORAGE_KEY, state.notionDatabaseId);
};

/** 兼容现有 localStorage 多 key 的持久化存储 */
const editorStorage = {
  getItem: () => {
    if (typeof window === 'undefined') return null;
    const notionSnapshot = readNotionPersistSnapshot();
    try {
      const workspaceRaw = window.localStorage.getItem(STORAGE_KEY);
      const selectedId = window.localStorage.getItem(SELECTED_ID_STORAGE_KEY);
      const theme = window.localStorage.getItem(THEME_STORAGE_KEY);
      const copyStyle = window.localStorage.getItem(COPY_STYLE_STORAGE_KEY);
      const surface = window.localStorage.getItem(SURFACE_STORAGE_KEY);
      const storageMode = window.localStorage.getItem(STORAGE_MODE_STORAGE_KEY);
      const projectRootPath = window.localStorage.getItem(PROJECT_ROOT_STORAGE_KEY) ?? '';

      const parsedWorkspace = safeParseJSON(workspaceRaw, null);
      // 给老文件补 updatedAt，让「最近」区立即有内容（一次性迁移）
      const ws = ensureFileTimestamps(parsedWorkspace ?? createDefaultWorkspace());
      // 补过时间戳就落盘一次，避免下次加载顺序重算
      if (ws !== parsedWorkspace) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ws));
      }
      const selId = selectedId || DEFAULT_FILE_ID;
      const selectedNode = findNodeById(ws, selId);
      const markdown =
        selectedNode?.type === 'file' ? (selectedNode.content ?? '') : '';
      return {
        state: {
          workspace: ws,
          selectedId: selId,
          markdown,
          theme: theme === 'light' || theme === 'dark' ? theme : 'light',
          copyStyle:
            copyStyle && TEMPLATES.some((t) => t.id === copyStyle) ? copyStyle : 'default',
          storageMode: storageMode === 'project' ? 'project' : 'local',
          projectRootPath,
          surface:
            surface === 'settings' || surface === 'notion' || surface === 'folder'
              ? surface
              : 'paper',
          ...notionSnapshot,
        },
        version: 0,
      };
    } catch (e) {
      console.error('加载编辑器状态失败:', e);
      return {
        state: {
          workspace: createDefaultWorkspace(),
          selectedId: DEFAULT_FILE_ID,
          markdown: getDefaultMarkdown(),
          theme: 'light',
          copyStyle: 'default',
          storageMode: 'local',
          projectRootPath: '',
          surface: 'paper',
          ...notionSnapshot,
        },
        version: 0,
      };
    }
  },
  setItem: (_, value) => {
    if (typeof window === 'undefined') return;
    try {
      const state = value?.state ?? value;
      // Notion 配置体积小，先写入，避免工作区过大占满配额后 Token 丢失
      persistNotionSnapshot(state);
      if (state.workspace) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.workspace));
      }
      if (state.selectedId) {
        window.localStorage.setItem(SELECTED_ID_STORAGE_KEY, state.selectedId);
      }
      if (state.theme) {
        window.localStorage.setItem(THEME_STORAGE_KEY, state.theme);
      }
      if (state.copyStyle) {
        window.localStorage.setItem(COPY_STYLE_STORAGE_KEY, state.copyStyle);
      }
      if (state.storageMode) {
        window.localStorage.setItem(STORAGE_MODE_STORAGE_KEY, state.storageMode);
      }
      if (state.projectRootPath != null) {
        window.localStorage.setItem(PROJECT_ROOT_STORAGE_KEY, state.projectRootPath);
      }
      if (state.surface) {
        window.localStorage.setItem(SURFACE_STORAGE_KEY, state.surface);
      }
    } catch (e) {
      console.error('持久化失败:', e);
    }
  },
  removeItem: () => {},
};

const persistConfig = {
  name: 'md-renderer-editor',
  storage: editorStorage,
  onRehydrateStorage: () => {
    return () => {
      editorPersistHydrated = true;
    };
  },
  partialize: (state) => ({
    workspace: state.workspace,
    selectedId: state.selectedId,
    theme: state.theme,
    copyStyle: state.copyStyle,
    storageMode: state.storageMode,
    projectRootPath: state.projectRootPath,
    surface: state.surface,
    notionToken: state.notionToken,
    notionFilePages: state.notionFilePages,
    notionDatabaseId: state.notionDatabaseId,
  }),
};

const persistWorkspace = (workspace) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
  } catch (err) {
    console.error('保存工作区失败:', err);
  }
};

const createLocalProjectNodeId = (projectRootPath, suffix = '') => {
  return `project:${projectRootPath}${suffix}`;
};

const markLocalProjectNode = (node, projectRootPath, isRoot = false) => {
  if (!node) return null;
  const relativePath = isRoot ? '' : (node.relativePath ?? '');
  const suffix = isRoot ? '' : `:${node.type}:${relativePath || node.name}`;
  const children = Array.isArray(node.children)
    ? node.children.map((child) => markLocalProjectNode(child, projectRootPath, false)).filter(Boolean)
    : undefined;

  return {
    ...node,
    id: createLocalProjectNodeId(projectRootPath, suffix),
    projectRootPath,
    localProjectRoot: isRoot,
    ...(children ? { children } : {}),
  };
};

const removeLocalProjectByPath = (workspace, projectRootPath) => {
  if (!workspace?.children || !projectRootPath) return workspace;
  return {
    ...workspace,
    children: workspace.children.filter((child) => (
      !(child.localProjectRoot && child.projectRootPath === projectRootPath)
    )),
  };
};

const ensureLocalWorkspaceRoot = (workspace, legacyProjectRootPath) => {
  if (legacyProjectRootPath && workspace?.id === 'root' && workspace?.type === 'folder') {
    return {
      ...createDefaultWorkspace(),
      children: [markLocalProjectNode(workspace, legacyProjectRootPath, true)].filter(Boolean),
    };
  }
  return workspace?.id === 'root' && workspace?.type === 'folder'
    ? workspace
    : createDefaultWorkspace();
};

export const useEditorStore = create(
  persist(
    (set, get) => ({
      workspace: createDefaultWorkspace(),
      selectedId: DEFAULT_FILE_ID,
      markdown: getDefaultMarkdown(),
      sidebarCollapsed: false,
      theme: 'light',
      copyStyle: 'default',
      storageMode: 'local',
      projectRootPath: '',
      /** 正在等待 debounce 写入磁盘的文件 id */
      diskSavePendingFileIds: {},
      /** 磁盘外部变更触发编辑器重载（递增） */
      editorReloadToken: 0,
      /** 本地项目磁盘冲突待用户选择 */
      localProjectConflict: null,
      /** 通知渲染进程取消待写入磁盘的定时器 */
      diskSaveCancelSeq: 0,
      diskSaveCancelFileIds: [],
      surface: 'paper',
      notionToken: '',
      notionFilePages: {},
      notionDatabaseId: '',
      activeBlockId: null,
      activeBlockDraft: '',

      setNotionToken: (notionToken) => set({ notionToken: notionToken ?? '' }),
      setNotionDatabaseId: (notionDatabaseId) => set({ notionDatabaseId: notionDatabaseId ?? '' }),
      setFileNotionPageId: (fileId, pageId) =>
        set((state) => {
          const next = { ...(state.notionFilePages ?? {}) };
          if (!pageId?.trim()) {
            delete next[fileId];
          } else {
            next[fileId] = pageId.trim();
          }
          return { notionFilePages: next };
        }),
      /** 批量合并 notionFilePages 映射（用于批量同步后注册新映射） */
      mergeNotionFilePages: (newMappings) =>
        set((state) => ({
          notionFilePages: { ...(state.notionFilePages ?? {}), ...newMappings },
        })),

      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      toggleSidebarCollapsed: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

      setTheme: (theme) => set({ theme }),
      setCopyStyle: (copyStyle) => {
        set({ copyStyle });
        try {
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(COPY_STYLE_STORAGE_KEY, copyStyle);
          }
        } catch (e) {
          /* ignore */
        }
      },
      setSurface: (surface) => set({ surface }),

      setActiveBlockId: (id) => set({ activeBlockId: id }),
      setActiveBlockDraft: (draft) => set({ activeBlockDraft: draft }),
      cancelActiveBlock: () => set({ activeBlockId: null, activeBlockDraft: '' }),

      selectNode: (nodeId) => {
        const { workspace } = get();
        const node = findNodeById(workspace, nodeId);
        const isFolder = node?.type === 'folder';
        const markdown = isFolder ? get().markdown : (node?.content ?? '');
        set({
          surface: isFolder ? 'folder' : 'paper',
          activeBlockId: null,
          activeBlockDraft: '',
          selectedId: nodeId,
          markdown,
        });
      },

      updateSelectedFileContent: (nextMarkdown) => {
        const { workspace, selectedId } = get();
        const updated = updateNodeById(workspace, selectedId, (node) => {
          if (node.type !== 'file') return node;
          return { ...node, content: nextMarkdown, updatedAt: Date.now() };
        });
        persistWorkspace(updated);
        set({ workspace: updated, markdown: nextMarkdown });
      },

      /** 设置某文件的标签（去重、去空、去首尾空格） */
      setFileTags: (fileId, tags) => {
        const { workspace } = get();
        const cleaned = Array.from(
          new Set((tags ?? []).map((t) => String(t).trim()).filter(Boolean)),
        );
        const updated = updateNodeById(workspace, fileId, (node) => {
          if (node.type !== 'file') return node;
          return { ...node, tags: cleaned };
        });
        persistWorkspace(updated);
        set({ workspace: updated });
      },

      setWorkspace: (workspace) => set({ workspace }),
      setSelectedId: (selectedId) => set({ selectedId }),
      setMarkdown: (markdown) => set({ markdown }),

      setDiskSavePending: (fileId, pending) => {
        if (!fileId) return;
        const next = { ...get().diskSavePendingFileIds };
        if (pending) {
          next[fileId] = true;
        } else {
          delete next[fileId];
        }
        set({ diskSavePendingFileIds: next });
      },

      requestCancelDiskSave: (fileIds) => {
        const ids = (fileIds ?? []).filter(Boolean);
        if (ids.length === 0) return;
        const nextPending = { ...get().diskSavePendingFileIds };
        ids.forEach((id) => { delete nextPending[id]; });
        set({
          diskSavePendingFileIds: nextPending,
          diskSaveCancelSeq: get().diskSaveCancelSeq + 1,
          diskSaveCancelFileIds: ids,
        });
      },

      setLocalProjectConflict: (payload) => set({ localProjectConflict: payload }),

      dismissLocalProjectConflict: () => set({ localProjectConflict: null }),

      resolveLocalProjectConflict: (resolution) => {
        const conflict = get().localProjectConflict;
        if (!conflict) return;

        const conflictFileIds = conflict.conflicts.map((c) => c.fileId);
        if (resolution === 'use-disk') {
          get().requestCancelDiskSave(conflictFileIds);
        }

        get().refreshDiskBackedProject({
          projectRootPath: conflict.projectRootPath,
          workspace: conflict.diskPayload.workspace,
          projectsChildren: conflict.diskPayload.projectsChildren,
          conflictResolution: resolution,
          conflictFileIds,
        });
        set({ localProjectConflict: null });
      },

      openLocalProjectWorkspace: (workspace, projectRootPath) => {
        const rootPath = projectRootPath ?? '';
        const projectNode = markLocalProjectNode(workspace, rootPath, true);
        if (!projectNode) return;

        const current = get();
        const baseWorkspace = ensureLocalWorkspaceRoot(current.workspace, current.projectRootPath);
        const withoutDuplicate = removeLocalProjectByPath(baseWorkspace, rootPath);
        const nextWorkspace = addChildNode(withoutDuplicate, withoutDuplicate.id, projectNode);
        const initialId = findFirstFileId(projectNode) ?? projectNode.id;
        const node = findNodeById(nextWorkspace, initialId);

        persistWorkspace(nextWorkspace);
        set({
          workspace: nextWorkspace,
          selectedId: initialId,
          markdown: node?.type === 'file' ? (node.content ?? '') : '',
          storageMode: 'local',
          projectRootPath: '',
          surface: node?.type === 'folder' ? 'folder' : 'paper',
          activeBlockId: null,
          activeBlockDraft: '',
        });
      },

      /** 静默初始化 MdRender/Projects：侧边栏只展示 Projects 下已有内容 */
      hydrateProjectsWorkspace: ({ projectRootPath, projectsChildren }) => {
        if (!projectRootPath) return;

        const { workspace } = get();
        const cleaned = stripLocalProjectMounts(workspace);
        const nextWorkspace = mergeProjectsChildren(cleaned, projectsChildren ?? []);

        persistWorkspace(nextWorkspace);
        set({
          workspace: nextWorkspace,
          projectRootPath,
          storageMode: 'local',
        });
      },

      /** 磁盘变更后刷新本地项目树；冲突时由 conflictResolution 决定保留本地或使用磁盘 */
      refreshDiskBackedProject: ({
        projectRootPath,
        workspace: diskTree,
        projectsChildren,
        conflictResolution = 'auto',
        conflictFileIds = [],
      }) => {
        if (!projectRootPath) return;

        const state = get();
        const conflictIdSet = new Set(conflictFileIds);
        const useDiskFor = (fileId) => (
          conflictResolution === 'use-disk' && conflictIdSet.has(fileId)
        );
        const keepLocalFor = (fileId) => (
          conflictResolution === 'keep-local' && conflictIdSet.has(fileId)
        );
        const shouldPreserveFile = (fileId) => {
          if (useDiskFor(fileId)) return false;
          if (keepLocalFor(fileId)) return true;
          if (conflictResolution !== 'auto') return false;
          return Boolean(state.diskSavePendingFileIds[fileId]);
        };

        const preserveDirtyInTree = (node) => {
          if (!node) return node;
          if (node.type === 'file' && shouldPreserveFile(node.id)) {
            const localContent = node.id === state.selectedId
              ? state.markdown
              : (findNodeById(state.workspace, node.id)?.content ?? node.content ?? '');
            return { ...node, content: localContent };
          }
          if (node.type === 'folder' && Array.isArray(node.children)) {
            return {
              ...node,
              children: node.children.map(preserveDirtyInTree),
            };
          }
          return node;
        };

        const mountedRoot = findLocalProjectRoot(state.workspace);
        const isTreeMount = mountedRoot?.localProjectRoot
          && mountedRoot.projectRootPath === projectRootPath;

        let nextWorkspace = state.workspace;
        if (isTreeMount && diskTree) {
          const freshRoot = markLocalProjectNode(preserveDirtyInTree(diskTree), projectRootPath, true);
          if (freshRoot) {
            nextWorkspace = replaceLocalProjectMount(state.workspace, projectRootPath, freshRoot);
          }
        } else if (Array.isArray(projectsChildren)) {
          const children = projectsChildren.map((child) => {
            if (child.type !== 'file' || !shouldPreserveFile(child.id)) return child;
            const localContent = child.id === state.selectedId
              ? state.markdown
              : (findNodeById(state.workspace, child.id)?.content ?? child.content ?? '');
            return { ...child, content: localContent };
          });
          nextWorkspace = syncProjectsChildrenFromDisk(
            state.workspace,
            projectRootPath,
            children,
          );
        } else {
          return;
        }

        const selectedFile = findNodeById(nextWorkspace, state.selectedId);
        const patch = { workspace: nextWorkspace };
        if (selectedFile?.type === 'file' && !shouldPreserveFile(state.selectedId)) {
          patch.markdown = selectedFile.content ?? '';
          patch.editorReloadToken = state.editorReloadToken + 1;
        }
        if (!findNodeById(nextWorkspace, state.selectedId)) {
          const nextFileId = findFirstFileId(nextWorkspace);
          if (nextFileId) {
            const nextNode = findNodeById(nextWorkspace, nextFileId);
            patch.selectedId = nextFileId;
            patch.markdown = nextNode?.type === 'file' ? (nextNode.content ?? '') : state.markdown;
            patch.surface = nextNode?.type === 'folder' ? 'folder' : 'paper';
          }
        }

        persistWorkspace(nextWorkspace);
        set(patch);
      },

      addFile: (contextNodeId) => {
        const { workspace, selectedId } = get();
        const fileId = createId('file');
        const name = buildUniqueName(workspace, '未命名', '.md');
        const newFile = { id: fileId, type: 'file', name, content: '' };
        const targetFolderId = resolveTargetFolderId(workspace, contextNodeId ?? selectedId);
        const targetFolder = findNodeById(workspace, targetFolderId);
        if (targetFolder?.projectRootPath) return false;
        const nextWorkspace = addChildNode(workspace, targetFolderId, newFile);
        persistWorkspace(nextWorkspace);
        set({ workspace: nextWorkspace, selectedId: fileId, markdown: '', surface: 'paper' });
        return true;
      },

      addFolder: (contextNodeId) => {
        const { workspace, selectedId } = get();
        const folderId = createId('folder');
        const folderName = buildUniqueName(workspace, '新建文件夹');
        const newFolder = { id: folderId, type: 'folder', name: folderName, children: [] };
        const targetFolderId = resolveTargetFolderId(workspace, contextNodeId ?? selectedId);
        const targetFolder = findNodeById(workspace, targetFolderId);
        if (targetFolder?.projectRootPath) return false;
        const nextWorkspace = addChildNode(workspace, targetFolderId, newFolder);
        persistWorkspace(nextWorkspace);
        set({ workspace: nextWorkspace, selectedId: folderId, surface: 'folder' });
        return true;
      },

      applyRename: (targetId, newName) => {
        const { workspace } = get();
        const trimmed = newName.trim();
        if (!trimmed) return false;
        const node = findNodeById(workspace, targetId);
        if (!node) return false;
        if (node.projectRootPath && node.relativePath) return false;
        if (nameExists(workspace, trimmed) && trimmed !== node.name) return false;
        const updated = updateNodeById(workspace, targetId, (current) => ({
          ...current,
          name: trimmed,
        }));
        persistWorkspace(updated);
        set({ workspace: updated });
        return true;
      },

      replaceDiskBackedNode: (targetId, { name, relativePath: newRelativePath, updatedAt }) => {
        const { workspace, selectedId } = get();
        const node = findNodeById(workspace, targetId);
        if (!node?.projectRootPath || !node.relativePath) return false;

        const oldRelativePath = node.relativePath;
        const updated = updateNodeById(workspace, targetId, (current) => (
          remapDiskNodeAfterRename(current, oldRelativePath, newRelativePath, name)
        ));

        const newRootId = `project:${node.projectRootPath}:${node.type}:${newRelativePath}`;
        let nextSelectedId = selectedId;
        if (selectedId === targetId) {
          nextSelectedId = newRootId;
        } else {
          const selectedNode = findNodeById(workspace, selectedId);
          if (selectedNode?.relativePath?.startsWith(`${oldRelativePath}/`)) {
            const nextRelativePath = `${newRelativePath}${selectedNode.relativePath.slice(oldRelativePath.length)}`;
            nextSelectedId = findNodeIdByRelativePath(updated, nextRelativePath) ?? nextSelectedId;
          }
        }

        const patch = { workspace: updated, selectedId: nextSelectedId };
        if (updatedAt != null) {
          const renamedNode = findNodeById(updated, newRootId);
          if (renamedNode?.type === 'file') {
            patch.markdown = renamedNode.content ?? get().markdown;
          }
        }

        persistWorkspace(updated);
        set(patch);
        return true;
      },

      deleteNode: (nodeId) => {
        const { workspace, selectedId } = get();
        const targetId = nodeId ?? selectedId;
        if (targetId === 'root') return false;
        const node = findNodeById(workspace, targetId);
        if (!node) return false;
        if (node.projectRootPath && node.relativePath) return false;

        const result = removeNodeById(workspace, targetId);
        if (!result.removed) return false;

        const nextWorkspace = result.node;
        const nextFileId = findFirstFileId(nextWorkspace);
        const nextNode = findNodeById(nextWorkspace, nextFileId ?? nextWorkspace.id);
        persistWorkspace(nextWorkspace);
        set({
          workspace: nextWorkspace,
          selectedId: nextFileId ?? nextWorkspace.id,
          markdown: nextNode?.type === 'file' ? (nextNode.content ?? '') : '',
          surface: nextNode?.type === 'folder' ? 'folder' : 'paper',
        });
        return true;
      },

      removeDiskBackedNode: (nodeId) => {
        const { workspace, selectedId } = get();
        const targetId = nodeId ?? selectedId;
        if (targetId === 'root') return false;
        const node = findNodeById(workspace, targetId);
        if (!node?.projectRootPath || !node.relativePath) return false;

        const result = removeNodeById(workspace, targetId);
        if (!result.removed) return false;

        const nextWorkspace = result.node;
        const nextFileId = findFirstFileId(nextWorkspace);
        const nextNode = findNodeById(nextWorkspace, nextFileId ?? nextWorkspace.id);
        persistWorkspace(nextWorkspace);
        set({
          workspace: nextWorkspace,
          selectedId: nextFileId ?? nextWorkspace.id,
          markdown: nextNode?.type === 'file' ? (nextNode.content ?? '') : '',
          surface: nextNode?.type === 'folder' ? 'folder' : 'paper',
        });
        return true;
      },

      importWorkspace: (imported) => {
        const firstFileId = findFirstFileId(imported);
        const initialId = firstFileId ?? imported?.id ?? 'root';
        const node = findNodeById(imported, initialId);
        persistWorkspace(imported);
        set({
          workspace: imported,
          selectedId: initialId,
          markdown: node?.type === 'file' ? (node.content ?? '') : '',
          storageMode: 'local',
          projectRootPath: '',
          surface: 'paper',
          activeBlockId: null,
          activeBlockDraft: '',
        });
      },

      insertWorkspaceNode: (node) => {
        if (!node) return false;

        const { workspace } = get();
        const nextWorkspace = addChildNode(workspace, workspace.id, node);
        const initialId = findFirstFileId(node) ?? node.id;
        const selectedNode = findNodeById(nextWorkspace, initialId);

        persistWorkspace(nextWorkspace);
        set({
          workspace: nextWorkspace,
          selectedId: initialId,
          markdown: selectedNode?.type === 'file' ? (selectedNode.content ?? '') : '',
          surface: selectedNode?.type === 'folder' ? 'folder' : 'paper',
          activeBlockId: null,
          activeBlockDraft: '',
        });
        return true;
      },

      insertLocalProjectNode: (parentFolderId, node) => {
        if (!node || !parentFolderId) return false;

        const { workspace } = get();
        const nextWorkspace = addChildNode(workspace, parentFolderId, node);
        persistWorkspace(nextWorkspace);
        set({
          workspace: nextWorkspace,
          selectedId: node.id,
          markdown: node.type === 'file' ? (node.content ?? '') : '',
          surface: node.type === 'folder' ? 'folder' : 'paper',
          activeBlockId: null,
          activeBlockDraft: '',
        });
        return true;
      },

      startEditingBlock: (token) => {
        set({
          surface: 'paper',
          activeBlockId: token?.id ?? null,
          activeBlockDraft: token?.source ?? '',
        });
      },

      commitActiveBlock: (token, draft, nextMarkdown) => {
        const { activeBlockId } = get();
        if (!activeBlockId || !token) {
          set({ activeBlockId: null, activeBlockDraft: '' });
          return;
        }
        set({ activeBlockId: null, activeBlockDraft: '' });
        if (nextMarkdown != null) {
          get().updateSelectedFileContent(nextMarkdown);
        }
      },

      syncMarkdownFromSelectedFile: () => {
        const { workspace, selectedId, markdown, diskSavePendingFileIds } = get();
        const selectedFile = findNodeById(workspace, selectedId);
        if (selectedFile?.type !== 'file') return;
        if (diskSavePendingFileIds[selectedId]) return;
        if (normalizeMarkdown(selectedFile.content) === normalizeMarkdown(markdown)) return;
        set({ markdown: selectedFile.content ?? '' });
      },

      syncSelectedIdFromWorkspace: () => {
        const { workspace, selectedId } = get();
        const selectedNode = findNodeById(workspace, selectedId);
        if (!selectedNode) {
          const firstFileId = findFirstFileId(workspace);
          if (firstFileId) set({ selectedId: firstFileId, surface: 'paper' });
        }
      },
    }),
    persistConfig,
  ),
);

/** 派生：当前选中的文件节点 */
export function useSelectedFile() {
  return useEditorStore((state) => {
    const node = findNodeById(state.workspace, state.selectedId);
    return node?.type === 'file' ? node : null;
  });
}
