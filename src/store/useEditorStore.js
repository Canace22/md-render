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

/** 兼容现有 localStorage 多 key 的持久化存储 */
const editorStorage = {
  getItem: () => {
    if (typeof window === 'undefined') return null;
    try {
      const workspaceRaw = window.localStorage.getItem(STORAGE_KEY);
      const selectedId = window.localStorage.getItem(SELECTED_ID_STORAGE_KEY);
      const theme = window.localStorage.getItem(THEME_STORAGE_KEY);
      const copyStyle = window.localStorage.getItem(COPY_STYLE_STORAGE_KEY);
      const surface = window.localStorage.getItem(SURFACE_STORAGE_KEY);

      const workspace = workspaceRaw ? JSON.parse(workspaceRaw) : null;
      const ws = workspace ?? createDefaultWorkspace();
      const selId = selectedId || DEFAULT_FILE_ID;
      const selectedNode = findNodeById(ws, selId);
      const markdown =
        selectedNode?.type === 'file' ? (selectedNode.content ?? '') : '';
      return {
        state: {
          workspace: ws,
          selectedId: selId,
          markdown,
          theme: theme === 'light' || theme === 'dark' || theme === 'system' ? theme : 'system',
          copyStyle:
            copyStyle && TEMPLATES.some((t) => t.id === copyStyle) ? copyStyle : 'default',
          surface: surface === 'settings' ? 'settings' : 'paper',
        },
        version: 0,
      };
    } catch (e) {
      return null;
    }
  },
  setItem: (_, value) => {
    if (typeof window === 'undefined') return;
    try {
      const state = value?.state ?? value;
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
  partialize: (state) => ({
    workspace: state.workspace,
    selectedId: state.selectedId,
    theme: state.theme,
    copyStyle: state.copyStyle,
    surface: state.surface,
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

export const useEditorStore = create(
  persist(
    (set, get) => ({
      workspace: createDefaultWorkspace(),
      selectedId: DEFAULT_FILE_ID,
      markdown: getDefaultMarkdown(),
      sidebarCollapsed: false,
      theme: 'system',
      copyStyle: 'default',
      surface: 'paper',
      activeBlockId: null,
      activeBlockDraft: '',

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
        const markdown = node?.type === 'file' ? (node.content ?? '') : get().markdown;
        set({
          surface: 'paper',
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
          return { ...node, content: nextMarkdown };
        });
        persistWorkspace(updated);
        set({ workspace: updated, markdown: nextMarkdown });
      },

      setWorkspace: (workspace) => set({ workspace }),
      setSelectedId: (selectedId) => set({ selectedId }),
      setMarkdown: (markdown) => set({ markdown }),

      addFile: (contextNodeId) => {
        const { workspace, selectedId } = get();
        const fileId = createId('file');
        const name = buildUniqueName(workspace, '未命名', '.md');
        const newFile = { id: fileId, type: 'file', name, content: '' };
        const targetFolderId = resolveTargetFolderId(workspace, contextNodeId ?? selectedId);
        const nextWorkspace = addChildNode(workspace, targetFolderId, newFile);
        persistWorkspace(nextWorkspace);
        set({ workspace: nextWorkspace, selectedId: fileId, markdown: '', surface: 'paper' });
      },

      addFolder: (contextNodeId) => {
        const { workspace, selectedId } = get();
        const folderId = createId('folder');
        const folderName = buildUniqueName(workspace, '新建文件夹');
        const newFolder = { id: folderId, type: 'folder', name: folderName, children: [] };
        const targetFolderId = resolveTargetFolderId(workspace, contextNodeId ?? selectedId);
        const nextWorkspace = addChildNode(workspace, targetFolderId, newFolder);
        persistWorkspace(nextWorkspace);
        set({ workspace: nextWorkspace, selectedId: folderId });
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
        persistWorkspace(nextWorkspace);
        set({
          workspace: nextWorkspace,
          selectedId: nextFileId ?? nextWorkspace.id,
          surface: 'paper',
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
          surface: 'paper',
          activeBlockId: null,
          activeBlockDraft: '',
        });
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
          if (firstFileId) set({ selectedId: firstFileId });
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
