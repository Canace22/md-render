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
  ensureKnowledgeFields,
  findFirstFileId,
  nameExists,
  buildUniqueName,
  createDefaultKnowledgeFields,
  createBookmarkNode,
  BOOKMARK_FOLDER_NAME,
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
  normalizeNodeType,
  sanitizeStringList,
  moveNodeInParent,
  togglePinNode,
} from './workspaceUtils.js';
import { TEMPLATES } from '../utils/wechatTemplates.js';
import { normalizeMarkdown } from '../utils/markdownUtils.js';
import { saveLocalProjectMetadata } from '../utils/localProjectBridge.js';
import { sanitizePublishingPlatforms } from '../utils/publishingPlatforms.js';

const STORAGE_KEY = 'md-renderer-workspace';
const SELECTED_ID_STORAGE_KEY = 'md-renderer-selected-id';
const THEME_STORAGE_KEY = 'md-renderer-theme';
const COPY_STYLE_STORAGE_KEY = 'md-renderer-copy-style';
const SURFACE_STORAGE_KEY = 'md-renderer-surface';
const PUBLISHING_PLATFORMS_STORAGE_KEY = 'md-renderer-publishing-platforms';
const KNOWLEDGE_HOME_MIGRATION_KEY = 'md-renderer-knowledge-home-v1';
const STORAGE_MODE_STORAGE_KEY = 'md-renderer-storage-mode';
const PROJECT_ROOT_STORAGE_KEY = 'md-renderer-project-root';
const NOTION_TOKEN_STORAGE_KEY = 'md-renderer-notion-token';
const NOTION_FILE_PAGES_STORAGE_KEY = 'md-renderer-notion-file-pages';
const NOTION_DATABASE_ID_STORAGE_KEY = 'md-renderer-notion-database-id';
const ELECTRON_DB_SAVE_DEBOUNCE_MS = 320;

/** 检测是否在 Electron 环境中且 SQLite 数据库 IPC 可用 */
const hasElectronDb = () =>
  typeof window !== 'undefined' && typeof window.electronAPI?.db === 'object';

const safeParseJSON = (value, fallback) => {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
};

const VALID_SURFACES = new Set([
  'overview',
  'canvas',
  'creation-board',
  'publishing',
  'search',
  'graph',
  'paper',
  'folder',
  'settings',
  'notion',
]);

const normalizeSurface = (surface, fallback = 'overview') => {
  return VALID_SURFACES.has(surface) ? surface : fallback;
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

/** 从 localStorage 构建标准 state 对象（在非 Electron 或 Electron 迁移时使用） */
const buildStateFromLocalStorage = () => {
  const notionSnapshot = readNotionPersistSnapshot();
  const workspaceRaw = window.localStorage.getItem(STORAGE_KEY);
  const selectedId = window.localStorage.getItem(SELECTED_ID_STORAGE_KEY);
  const theme = window.localStorage.getItem(THEME_STORAGE_KEY);
  const copyStyle = window.localStorage.getItem(COPY_STYLE_STORAGE_KEY);
  const surface = window.localStorage.getItem(SURFACE_STORAGE_KEY);
  const publishingPlatformsRaw = window.localStorage.getItem(PUBLISHING_PLATFORMS_STORAGE_KEY);
  const knowledgeHomeMigrated = window.localStorage.getItem(KNOWLEDGE_HOME_MIGRATION_KEY) === 'done';
  const storageMode = window.localStorage.getItem(STORAGE_MODE_STORAGE_KEY);
  const projectRootPath = window.localStorage.getItem(PROJECT_ROOT_STORAGE_KEY) ?? '';

  const parsedWorkspace = safeParseJSON(workspaceRaw, null);
  const normalizedWorkspace = ensureKnowledgeFields(parsedWorkspace ?? createDefaultWorkspace());
  const ws = ensureFileTimestamps(normalizedWorkspace);
  if (ws !== parsedWorkspace) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ws));
  }
  const selId = selectedId || DEFAULT_FILE_ID;
  const selectedNode = findNodeById(ws, selId);
  const markdown = selectedNode?.type === 'file' ? (selectedNode.content ?? '') : '';
  const normalizedSurface = normalizeSurface(surface, 'overview');
  const migratedSurface = !knowledgeHomeMigrated && normalizedSurface === 'paper'
    ? 'overview'
    : normalizedSurface;
  const publishingPlatforms = sanitizePublishingPlatforms(
    safeParseJSON(publishingPlatformsRaw, null),
  );
  if (!knowledgeHomeMigrated) {
    window.localStorage.setItem(KNOWLEDGE_HOME_MIGRATION_KEY, 'done');
  }
  return {
    state: {
      workspace: ws,
      selectedId: selId,
      markdown,
      theme: theme === 'light' || theme === 'dark' ? theme : 'light',
      copyStyle: copyStyle && TEMPLATES.some((t) => t.id === copyStyle) ? copyStyle : 'default',
      storageMode: storageMode === 'project' ? 'project' : 'local',
      projectRootPath,
      surface: migratedSurface,
      publishingPlatforms,
      ...notionSnapshot,
    },
    version: 0,
  };
};

/** 将 SQLite raw state map 解析为 zustand persist 格式 */
const buildStateFromDb = (raw) => {
  const workspaceRaw = raw.workspace_json ?? null;
  const parsedWorkspace = safeParseJSON(workspaceRaw, null);
  const normalizedWorkspace = ensureKnowledgeFields(parsedWorkspace ?? createDefaultWorkspace());
  const ws = ensureFileTimestamps(normalizedWorkspace);
  const selId = raw.selected_id || DEFAULT_FILE_ID;
  const selectedNode = findNodeById(ws, selId);
  const markdown = selectedNode?.type === 'file' ? (selectedNode.content ?? '') : '';
  const notionFilePages = safeParseJSON(raw.notion_file_pages, {});
  const publishingPlatforms = sanitizePublishingPlatforms(
    safeParseJSON(raw.publishing_platforms, null),
  );
  return {
    state: {
      workspace: ws,
      selectedId: selId,
      markdown,
      theme: raw.theme === 'light' || raw.theme === 'dark' ? raw.theme : 'light',
      copyStyle:
        raw.copy_style && TEMPLATES.some((t) => t.id === raw.copy_style)
          ? raw.copy_style
          : 'default',
      storageMode: raw.storage_mode === 'project' ? 'project' : 'local',
      projectRootPath: raw.project_root_path ?? '',
      surface: normalizeSurface(raw.surface, 'overview'),
      publishingPlatforms,
      notionToken: typeof raw.notion_token === 'string' ? raw.notion_token : '',
      notionFilePages:
        notionFilePages && typeof notionFilePages === 'object' ? notionFilePages : {},
      notionDatabaseId:
        typeof raw.notion_database_id === 'string' ? raw.notion_database_id : '',
    },
    version: 0,
  };
};

/** 将 state 对象序列化为 SQLite app_state 键值对 */
const buildStateMap = (state) => {
  const map = {};
  if (state.workspace) map.workspace_json = JSON.stringify(state.workspace);
  if (state.selectedId) map.selected_id = state.selectedId;
  if (state.theme) map.theme = state.theme;
  if (state.copyStyle) map.copy_style = state.copyStyle;
  if (state.surface) map.surface = state.surface;
  if (state.publishingPlatforms != null) {
    map.publishing_platforms = JSON.stringify(
      sanitizePublishingPlatforms(state.publishingPlatforms),
    );
  }
  if (state.storageMode) map.storage_mode = state.storageMode;
  if (state.projectRootPath != null) map.project_root_path = state.projectRootPath;
  if (state.notionToken != null) map.notion_token = state.notionToken;
  if (state.notionFilePages != null) map.notion_file_pages = JSON.stringify(state.notionFilePages);
  if (state.notionDatabaseId != null) map.notion_database_id = state.notionDatabaseId;
  return map;
};

let electronSaveTimer = null;
let pendingElectronStateMap = null;
let pendingElectronWorkspaceJson = null;

const flushElectronStateSave = () => {
  const stateMap = pendingElectronStateMap;
  const workspaceJson = pendingElectronWorkspaceJson;

  pendingElectronStateMap = null;
  pendingElectronWorkspaceJson = null;

  if (!stateMap || !hasElectronDb()) return;

  window.electronAPI.db.save(stateMap, workspaceJson).catch((e) => {
    console.error('[store] SQLite 保存失败:', e);
  });
};

const scheduleElectronStateSave = (stateMap, workspaceJson) => {
  if (!stateMap || typeof stateMap !== 'object' || !hasElectronDb()) return;

  pendingElectronStateMap = {
    ...(pendingElectronStateMap ?? {}),
    ...stateMap,
  };
  pendingElectronWorkspaceJson = workspaceJson;

  if (electronSaveTimer) {
    window.clearTimeout(electronSaveTimer);
  }

  electronSaveTimer = window.setTimeout(() => {
    electronSaveTimer = null;
    flushElectronStateSave();
  }, ELECTRON_DB_SAVE_DEBOUNCE_MS);
};

/** 兼容现有 localStorage 多 key 的持久化存储，Electron 环境下切换到 SQLite */
const editorStorage = {
  getItem: async () => {
    if (typeof window === 'undefined') return null;

    if (hasElectronDb()) {
      try {
        const migrated = await window.electronAPI.db.isMigrated();
        if (!migrated) {
          // 首次启动：从 localStorage 迁移数据到 SQLite
          const localState = buildStateFromLocalStorage();
          const stateMap = buildStateMap(localState.state);
          await window.electronAPI.db.migrate(stateMap);
          return localState;
        }
        // 已迁移：从 SQLite 加载
        const res = await window.electronAPI.db.load();
        if (res.ok && res.state && res.state.workspace_json) {
          return buildStateFromDb(res.state);
        }
        // SQLite 无数据时回退到 localStorage
        return buildStateFromLocalStorage();
      } catch (e) {
        console.error('[store] SQLite 加载失败，回退到 localStorage:', e);
        return buildStateFromLocalStorage();
      }
    }

    // Web 环境：原有 localStorage 逻辑
    try {
      return buildStateFromLocalStorage();
    } catch (e) {
      console.error('加载编辑器状态失败:', e);
      const notionSnapshot = readNotionPersistSnapshot();
      return {
        state: {
          workspace: createDefaultWorkspace(),
          selectedId: DEFAULT_FILE_ID,
          markdown: getDefaultMarkdown(),
          theme: 'light',
          copyStyle: 'default',
          storageMode: 'local',
          projectRootPath: '',
          surface: 'overview',
          publishingPlatforms: sanitizePublishingPlatforms([]),
          ...notionSnapshot,
        },
        version: 0,
      };
    }
  },
  setItem: async (_, value) => {
    if (typeof window === 'undefined') return;
    const state = value?.state ?? value;

    if (hasElectronDb()) {
      try {
        const stateMap = buildStateMap(state);
        const workspaceJson = stateMap.workspace_json ?? null;
        scheduleElectronStateSave(stateMap, workspaceJson);
      } catch (e) {
        console.error('[store] SQLite 保存异常:', e);
      }
      // 同时写 localStorage 作为快速回退（数据量小的字段）
      try {
        persistNotionSnapshot(state);
        if (state.theme) window.localStorage.setItem(THEME_STORAGE_KEY, state.theme);
        if (state.copyStyle) window.localStorage.setItem(COPY_STYLE_STORAGE_KEY, state.copyStyle);
        if (state.surface) window.localStorage.setItem(SURFACE_STORAGE_KEY, state.surface);
        if (state.publishingPlatforms != null) {
          window.localStorage.setItem(
            PUBLISHING_PLATFORMS_STORAGE_KEY,
            JSON.stringify(sanitizePublishingPlatforms(state.publishingPlatforms)),
          );
        }
      } catch { /* ignore */ }
      return;
    }

    // Web 环境：原有 localStorage 逻辑
    try {
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
      if (state.publishingPlatforms != null) {
        window.localStorage.setItem(
          PUBLISHING_PLATFORMS_STORAGE_KEY,
          JSON.stringify(sanitizePublishingPlatforms(state.publishingPlatforms)),
        );
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
    publishingPlatforms: state.publishingPlatforms,
    notionToken: state.notionToken,
    notionFilePages: state.notionFilePages,
    notionDatabaseId: state.notionDatabaseId,
  }),
};

const persistWorkspace = (workspace) => {
  if (typeof window === 'undefined') return;
  if (hasElectronDb()) {
    const workspaceJson = JSON.stringify(workspace);
    scheduleElectronStateSave({ workspace_json: workspaceJson }, workspaceJson);
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
  } catch (err) {
    console.error('保存工作区失败:', err);
  }
};

const normalizeCanvasPosition = (value, fallback = 0) => {
  return Number.isFinite(value) ? value : fallback;
};

const sanitizeCanvasNode = (node = {}, index = 0) => {
  const sourceId = String(node.sourceId ?? node.fileId ?? node.id ?? '').trim();
  if (!sourceId) return null;
  const position = node.position ?? {};
  return {
    id: String(node.id ?? `canvas-${sourceId}`),
    sourceId,
    position: {
      x: normalizeCanvasPosition(position.x, index * 48),
      y: normalizeCanvasPosition(position.y, index * 48),
    },
  };
};

const sanitizeCanvasEdge = (edge = {}) => {
  const id = String(edge.id ?? '').trim();
  const source = String(edge.source ?? '').trim();
  const target = String(edge.target ?? '').trim();
  if (!id || !source || !target || source === target) return null;
  return { id, source, target };
};

const sanitizeCanvasState = (canvasState = {}) => {
  const nodes = Array.isArray(canvasState?.nodes)
    ? canvasState.nodes.map((node, index) => sanitizeCanvasNode(node, index)).filter(Boolean)
    : [];
  const edges = Array.isArray(canvasState?.edges)
    ? canvasState.edges.map((edge) => sanitizeCanvasEdge(edge)).filter(Boolean)
    : [];
  return { nodes, edges };
};

const areCanvasStatesEqual = (left, right) => {
  return JSON.stringify(sanitizeCanvasState(left)) === JSON.stringify(sanitizeCanvasState(right));
};

const buildLocalProjectMetadataPayload = (node) => {
  if (!node || node.type !== 'file' || !node.projectRootPath || !node.relativePath) {
    return null;
  }
  return {
    projectRootPath: node.projectRootPath,
    relativePath: node.relativePath,
    metadata: {
      nodeType: node.nodeType,
      summary: node.summary,
      url: node.url,
      aliases: node.aliases,
      relatedIds: node.relatedIds,
      draftStatus: node.draftStatus,
      targetPlatforms: node.targetPlatforms,
      scheduledPublishAt: node.scheduledPublishAt,
      sourceMaterialIds: node.sourceMaterialIds,
      tags: node.tags,
    },
  };
};

const persistLocalProjectMetadata = (node) => {
  const payload = buildLocalProjectMetadataPayload(node);
  if (!payload) return;
  saveLocalProjectMetadata(payload).catch((error) => {
    console.error('[store] 本地项目元数据保存失败:', error);
  });
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

const preserveConvertedPreviewContent = (node, currentWorkspace) => {
  if (!node) return node;

  if (node.type === 'file') {
    const existingNode = findNodeById(currentWorkspace, node.id);
    const shouldReuseConvertedContent = node.needsConversion
      && node.content == null
      && existingNode?.type === 'file'
      && existingNode.content != null
      && existingNode.updatedAt === node.updatedAt;

    return shouldReuseConvertedContent
      ? { ...node, content: existingNode.content }
      : node;
  }

  if (node.type === 'folder' && Array.isArray(node.children)) {
    return {
      ...node,
      children: node.children.map((child) => preserveConvertedPreviewContent(child, currentWorkspace)),
    };
  }

  return node;
};

export const useEditorStore = create(
  persist(
    (set, get) => ({
      workspace: createDefaultWorkspace(),
      selectedId: DEFAULT_FILE_ID,
      markdown: getDefaultMarkdown(),
      sidebarCollapsed: false,
      tocCollapsed: true,
      theme: 'light',
      copyStyle: 'default',
      storageMode: 'local',
      projectRootPath: '',
      publishingPlatforms: sanitizePublishingPlatforms([]),
      /** 正在等待 debounce 写入磁盘的文件 id */
      diskSavePendingFileIds: {},
      /** 磁盘外部变更触发编辑器重载（递增） */
      editorReloadToken: 0,
      /** 本地项目磁盘冲突待用户选择 */
      localProjectConflict: null,
      /** 通知渲染进程取消待写入磁盘的定时器 */
      diskSaveCancelSeq: 0,
      diskSaveCancelFileIds: [],
      surface: 'overview',
      /** Obsidian 风格多标签页：已打开的文件 tab 列表 [{id, title}] */
      openTabs: [],
      /** 编辑器模式：'edit' | 'preview' */
      editorMode: 'edit',
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

      toggleTocCollapsed: () => set((s) => ({ tocCollapsed: !s.tocCollapsed })),

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
      setPublishingPlatforms: (publishingPlatforms) => {
        set({ publishingPlatforms: sanitizePublishingPlatforms(publishingPlatforms) });
      },
      setSurface: (surface) => set({ surface: normalizeSurface(surface, 'overview') }),
      setWorkspaceCanvas: (canvasState) => {
        const { workspace } = get();
        if (areCanvasStatesEqual(workspace?.canvasState, canvasState)) {
          return;
        }
        const nextWorkspace = {
          ...workspace,
          canvasState: sanitizeCanvasState(canvasState),
        };
        persistWorkspace(nextWorkspace);
        set({ workspace: nextWorkspace });
      },

      /** 切换编辑/预览模式 */
      setEditorMode: (mode) => set({ editorMode: mode === 'preview' ? 'preview' : 'edit' }),
      toggleEditorMode: () => set((s) => ({ editorMode: s.editorMode === 'preview' ? 'edit' : 'preview' })),

      /** 打开一个标签页（不重复添加） */
      openTab: (fileId, title) => set((state) => {
        const exists = state.openTabs.some((t) => t.id === fileId);
        if (exists) return {};
        return { openTabs: [...state.openTabs, { id: fileId, title: title || '未命名' }] };
      }),

      /** 关闭标签页，若关闭的是当前激活的，切换到相邻标签 */
      closeTab: (fileId) => set((state) => {
        const idx = state.openTabs.findIndex((t) => t.id === fileId);
        if (idx === -1) return {};
        const nextTabs = state.openTabs.filter((t) => t.id !== fileId);
        if (state.selectedId !== fileId) return { openTabs: nextTabs };
        // 关闭的是当前激活的 tab，切换到相邻
        if (nextTabs.length === 0) return { openTabs: nextTabs, surface: 'overview' };
        const nextIdx = Math.min(idx, nextTabs.length - 1);
        const nextTab = nextTabs[nextIdx];
        const node = findNodeById(state.workspace, nextTab.id);
        return {
          openTabs: nextTabs,
          selectedId: nextTab.id,
          markdown: node?.content ?? '',
          surface: node?.type === 'folder' ? 'folder' : 'paper',
        };
      }),

      /** 关闭所有标签页 */
      closeAllTabs: () => set({ openTabs: [], surface: 'overview' }),

      /** 关闭其他标签页（保留指定 tab） */
      closeOtherTabs: (fileId) => set((state) => {
        const kept = state.openTabs.filter((t) => t.id === fileId);
        if (kept.length === 0) return { openTabs: [], surface: 'overview' };
        // 若保留的不是当前激活的，切换过去
        if (state.selectedId === fileId) return { openTabs: kept };
        const node = findNodeById(state.workspace, fileId);
        return {
          openTabs: kept,
          selectedId: fileId,
          markdown: node?.content ?? '',
          surface: node?.type === 'folder' ? 'folder' : 'paper',
        };
      }),

      /** 关闭右侧标签页 */
      closeTabsToTheRight: (fileId) => set((state) => {
        const idx = state.openTabs.findIndex((t) => t.id === fileId);
        if (idx === -1) return {};
        const kept = state.openTabs.slice(0, idx + 1);
        const removedIds = new Set(state.openTabs.slice(idx + 1).map((t) => t.id));
        if (!removedIds.has(state.selectedId)) return { openTabs: kept };
        // 当前激活的被关了，切到目标 tab
        const node = findNodeById(state.workspace, fileId);
        return {
          openTabs: kept,
          selectedId: fileId,
          markdown: node?.content ?? '',
          surface: node?.type === 'folder' ? 'folder' : 'paper',
        };
      }),

      /** 更新标签页标题（重命名时） */
      updateTabTitle: (fileId, title) => set((state) => ({
        openTabs: state.openTabs.map((t) => t.id === fileId ? { ...t, title } : t),
      })),

      setActiveBlockId: (id) => set({ activeBlockId: id }),
      setActiveBlockDraft: (draft) => set({ activeBlockDraft: draft }),
      cancelActiveBlock: () => set({ activeBlockId: null, activeBlockDraft: '' }),

      selectNode: (nodeId) => {
        const { workspace, openTabs } = get();
        const node = findNodeById(workspace, nodeId);
        const isFolder = node?.type === 'folder';
        const markdown = isFolder ? get().markdown : (node?.content ?? '');
        const patch = {
          surface: isFolder ? 'folder' : 'paper',
          activeBlockId: null,
          activeBlockDraft: '',
          selectedId: nodeId,
          markdown,
        };
        // 打开文件时自动添加 tab
        if (!isFolder && node) {
          const exists = openTabs.some((t) => t.id === nodeId);
          if (!exists) {
            patch.openTabs = [...openTabs, { id: nodeId, title: node.name || '未命名' }];
          }
        }
        set(patch);
      },

      updateSelectedFileContent: (nextMarkdown) => {
        const { workspace, selectedId } = get();
        const updated = updateNodeById(workspace, selectedId, (node) => {
          if (node.type !== 'file') return node;
          const patch = {
            ...node,
            content: nextMarkdown,
            updatedAt: Date.now(),
          };
          if (node.projectRootPath && node.diskContentSnapshot === undefined) {
            patch.diskContentSnapshot = node.content ?? '';
          }
          return patch;
        });
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
        const nextNode = findNodeById(updated, fileId);
        persistWorkspace(updated);
        set({ workspace: updated });
        persistLocalProjectMetadata(nextNode);
      },

      setFileKnowledgeMeta: (fileId, patch) => {
        const { workspace } = get();
        const updated = updateNodeById(workspace, fileId, (node) => {
          if (node.type !== 'file') return node;
          const nextPatch = {};
          if (Object.prototype.hasOwnProperty.call(patch ?? {}, 'nodeType')) {
            nextPatch.nodeType = normalizeNodeType(patch.nodeType);
          }
          if (Object.prototype.hasOwnProperty.call(patch ?? {}, 'summary')) {
            nextPatch.summary = String(patch.summary ?? '').trim();
          }
          if (Object.prototype.hasOwnProperty.call(patch ?? {}, 'aliases')) {
            nextPatch.aliases = sanitizeStringList(patch.aliases);
          }
          if (Object.prototype.hasOwnProperty.call(patch ?? {}, 'relatedIds')) {
            nextPatch.relatedIds = sanitizeStringList(patch.relatedIds);
          }
          if (Object.prototype.hasOwnProperty.call(patch ?? {}, 'draftStatus')) {
            nextPatch.draftStatus = String(patch.draftStatus ?? '').trim();
          }
          if (Object.prototype.hasOwnProperty.call(patch ?? {}, 'targetPlatforms')) {
            nextPatch.targetPlatforms = sanitizeStringList(patch.targetPlatforms);
          }
          if (Object.prototype.hasOwnProperty.call(patch ?? {}, 'scheduledPublishAt')) {
            nextPatch.scheduledPublishAt = String(patch.scheduledPublishAt ?? '').trim();
          }
          if (Object.prototype.hasOwnProperty.call(patch ?? {}, 'sourceMaterialIds')) {
            nextPatch.sourceMaterialIds = sanitizeStringList(patch.sourceMaterialIds);
          }
          return { ...node, ...createDefaultKnowledgeFields(node), ...nextPatch };
        });
        const nextNode = findNodeById(updated, fileId);
        persistWorkspace(updated);
        set({ workspace: updated });
        persistLocalProjectMetadata(nextNode);
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
        const nextWorkspace = addChildNode(withoutDuplicate, withoutDuplicate.id, projectNode, true);
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
        const cleaned = stripLocalProjectMounts(workspace, projectRootPath);
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
          const markedRoot = markLocalProjectNode(preserveDirtyInTree(diskTree), projectRootPath, true);
          const freshRoot = preserveConvertedPreviewContent(markedRoot, state.workspace);
          if (freshRoot) {
            nextWorkspace = replaceLocalProjectMount(state.workspace, projectRootPath, freshRoot);
          }
        } else if (Array.isArray(projectsChildren)) {
          const children = projectsChildren.map((child) => {
            const childWithPreview = preserveConvertedPreviewContent(child, state.workspace);
            if (child.type !== 'file' || !shouldPreserveFile(child.id)) return childWithPreview;
            const localContent = child.id === state.selectedId
              ? state.markdown
              : (findNodeById(state.workspace, child.id)?.content ?? childWithPreview.content ?? '');
            return { ...childWithPreview, content: localContent };
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

      /**
       * 批量导入书签。自动在工作区根下找到/新建「书签」目录，按 url 去重后建节点入库。
       * 返回 { added, skipped, folderId }。
       */
      importBookmarks: (items) => {
        const list = (Array.isArray(items) ? items : []).filter((item) => item?.url);
        if (list.length === 0) return { added: 0, skipped: 0, folderId: null };

        const { workspace } = get();
        let nextWorkspace = workspace;

        // 找已存在的「书签」目录（用 bookmarkFolder 标记定位，避免与同名手建目录混淆）
        let folder = (workspace.children ?? []).find(
          (child) => child.type === 'folder' && child.bookmarkFolder,
        );
        let folderId;
        if (folder) {
          folderId = folder.id;
        } else {
          folderId = createId('folder');
          const newFolder = {
            id: folderId,
            type: 'folder',
            name: buildUniqueName(workspace, BOOKMARK_FOLDER_NAME),
            bookmarkFolder: true,
            children: [],
          };
          nextWorkspace = addChildNode(workspace, workspace.id, newFolder, true);
        }

        const targetFolder = findNodeById(nextWorkspace, folderId);
        const existingUrls = new Set(
          (targetFolder?.children ?? []).map((child) => child.url).filter(Boolean),
        );

        let added = 0;
        let skipped = 0;
        let firstId = null;
        for (const item of list) {
          if (existingUrls.has(item.url)) {
            skipped += 1;
            continue;
          }
          const node = createBookmarkNode(item);
          existingUrls.add(item.url);
          nextWorkspace = addChildNode(nextWorkspace, folderId, node, true);
          if (!firstId) firstId = node.id;
          added += 1;
        }

        if (nextWorkspace === workspace) {
          return { added: 0, skipped, folderId };
        }

        persistWorkspace(nextWorkspace);
        const patch = { workspace: nextWorkspace };
        if (firstId) {
          patch.selectedId = firstId;
          patch.surface = 'paper';
          patch.markdown = '';
          patch.activeBlockId = null;
          patch.activeBlockDraft = '';
        }
        set(patch);
        return { added, skipped, folderId };
      },

      addFile: (contextNodeId) => {
        const { workspace, selectedId } = get();
        const fileId = createId('file');
        const name = buildUniqueName(workspace, '未命名', '.md');
        const newFile = {
          id: fileId,
          type: 'file',
          name,
          content: '',
          ...createDefaultKnowledgeFields(),
        };
        const targetFolderId = resolveTargetFolderId(workspace, contextNodeId ?? selectedId);
        const targetFolder = findNodeById(workspace, targetFolderId);
        if (targetFolder?.projectRootPath) return false;
        const nextWorkspace = addChildNode(workspace, targetFolderId, newFile, true);
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
        const nextWorkspace = addChildNode(workspace, targetFolderId, newFolder, true);
        persistWorkspace(nextWorkspace);
        set({ workspace: nextWorkspace, selectedId: folderId, surface: 'folder' });
        return true;
      },

      moveNode: (fromId, toId) => {
        const { workspace } = get();
        const nextWorkspace = moveNodeInParent(workspace, fromId, toId);
        if (nextWorkspace === workspace) return;
        persistWorkspace(nextWorkspace);
        set({ workspace: nextWorkspace });
      },

      pinNode: (targetId) => {
        const { workspace } = get();
        const nextWorkspace = togglePinNode(workspace, targetId);
        if (nextWorkspace === workspace) return;
        persistWorkspace(nextWorkspace);
        set({ workspace: nextWorkspace });
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
        const normalized = ensureKnowledgeFields(imported);
        const firstFileId = findFirstFileId(normalized);
        const initialId = firstFileId ?? normalized?.id ?? 'root';
        const node = findNodeById(normalized, initialId);
        persistWorkspace(normalized);
        set({
          workspace: normalized,
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
        const normalizedNode = ensureKnowledgeFields(node);
        const nextWorkspace = addChildNode(workspace, workspace.id, normalizedNode, true);
        const initialId = findFirstFileId(normalizedNode) ?? normalizedNode.id;
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
        const nextWorkspace = addChildNode(workspace, parentFolderId, node, true);
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
        // 非 Markdown 文件（needsConversion）content 为 null，跳过同步
        if (selectedFile.needsConversion && selectedFile.content == null) return;
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
