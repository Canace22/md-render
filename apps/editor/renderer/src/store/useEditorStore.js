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
} from './workspaceUtils.js';
import { TEMPLATES } from '../utils/wechatTemplates.js';

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
        if (nameExists(workspace, trimmed) && trimmed !== node.name) return false;
        const updated = updateNodeById(workspace, targetId, (current) => ({
          ...current,
          name: trimmed,
        }));
        persistWorkspace(updated);
        set({ workspace: updated });
        return true;
      },

      deleteNode: (nodeId) => {
        const { workspace, selectedId } = get();
        const targetId = nodeId ?? selectedId;
        if (targetId === 'root') return false;
        const node = findNodeById(workspace, targetId);
        if (!node) return false;

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
        const { workspace, selectedId, markdown } = get();
        const selectedFile = findNodeById(workspace, selectedId);
        if (selectedFile?.type === 'file' && selectedFile.content !== markdown) {
          set({ markdown: selectedFile.content ?? '' });
        }
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
