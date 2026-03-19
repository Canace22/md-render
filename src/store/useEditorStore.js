import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { extractEntities, extractScenes, mergeSuggestions } from '../core';
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
const MODE_STORAGE_KEY = 'md-renderer-mode';
const NOVEL_PANEL_STORAGE_KEY = 'md-renderer-novel-panel';
const NOVEL_MEMORY_STORAGE_KEY = 'md-renderer-novel-memory';
const LEGACY_NOVEL_SUGGESTIONS_STORAGE_KEY = 'md-renderer-novel-suggestions';
const NOVEL_FINDINGS_STORAGE_KEY = 'md-renderer-novel-findings';
const NOVEL_AGENT_SUGGESTIONS_STORAGE_KEY = 'md-renderer-novel-agent-suggestions';
const LAST_ANALYZED_FILE_STORAGE_KEY = 'md-renderer-last-analyzed-file';
const NOVEL_PANEL_SEEN_STORAGE_KEY = 'md-renderer-novel-panel-seen';

const createDefaultNovelMemory = () => ({
  entities: [],
  scenesByFile: {},
  currentSceneByFile: {},
  updatedAt: 0,
});

const safeParseJSON = (value, fallback) => {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
};

const normalizeLegacyAgentSuggestion = (suggestion = {}) => {
  const nextKind = suggestion?.title?.includes('场景') ? 'scene-completion' : 'entity-completion';
  return {
    ...suggestion,
    kind: nextKind,
    title: nextKind === 'scene-completion' ? 'Agent 补全当前场景' : 'Agent 补全当前实体',
    reason: '已记录 Agent 请求。当前版本未接入模型，先保留为建议入口。',
  };
};

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
      const mode = window.localStorage.getItem(MODE_STORAGE_KEY);
      const novelPanelOpen = window.localStorage.getItem(NOVEL_PANEL_STORAGE_KEY);
      const novelMemoryRaw = window.localStorage.getItem(NOVEL_MEMORY_STORAGE_KEY);
      const legacyNovelSuggestionsRaw = window.localStorage.getItem(LEGACY_NOVEL_SUGGESTIONS_STORAGE_KEY);
      const novelFindingsRaw = window.localStorage.getItem(NOVEL_FINDINGS_STORAGE_KEY);
      const novelAgentSuggestionsRaw = window.localStorage.getItem(NOVEL_AGENT_SUGGESTIONS_STORAGE_KEY);
      const lastAnalyzedFileId = window.localStorage.getItem(LAST_ANALYZED_FILE_STORAGE_KEY);
      const novelPanelSeen = window.localStorage.getItem(NOVEL_PANEL_SEEN_STORAGE_KEY);

      const workspace = safeParseJSON(workspaceRaw, null);
      const ws = workspace ?? createDefaultWorkspace();
      const selId = selectedId || DEFAULT_FILE_ID;
      const selectedNode = findNodeById(ws, selId);
      const markdown =
        selectedNode?.type === 'file' ? (selectedNode.content ?? '') : '';
      const novelMemory = safeParseJSON(novelMemoryRaw, createDefaultNovelMemory());
      const legacySuggestions = safeParseJSON(legacyNovelSuggestionsRaw, []);
      const fallbackFindings = legacySuggestions.filter((suggestion) => suggestion.kind !== 'ai-placeholder');
      const fallbackAgentSuggestions = legacySuggestions
        .filter((suggestion) => suggestion.kind === 'ai-placeholder')
        .map(normalizeLegacyAgentSuggestion);
      const novelFindings = safeParseJSON(novelFindingsRaw, fallbackFindings);
      const novelAgentSuggestions = safeParseJSON(
        novelAgentSuggestionsRaw,
        fallbackAgentSuggestions,
      );
      return {
        state: {
          workspace: ws,
          selectedId: selId,
          markdown,
          mode: mode === 'novel' ? 'novel' : 'default',
          theme: theme === 'light' || theme === 'dark' ? theme : 'light',
          copyStyle:
            copyStyle && TEMPLATES.some((t) => t.id === copyStyle) ? copyStyle : 'default',
          surface: surface === 'settings' ? 'settings' : 'paper',
          novelPanelOpen: novelPanelOpen === 'true',
          novelPanelSeen: novelPanelSeen === 'true',
          novelMemory,
          novelFindings,
          novelAgentSuggestions,
          lastAnalyzedFileId: lastAnalyzedFileId || '',
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
      if (state.mode) {
        window.localStorage.setItem(MODE_STORAGE_KEY, state.mode);
      }
      window.localStorage.setItem(NOVEL_PANEL_STORAGE_KEY, state.novelPanelOpen ? 'true' : 'false');
      window.localStorage.setItem(
        NOVEL_PANEL_SEEN_STORAGE_KEY,
        state.novelPanelSeen ? 'true' : 'false',
      );
      window.localStorage.setItem(
        NOVEL_MEMORY_STORAGE_KEY,
        JSON.stringify(state.novelMemory ?? createDefaultNovelMemory()),
      );
      window.localStorage.setItem(
        NOVEL_FINDINGS_STORAGE_KEY,
        JSON.stringify(state.novelFindings ?? []),
      );
      window.localStorage.setItem(
        NOVEL_AGENT_SUGGESTIONS_STORAGE_KEY,
        JSON.stringify(state.novelAgentSuggestions ?? []),
      );
      window.localStorage.setItem(
        LAST_ANALYZED_FILE_STORAGE_KEY,
        state.lastAnalyzedFileId ?? '',
      );
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
    mode: state.mode,
    theme: state.theme,
    copyStyle: state.copyStyle,
    surface: state.surface,
    novelPanelOpen: state.novelPanelOpen,
    novelPanelSeen: state.novelPanelSeen,
    novelMemory: state.novelMemory,
    novelFindings: state.novelFindings,
    novelAgentSuggestions: state.novelAgentSuggestions,
    lastAnalyzedFileId: state.lastAnalyzedFileId,
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
      mode: 'default',
      theme: 'light',
      copyStyle: 'default',
      surface: 'paper',
      novelPanelOpen: false,
      novelPanelSeen: false,
      novelMemory: createDefaultNovelMemory(),
      novelFindings: [],
      novelAgentSuggestions: [],
      lastAnalyzedFileId: '',
      activeBlockId: null,
      activeBlockDraft: '',

      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      toggleSidebarCollapsed: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

      setMode: (mode) =>
        set((state) => {
          const shouldOpenPanel = mode === 'novel' && !state.novelPanelSeen;
          return {
            mode,
            novelPanelOpen: shouldOpenPanel ? true : state.novelPanelOpen,
            novelPanelSeen: shouldOpenPanel ? true : state.novelPanelSeen,
          };
        }),
      toggleMode: () =>
        set((state) => {
          const nextMode = state.mode === 'novel' ? 'default' : 'novel';
          const shouldOpenPanel = nextMode === 'novel' && !state.novelPanelSeen;
          return {
            mode: nextMode,
            novelPanelOpen: shouldOpenPanel ? true : state.novelPanelOpen,
            novelPanelSeen: shouldOpenPanel ? true : state.novelPanelSeen,
          };
        }),
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
      setNovelPanelOpen: (open) =>
        set((state) => ({
          novelPanelOpen: open,
          novelPanelSeen: open ? true : state.novelPanelSeen,
        })),
      toggleNovelPanel: () =>
        set((state) => ({
          novelPanelOpen: !state.novelPanelOpen,
          novelPanelSeen: state.novelPanelSeen || !state.novelPanelOpen,
        })),

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

      analyzeNovelFile: (fileId, content) => {
        const { novelMemory, novelFindings } = get();
        const knownEntities = novelMemory?.entities ?? [];
        const extractedEntities = extractEntities(content, { fileId, knownEntities });
        const merged = mergeSuggestions({
          existingEntities: knownEntities,
          extractedEntities,
          existingSuggestions: novelFindings,
          fileId,
        });
        const sceneAnalysis = extractScenes(content, {
          fileId,
          entities: merged.entities,
        });

        set({
          novelMemory: {
            ...novelMemory,
            entities: merged.entities,
            scenesByFile: {
              ...(novelMemory?.scenesByFile ?? {}),
              [fileId]: sceneAnalysis.scenes,
            },
            currentSceneByFile: {
              ...(novelMemory?.currentSceneByFile ?? {}),
              [fileId]: sceneAnalysis.currentSceneId,
            },
            updatedAt: Date.now(),
          },
          novelFindings: merged.suggestions,
          lastAnalyzedFileId: fileId,
        });
      },

      updateNovelEntity: (entityId, patch) =>
        set((state) => {
          const nextEntities = (state.novelMemory?.entities ?? []).map((entity) => {
            if (entity.id !== entityId) return entity;
            const nextManualFields = { ...(entity.manualFields ?? {}) };
            Object.keys(patch ?? {}).forEach((field) => {
              nextManualFields[field] = true;
            });
            const nextAliases = Array.isArray(patch?.aliases)
              ? patch.aliases
              : entity.aliases ?? [];
            return {
              ...entity,
              ...patch,
              aliases: nextAliases,
              manualFields: nextManualFields,
            };
          });

          return {
            novelMemory: {
              ...(state.novelMemory ?? createDefaultNovelMemory()),
              entities: nextEntities,
              updatedAt: Date.now(),
            },
          };
        }),

      markNovelFinding: (suggestionId, status) =>
        set((state) => ({
          novelFindings: (state.novelFindings ?? []).map((suggestion) =>
            suggestion.id === suggestionId ? { ...suggestion, status } : suggestion,
          ),
        })),

      resolveNovelFinding: (suggestionId, action = 'accept') =>
        set((state) => {
          const targetSuggestion = (state.novelFindings ?? []).find(
            (suggestion) => suggestion.id === suggestionId,
          );
          if (!targetSuggestion) return {};

          let nextEntities = [...(state.novelMemory?.entities ?? [])];
          if (action === 'accept') {
            if (targetSuggestion.kind === 'new-entity') {
              nextEntities = nextEntities.map((entity) =>
                entity.id === targetSuggestion.targetId ? { ...entity, status: 'confirmed' } : entity,
              );
            }

            if (targetSuggestion.kind === 'alias-merge') {
              nextEntities = nextEntities.reduce((accumulator, entity) => {
                const sourceEntityId = targetSuggestion.payload?.sourceEntityId;
                const sourceEntity = nextEntities.find((item) => item.id === sourceEntityId);
                if (entity.id === targetSuggestion.targetId) {
                  const mergedMentionMap = {
                    ...(entity.mentionsByFile ?? {}),
                    ...(sourceEntity?.mentionsByFile ?? {}),
                  };
                  accumulator.push({
                    ...entity,
                    aliases: Array.from(
                      new Set([...(entity.aliases ?? []), targetSuggestion.payload?.alias].filter(Boolean)),
                    ),
                    mentionsByFile: mergedMentionMap,
                    mentionCount: Object.values(mergedMentionMap).reduce(
                      (total, value) => total + (Number(value) || 0),
                      0,
                    ),
                    status: 'confirmed',
                  });
                  return accumulator;
                }
                if (entity.id === sourceEntityId) {
                  return accumulator;
                }
                accumulator.push(entity);
                return accumulator;
              }, []);
            }

            if (targetSuggestion.kind === 'conflict') {
              nextEntities = nextEntities.map((entity) =>
                entity.id === targetSuggestion.targetId ? { ...entity, status: 'confirmed' } : entity,
              );
            }
          }

          return {
            novelMemory: {
              ...(state.novelMemory ?? createDefaultNovelMemory()),
              entities: nextEntities,
              updatedAt: Date.now(),
            },
            novelFindings: (state.novelFindings ?? []).map((suggestion) =>
              suggestion.id === suggestionId
                ? { ...suggestion, status: action === 'accept' ? 'accepted' : 'dismissed' }
                : suggestion,
            ),
          };
        }),

      queueNovelAgentSuggestion: (kind, payload) =>
        set((state) => {
          const suggestionId = `agent-${kind}-${payload?.targetId ?? 'workspace'}`;
          const exists = (state.novelAgentSuggestions ?? []).some(
            (suggestion) => suggestion.id === suggestionId,
          );
          if (exists) return {};

          return {
            novelAgentSuggestions: [
              {
                id: suggestionId,
                kind,
                targetId: payload?.targetId ?? '',
                title: kind === 'scene-completion' ? 'Agent 补全当前场景' : 'Agent 补全当前实体',
                reason: '已记录 Agent 请求。当前版本未接入模型，先保留为建议入口。',
                confidence: 0.35,
                payload,
                status: 'pending',
              },
              ...(state.novelAgentSuggestions ?? []),
            ],
          };
        }),

      markNovelAgentSuggestion: (suggestionId, status) =>
        set((state) => ({
          novelAgentSuggestions: (state.novelAgentSuggestions ?? []).map((suggestion) =>
            suggestion.id === suggestionId ? { ...suggestion, status } : suggestion,
          ),
        })),

      dismissNovelAgentSuggestion: (suggestionId) =>
        set((state) => ({
          novelAgentSuggestions: (state.novelAgentSuggestions ?? []).map((suggestion) =>
            suggestion.id === suggestionId ? { ...suggestion, status: 'dismissed' } : suggestion,
          ),
        })),

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
