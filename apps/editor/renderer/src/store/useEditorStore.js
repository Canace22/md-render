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
import {
  createLocalProjectFileOnDisk,
  ensureMdRenderWorkspace,
  readDailyWorkspaceBackup,
  saveDailyWorkspaceBackup,
  saveLocalProjectMetadata,
} from '../utils/localProjectBridge.js';
import {
  addDailyEntryItem,
  addTodoPoolItem,
  carryOverIncompleteTasks,
  getTodayDateKey,
  mergeDailyWorkspaces,
  moveDailyEntryItem,
  normalizeDailyWorkspace,
  promoteTodoToDaily,
  removeDailyEntryItem,
  removeTodoPoolItem,
  sendDailyEntryTaskToTodo,
  setDailyCurrentDate as setDailyWorkspaceCurrentDate,
  toggleDailyEntryTaskDone,
  updateDailyEntryItem,
  updateDailyEntryItemPriority,
} from '../utils/dailyWorkspace.js';
import { sanitizePublishingPlatforms } from '../utils/publishingPlatforms.js';
import {
  buildCloudWorkspacePayload,
  getDefaultCloudSyncBaseUrl,
  getCloudPayloadHash,
  normalizeCloudSyncBaseUrl,
} from '../utils/cloudSyncService.js';
import {
  createSession,
  deriveTitle,
  mapSession,
  removeSession,
} from '../core/agent/sessionUtils.js';

const STORAGE_KEY = 'md-renderer-workspace';
const SELECTED_ID_STORAGE_KEY = 'md-renderer-selected-id';
const THEME_STORAGE_KEY = 'md-renderer-theme';
const COPY_STYLE_STORAGE_KEY = 'md-renderer-copy-style';
const SURFACE_STORAGE_KEY = 'md-renderer-surface';
const PUBLISHING_PLATFORMS_STORAGE_KEY = 'md-renderer-publishing-platforms';
const KNOWLEDGE_HOME_MIGRATION_KEY = 'md-renderer-knowledge-home-v1';
const STORAGE_MODE_STORAGE_KEY = 'md-renderer-storage-mode';
const PROJECT_ROOT_STORAGE_KEY = 'md-renderer-project-root';
const DAILY_WORKSPACE_STORAGE_KEY = 'md-renderer-daily-workspace';
const NOTION_TOKEN_STORAGE_KEY = 'md-renderer-notion-token';
const NOTION_FILE_PAGES_STORAGE_KEY = 'md-renderer-notion-file-pages';
const NOTION_DATABASE_ID_STORAGE_KEY = 'md-renderer-notion-database-id';
// 与 notionService.js 中同名常量保持一致：服务层直接从这个 key 读运行时反代地址
const NOTION_PROXY_STORAGE_KEY = 'md-renderer-notion-proxy';
const CLOUD_SYNC_BASE_URL_STORAGE_KEY = 'md-renderer-cloud-sync-base-url';
const CLOUD_WORKSPACE_ID_STORAGE_KEY = 'md-renderer-cloud-workspace-id';
const CLOUD_LAST_SYNCED_REVISION_STORAGE_KEY = 'md-renderer-cloud-last-synced-revision';
const CLOUD_LAST_SYNCED_AT_STORAGE_KEY = 'md-renderer-cloud-last-synced-at';
const CLOUD_CLIENT_ID_STORAGE_KEY = 'md-renderer-cloud-client-id';
const CLOUD_LAST_SYNCED_HASH_STORAGE_KEY = 'md-renderer-cloud-last-synced-hash';
const ELECTRON_DB_SAVE_DEBOUNCE_MS = 320;
const MARKDOWN_FILE_EXTENSION = '.md';

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

const readPersistedString = (key) => {
  try {
    return window.localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
};

const createCloudClientId = () => {
  if (typeof window !== 'undefined' && window.crypto?.randomUUID) {
    return `md-render-${window.crypto.randomUUID()}`;
  }
  return `md-render-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
};

const sanitizeCloudRevision = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

const VALID_SURFACES = new Set([
  'overview',
  'daily',
  'canvas',
  'creation-board',
  'publishing',
  'search',
  'graph',
  'paper',
  'folder',
  'settings',
  'notion',
  'sync',
]);

const normalizeSurface = (surface, fallback = 'overview') => {
  return VALID_SURFACES.has(surface) ? surface : fallback;
};

const sanitizeGeneratedFileBaseName = (name, fallback = 'AI 生成') => {
  const trimmed = String(name ?? '').trim().replace(/[\\/]+/g, ' ');
  const withoutExtension = trimmed.replace(/\.md$/i, '').trim();
  return withoutExtension || fallback;
};

const buildGeneratedFileName = (folder, desiredName, fallbackBase = 'AI 生成') => {
  const baseName = sanitizeGeneratedFileBaseName(desiredName, fallbackBase);
  return buildUniqueNameInFolder(folder, baseName, MARKDOWN_FILE_EXTENSION);
};

/** 避免启动时用空 Notion 配置覆盖 localStorage 中已有值 */
let editorPersistHydrated = false;

const readNotionPersistSnapshot = () => {
  try {
    const notionToken = window.localStorage.getItem(NOTION_TOKEN_STORAGE_KEY) ?? '';
    const notionFilePagesRaw = window.localStorage.getItem(NOTION_FILE_PAGES_STORAGE_KEY);
    const notionFilePages = safeParseJSON(notionFilePagesRaw, {});
    const notionDatabaseId = window.localStorage.getItem(NOTION_DATABASE_ID_STORAGE_KEY) ?? '';
    const notionProxyBase = window.localStorage.getItem(NOTION_PROXY_STORAGE_KEY) ?? '';
    return {
      notionToken: typeof notionToken === 'string' ? notionToken : '',
      notionFilePages:
        notionFilePages && typeof notionFilePages === 'object' ? notionFilePages : {},
      notionDatabaseId: typeof notionDatabaseId === 'string' ? notionDatabaseId : '',
      notionProxyBase: typeof notionProxyBase === 'string' ? notionProxyBase : '',
    };
  } catch {
    return { notionToken: '', notionFilePages: {}, notionDatabaseId: '', notionProxyBase: '' };
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
  persistNotionStringField(NOTION_PROXY_STORAGE_KEY, state.notionProxyBase);
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
  const dailyWorkspaceRaw = window.localStorage.getItem(DAILY_WORKSPACE_STORAGE_KEY);
  const knowledgeHomeMigrated = window.localStorage.getItem(KNOWLEDGE_HOME_MIGRATION_KEY) === 'done';
  const storageMode = window.localStorage.getItem(STORAGE_MODE_STORAGE_KEY);
  const projectRootPath = window.localStorage.getItem(PROJECT_ROOT_STORAGE_KEY) ?? '';
  const cloudClientId = readPersistedString(CLOUD_CLIENT_ID_STORAGE_KEY) || createCloudClientId();

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
  const dailyWorkspace = normalizeDailyWorkspace(safeParseJSON(dailyWorkspaceRaw, null));
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
      dailyWorkspace,
      cloudSyncBaseUrl: normalizeCloudSyncBaseUrl(
        readPersistedString(CLOUD_SYNC_BASE_URL_STORAGE_KEY) || getDefaultCloudSyncBaseUrl(),
      ),
      cloudWorkspaceId: readPersistedString(CLOUD_WORKSPACE_ID_STORAGE_KEY).trim(),
      cloudLastSyncedRevision: sanitizeCloudRevision(readPersistedString(CLOUD_LAST_SYNCED_REVISION_STORAGE_KEY)),
      cloudLastSyncedAt: readPersistedString(CLOUD_LAST_SYNCED_AT_STORAGE_KEY),
      cloudClientId,
      cloudLastSyncedHash: readPersistedString(CLOUD_LAST_SYNCED_HASH_STORAGE_KEY),
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
  const dailyWorkspace = normalizeDailyWorkspace(
    safeParseJSON(raw.daily_workspace_json, null),
  );
  const cloudClientId =
    typeof raw.cloud_client_id === 'string' && raw.cloud_client_id.trim()
      ? raw.cloud_client_id
      : createCloudClientId();
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
      dailyWorkspace,
      cloudSyncBaseUrl: normalizeCloudSyncBaseUrl(raw.cloud_sync_base_url || getDefaultCloudSyncBaseUrl()),
      cloudWorkspaceId: typeof raw.cloud_workspace_id === 'string' ? raw.cloud_workspace_id : '',
      cloudLastSyncedRevision: sanitizeCloudRevision(raw.cloud_last_synced_revision),
      cloudLastSyncedAt: typeof raw.cloud_last_synced_at === 'string' ? raw.cloud_last_synced_at : '',
      cloudClientId,
      cloudLastSyncedHash: typeof raw.cloud_last_synced_hash === 'string' ? raw.cloud_last_synced_hash : '',
      notionToken: typeof raw.notion_token === 'string' ? raw.notion_token : '',
      notionFilePages:
        notionFilePages && typeof notionFilePages === 'object' ? notionFilePages : {},
      notionDatabaseId:
        typeof raw.notion_database_id === 'string' ? raw.notion_database_id : '',
      notionProxyBase:
        typeof raw.notion_proxy_base === 'string' ? raw.notion_proxy_base : '',
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
  if (state.dailyWorkspace != null) {
    map.daily_workspace_json = JSON.stringify(normalizeDailyWorkspace(state.dailyWorkspace));
  }
  if (state.storageMode) map.storage_mode = state.storageMode;
  if (state.projectRootPath != null) map.project_root_path = state.projectRootPath;
  if (state.notionToken != null) map.notion_token = state.notionToken;
  if (state.notionFilePages != null) map.notion_file_pages = JSON.stringify(state.notionFilePages);
  if (state.notionDatabaseId != null) map.notion_database_id = state.notionDatabaseId;
  if (state.notionProxyBase != null) map.notion_proxy_base = state.notionProxyBase;
  if (state.cloudSyncBaseUrl != null) map.cloud_sync_base_url = normalizeCloudSyncBaseUrl(state.cloudSyncBaseUrl);
  if (state.cloudWorkspaceId != null) map.cloud_workspace_id = String(state.cloudWorkspaceId);
  if (state.cloudLastSyncedRevision != null) {
    map.cloud_last_synced_revision = String(sanitizeCloudRevision(state.cloudLastSyncedRevision));
  }
  if (state.cloudLastSyncedAt != null) map.cloud_last_synced_at = String(state.cloudLastSyncedAt);
  if (state.cloudClientId != null) map.cloud_client_id = String(state.cloudClientId);
  if (state.cloudLastSyncedHash != null) map.cloud_last_synced_hash = String(state.cloudLastSyncedHash);
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
          const localFallbackState = buildStateFromLocalStorage();
          const localFallbackMap = buildStateMap(localFallbackState.state);
          return buildStateFromDb({
            ...localFallbackMap,
            ...res.state,
          });
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
          dailyWorkspace: normalizeDailyWorkspace(null),
          cloudSyncBaseUrl: getDefaultCloudSyncBaseUrl(),
          cloudWorkspaceId: '',
          cloudLastSyncedRevision: 0,
          cloudLastSyncedAt: '',
          cloudClientId: createCloudClientId(),
          cloudLastSyncedHash: '',
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
        if (state.dailyWorkspace != null) {
          window.localStorage.setItem(
            DAILY_WORKSPACE_STORAGE_KEY,
            JSON.stringify(normalizeDailyWorkspace(state.dailyWorkspace)),
          );
        }
        if (state.cloudSyncBaseUrl != null) {
          window.localStorage.setItem(
            CLOUD_SYNC_BASE_URL_STORAGE_KEY,
            normalizeCloudSyncBaseUrl(state.cloudSyncBaseUrl),
          );
        }
        if (state.cloudWorkspaceId != null) {
          window.localStorage.setItem(CLOUD_WORKSPACE_ID_STORAGE_KEY, String(state.cloudWorkspaceId));
        }
        if (state.cloudLastSyncedRevision != null) {
          window.localStorage.setItem(
            CLOUD_LAST_SYNCED_REVISION_STORAGE_KEY,
            String(sanitizeCloudRevision(state.cloudLastSyncedRevision)),
          );
        }
        if (state.cloudLastSyncedAt != null) {
          window.localStorage.setItem(CLOUD_LAST_SYNCED_AT_STORAGE_KEY, String(state.cloudLastSyncedAt));
        }
        if (state.cloudClientId != null) {
          window.localStorage.setItem(CLOUD_CLIENT_ID_STORAGE_KEY, String(state.cloudClientId));
        }
        if (state.cloudLastSyncedHash != null) {
          window.localStorage.setItem(CLOUD_LAST_SYNCED_HASH_STORAGE_KEY, String(state.cloudLastSyncedHash));
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
      if (state.dailyWorkspace != null) {
        window.localStorage.setItem(
          DAILY_WORKSPACE_STORAGE_KEY,
          JSON.stringify(normalizeDailyWorkspace(state.dailyWorkspace)),
        );
      }
      if (state.cloudSyncBaseUrl != null) {
        window.localStorage.setItem(
          CLOUD_SYNC_BASE_URL_STORAGE_KEY,
          normalizeCloudSyncBaseUrl(state.cloudSyncBaseUrl),
        );
      }
      if (state.cloudWorkspaceId != null) {
        window.localStorage.setItem(CLOUD_WORKSPACE_ID_STORAGE_KEY, String(state.cloudWorkspaceId));
      }
      if (state.cloudLastSyncedRevision != null) {
        window.localStorage.setItem(
          CLOUD_LAST_SYNCED_REVISION_STORAGE_KEY,
          String(sanitizeCloudRevision(state.cloudLastSyncedRevision)),
        );
      }
      if (state.cloudLastSyncedAt != null) {
        window.localStorage.setItem(CLOUD_LAST_SYNCED_AT_STORAGE_KEY, String(state.cloudLastSyncedAt));
      }
      if (state.cloudClientId != null) {
        window.localStorage.setItem(CLOUD_CLIENT_ID_STORAGE_KEY, String(state.cloudClientId));
      }
      if (state.cloudLastSyncedHash != null) {
        window.localStorage.setItem(CLOUD_LAST_SYNCED_HASH_STORAGE_KEY, String(state.cloudLastSyncedHash));
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
    dailyWorkspace: state.dailyWorkspace,
    cloudSyncBaseUrl: state.cloudSyncBaseUrl,
    cloudWorkspaceId: state.cloudWorkspaceId,
    cloudLastSyncedRevision: state.cloudLastSyncedRevision,
    cloudLastSyncedAt: state.cloudLastSyncedAt,
    cloudClientId: state.cloudClientId,
    cloudLastSyncedHash: state.cloudLastSyncedHash,
    notionToken: state.notionToken,
    notionFilePages: state.notionFilePages,
    notionDatabaseId: state.notionDatabaseId,
    notionProxyBase: state.notionProxyBase,
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

const CANVAS_NODE_POSITION_STEP = 48;
const CANVAS_NODE_TEXT_FIELDS = [
  'title',
  'summary',
  'typeLabel',
  'metaLine',
  'nodeType',
  'cardKind',
  'content',
  'status',
  'url',
];
const CANVAS_NODE_LIST_FIELDS = ['tags', 'platforms'];
const CANVAS_ENGINE_EXCALIDRAW = 'excalidraw';

const sanitizeCanvasNode = (node = {}, index = 0) => {
  const sourceId = String(node.sourceId ?? node.fileId ?? node.id ?? '').trim();
  if (!sourceId) return null;
  const position = node.position ?? {};
  const sanitized = {
    id: String(node.id ?? `canvas-${sourceId}`),
    sourceId,
    position: {
      x: normalizeCanvasPosition(position.x, index * CANVAS_NODE_POSITION_STEP),
      y: normalizeCanvasPosition(position.y, index * CANVAS_NODE_POSITION_STEP),
    },
  };

  CANVAS_NODE_TEXT_FIELDS.forEach((field) => {
    if (!Object.prototype.hasOwnProperty.call(node, field)) return;
    sanitized[field] = field === 'content'
      ? String(node[field] ?? '')
      : String(node[field] ?? '').trim();
  });
  CANVAS_NODE_LIST_FIELDS.forEach((field) => {
    if (!Array.isArray(node[field])) return;
    sanitized[field] = node[field].map((item) => String(item ?? '').trim()).filter(Boolean);
  });
  if (Number.isFinite(Number(node.wordCount))) {
    sanitized.wordCount = Number(node.wordCount);
  }
  return sanitized;
};

const sanitizeCanvasEdge = (edge = {}) => {
  const id = String(edge.id ?? '').trim();
  const source = String(edge.source ?? '').trim();
  const target = String(edge.target ?? '').trim();
  if (!id || !source || !target || source === target) return null;
  const sanitized = { id, source, target };
  ['label', 'type', 'relationType', 'origin'].forEach((field) => {
    if (!Object.prototype.hasOwnProperty.call(edge, field)) return;
    sanitized[field] = String(edge[field] ?? '').trim();
  });
  if (edge.data && typeof edge.data === 'object' && !Array.isArray(edge.data)) {
    sanitized.data = cloneJsonObject(edge.data, null);
  }
  return sanitized;
};

const cloneJsonObject = (value, fallback) => {
  if (!value || typeof value !== 'object') return fallback;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
};

const sanitizeCanvasExcalidrawState = (excalidraw) => {
  if (!excalidraw || typeof excalidraw !== 'object') return null;
  return {
    elements: Array.isArray(excalidraw.elements)
      ? cloneJsonObject(excalidraw.elements, [])
      : [],
    appState: cloneJsonObject(excalidraw.appState, {}),
    files: cloneJsonObject(excalidraw.files, {}),
  };
};

const CANVAS_MIN_VIEWPORT_ZOOM = 0.2;
const CANVAS_MAX_VIEWPORT_ZOOM = 2;

const sanitizeCanvasViewport = (viewport) => {
  if (!viewport || typeof viewport !== 'object') return null;
  const x = Number(viewport.x);
  const y = Number(viewport.y);
  const zoom = Number(viewport.zoom);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(zoom)) return null;
  return {
    x,
    y,
    zoom: Math.min(CANVAS_MAX_VIEWPORT_ZOOM, Math.max(CANVAS_MIN_VIEWPORT_ZOOM, zoom)),
  };
};

const sanitizeCanvasState = (canvasState = {}) => {
  const nodes = Array.isArray(canvasState?.nodes)
    ? canvasState.nodes.map((node, index) => sanitizeCanvasNode(node, index)).filter(Boolean)
    : [];
  const edges = Array.isArray(canvasState?.edges)
    ? canvasState.edges.map((edge) => sanitizeCanvasEdge(edge)).filter(Boolean)
    : [];
  const viewport = sanitizeCanvasViewport(canvasState?.viewport);
  const excalidraw = sanitizeCanvasExcalidrawState(canvasState?.excalidraw);
  const nextState = viewport ? { nodes, edges, viewport } : { nodes, edges };
  if (canvasState?.engine === CANVAS_ENGINE_EXCALIDRAW || excalidraw) {
    nextState.engine = CANVAS_ENGINE_EXCALIDRAW;
  }
  if (excalidraw) {
    nextState.excalidraw = excalidraw;
  }
  return nextState;
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

const resolveDailyWorkspaceBackupRoot = async (projectRootPath) => {
  if (projectRootPath) return projectRootPath;
  const result = await ensureMdRenderWorkspace();
  return result?.projectRootPath ?? '';
};

const persistDailyWorkspaceBackup = async (dailyWorkspace, projectRootPath = '') => {
  try {
    const rootPath = await resolveDailyWorkspaceBackupRoot(projectRootPath);
    if (!rootPath) return;
    await saveDailyWorkspaceBackup({
      projectRootPath: rootPath,
      dailyWorkspace: normalizeDailyWorkspace(dailyWorkspace, null),
    });
  } catch (error) {
    console.error('[store] Daily 备份保存失败:', error);
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
      dailyWorkspace: normalizeDailyWorkspace(null),
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
      // Notion 反代地址（运行时可配，不打进构建产物）。空 = 未配置，走 dev 回退。
      notionProxyBase: '',
      cloudSyncBaseUrl: getDefaultCloudSyncBaseUrl(),
      cloudWorkspaceId: '',
      cloudLastSyncedRevision: 0,
      cloudLastSyncedAt: '',
      cloudClientId: createCloudClientId(),
      cloudLastSyncedHash: '',
      activeBlockId: null,
      activeBlockDraft: '',

      // ===== AI 助手会话（全局内存态，故意不进 persist：切页不丢、关 app 清空）=====
      agentSessions: [createSession()],
      activeAgentSessionId: null, // null 时下方 getter 兜底用第一个

      // 编辑器「引用到 AI」暂存的选中文字（内存态，不进 persist）。
      // null = 无引用；AgentPanel 消费后调 clearAiQuotedSelection 清空。
      aiQuotedSelection: null,
      setAiQuotedSelection: (text) => {
        const t = String(text ?? '').trim();
        set({ aiQuotedSelection: t || null });
      },
      clearAiQuotedSelection: () => set({ aiQuotedSelection: null }),

      // AI 待确认的文档写入（内存态，不进 persist）。
      // null = 无待确认改动。stageAgentWrite 暂存改动并返回一个 Promise，
      // 用户点「应用」或「放弃」后 resolve，agent 工具据此回填模型结果。
      agentPendingWrite: null,
      /**
       * 暂存一次待确认写入，返回 Promise<boolean>（true=已应用，false=已放弃）。
       * @param {{ oldText: string, newText: string }} change
       */
      stageAgentWrite: ({ oldText, newText }) => new Promise((resolve) => {
        set({ agentPendingWrite: { oldText: oldText ?? '', newText: newText ?? '', resolve } });
      }),
      /** 应用待确认写入：真正写回当前文档，并 resolve(true) */
      applyAgentWrite: () => {
        const pending = get().agentPendingWrite;
        if (!pending) return;
        get().updateSelectedFileContent(pending.newText);
        set({ agentPendingWrite: null });
        pending.resolve?.(true);
      },
      /** 放弃待确认写入：不动文档，resolve(false) */
      discardAgentWrite: () => {
        const pending = get().agentPendingWrite;
        if (!pending) return;
        set({ agentPendingWrite: null });
        pending.resolve?.(false);
      },

      /** 当前激活会话 id（兜底第一个） */
      getActiveAgentSessionId: () => {
        const { agentSessions, activeAgentSessionId } = get();
        if (activeAgentSessionId && agentSessions.some((s) => s.id === activeAgentSessionId)) {
          return activeAgentSessionId;
        }
        return agentSessions[0]?.id ?? null;
      },

      createAgentSession: () => {
        const session = createSession();
        set((state) => ({
          agentSessions: [session, ...state.agentSessions],
          activeAgentSessionId: session.id,
        }));
        return session.id;
      },

      switchAgentSession: (sessionId) => set({ activeAgentSessionId: sessionId }),

      deleteAgentSession: (sessionId) => set((state) => {
        const { sessions, nextActiveId } = removeSession(
          state.agentSessions, sessionId, get().getActiveAgentSessionId(),
        );
        return { agentSessions: sessions, activeAgentSessionId: nextActiveId };
      }),

      /** 给某会话追加一条 UI 消息 */
      appendAgentMessage: (sessionId, msg) => set((state) => ({
        agentSessions: mapSession(state.agentSessions, sessionId, (s) => ({
          ...s,
          messages: [...s.messages, msg],
          // 首条用户消息自动命名会话
          title: s.messages.length === 0 && msg.role === 'user' ? deriveTitle(msg.text) : s.title,
        })),
      })),

      /** 用 updater 改某会话最后一条匹配的消息（如把 tool running→done）*/
      updateAgentMessages: (sessionId, updater) => set((state) => ({
        agentSessions: mapSession(state.agentSessions, sessionId, (s) => ({
          ...s,
          messages: updater(s.messages),
        })),
      })),

      /** 保存某会话的模型对话历史（跨轮复用）*/
      setAgentHistory: (sessionId, history) => set((state) => ({
        agentSessions: mapSession(state.agentSessions, sessionId, (s) => ({ ...s, history })),
      })),

      setNotionToken: (notionToken) => set({ notionToken: notionToken ?? '' }),
      setNotionDatabaseId: (notionDatabaseId) => set({ notionDatabaseId: notionDatabaseId ?? '' }),
      // 立即写一份到 localStorage，让 notionService 当次请求即可读到新地址
      setNotionProxyBase: (notionProxyBase) => {
        const next = (notionProxyBase ?? '').trim();
        if (typeof window !== 'undefined') {
          try {
            window.localStorage.setItem(NOTION_PROXY_STORAGE_KEY, next);
          } catch {
            /* localStorage 不可用时忽略，状态仍生效 */
          }
        }
        set({ notionProxyBase: next });
      },
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

      setCloudSyncBaseUrl: (cloudSyncBaseUrl) => set({
        cloudSyncBaseUrl: normalizeCloudSyncBaseUrl(cloudSyncBaseUrl) || getDefaultCloudSyncBaseUrl(),
      }),
      setCloudWorkspaceId: (cloudWorkspaceId) => set({
        cloudWorkspaceId: String(cloudWorkspaceId ?? '').trim(),
      }),
      buildCloudSyncPayload: () => {
        const state = get();
        const payload = buildCloudWorkspacePayload({
          workspace: state.workspace,
          dailyWorkspace: state.dailyWorkspace,
          publishingPlatforms: state.publishingPlatforms,
          selectedId: state.selectedId,
        });
        return { payload, hash: getCloudPayloadHash(payload) };
      },
      markCloudSyncSuccess: ({ revision, updatedAt, hash } = {}) => set((state) => ({
        cloudLastSyncedRevision: sanitizeCloudRevision(revision),
        cloudLastSyncedAt: updatedAt ? String(updatedAt) : new Date().toISOString(),
        cloudLastSyncedHash: hash ?? state.cloudLastSyncedHash,
      })),
      applyCloudWorkspacePayload: (payload, meta = {}) => {
        if (!payload || payload.schemaVersion !== 1 || !payload.workspace) {
          throw new Error('云端工作区快照格式不受支持。');
        }

        const normalizedWorkspace = ensureFileTimestamps(ensureKnowledgeFields(payload.workspace));
        const nextDailyWorkspace = normalizeDailyWorkspace(payload.dailyWorkspace, null);
        const nextPublishingPlatforms = sanitizePublishingPlatforms(payload.publishingPlatforms);
        const preferredId = payload.selectedId || meta.selectedId;
        const initialId = findNodeById(normalizedWorkspace, preferredId)
          ? preferredId
          : (findFirstFileId(normalizedWorkspace) ?? normalizedWorkspace.id);
        const selectedNode = findNodeById(normalizedWorkspace, initialId);
        const hash = getCloudPayloadHash(buildCloudWorkspacePayload({
          workspace: normalizedWorkspace,
          dailyWorkspace: nextDailyWorkspace,
          publishingPlatforms: nextPublishingPlatforms,
          selectedId: initialId,
        }));

        persistWorkspace(normalizedWorkspace);
        persistDailyWorkspaceBackup(nextDailyWorkspace);
        set({
          workspace: normalizedWorkspace,
          dailyWorkspace: nextDailyWorkspace,
          publishingPlatforms: nextPublishingPlatforms,
          selectedId: initialId,
          markdown: selectedNode?.type === 'file' ? (selectedNode.content ?? '') : '',
          storageMode: 'local',
          projectRootPath: '',
          surface: selectedNode?.type === 'folder' ? 'folder' : 'paper',
          activeBlockId: null,
          activeBlockDraft: '',
          cloudLastSyncedRevision: sanitizeCloudRevision(meta.revision),
          cloudLastSyncedAt: meta.updatedAt ? String(meta.updatedAt) : new Date().toISOString(),
          cloudLastSyncedHash: hash,
        });
        return { hash };
      },

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
      hydrateDailyWorkspaceFromDisk: async (projectRootPath = '') => {
        try {
          const rootPath = await resolveDailyWorkspaceBackupRoot(projectRootPath || get().projectRootPath);
          if (!rootPath) return false;
          const backup = await readDailyWorkspaceBackup({ projectRootPath: rootPath });
          const merged = mergeDailyWorkspaces(get().dailyWorkspace, backup, null);
          set({ dailyWorkspace: merged });
          await persistDailyWorkspaceBackup(merged, rootPath);
          return true;
        } catch (error) {
          console.error('[store] Daily 备份读取失败:', error);
          return false;
        }
      },
      setDailyCurrentDate: (dateKey) => set((state) => {
        // 只有切到“真实今天”才做破坏性结转（昨日未完成任务沉到待办池、笔记带到今天）；
        // 手动翻看其它日期只是纯视图切换，不动数据，避免来回切日期把条目搬走/重置。
        const nextDailyWorkspace = dateKey === getTodayDateKey()
          ? carryOverIncompleteTasks(state.dailyWorkspace, dateKey)
          : setDailyWorkspaceCurrentDate(state.dailyWorkspace, dateKey);
        persistDailyWorkspaceBackup(nextDailyWorkspace, state.projectRootPath);
        return { dailyWorkspace: nextDailyWorkspace };
      }),
      addDailyItem: (dateKey, type, text) => set((state) => {
        const nextDailyWorkspace = addDailyEntryItem(
          carryOverIncompleteTasks(state.dailyWorkspace, dateKey),
          dateKey,
          { type, text },
        );
        persistDailyWorkspaceBackup(nextDailyWorkspace, state.projectRootPath);
        return { dailyWorkspace: nextDailyWorkspace };
      }),
      toggleDailyTaskDone: (dateKey, itemId) => set((state) => {
        const nextDailyWorkspace = toggleDailyEntryTaskDone(
          carryOverIncompleteTasks(state.dailyWorkspace, dateKey),
          dateKey,
          itemId,
        );
        persistDailyWorkspaceBackup(nextDailyWorkspace, state.projectRootPath);
        return { dailyWorkspace: nextDailyWorkspace };
      }),
      deleteDailyItem: (dateKey, itemId) => set((state) => {
        const nextDailyWorkspace = removeDailyEntryItem(
          carryOverIncompleteTasks(state.dailyWorkspace, dateKey),
          dateKey,
          itemId,
        );
        persistDailyWorkspaceBackup(nextDailyWorkspace, state.projectRootPath);
        return { dailyWorkspace: nextDailyWorkspace };
      }),
      updateDailyItem: (dateKey, itemId, text) => set((state) => {
        const nextDailyWorkspace = updateDailyEntryItem(
          carryOverIncompleteTasks(state.dailyWorkspace, dateKey),
          dateKey,
          itemId,
          text,
        );
        persistDailyWorkspaceBackup(nextDailyWorkspace, state.projectRootPath);
        return { dailyWorkspace: nextDailyWorkspace };
      }),
      updateDailyItemPriority: (dateKey, itemId, priority) => set((state) => {
        const nextDailyWorkspace = updateDailyEntryItemPriority(
          carryOverIncompleteTasks(state.dailyWorkspace, dateKey),
          dateKey,
          itemId,
          priority,
        );
        persistDailyWorkspaceBackup(nextDailyWorkspace, state.projectRootPath);
        return { dailyWorkspace: nextDailyWorkspace };
      }),
      moveDailyItem: (fromDate, itemId, toDate) => set((state) => {
        const nextDailyWorkspace = moveDailyEntryItem(
          carryOverIncompleteTasks(state.dailyWorkspace, fromDate),
          fromDate,
          itemId,
          toDate,
        );
        persistDailyWorkspaceBackup(nextDailyWorkspace, state.projectRootPath);
        return { dailyWorkspace: nextDailyWorkspace };
      }),
      moveDailyItems: (fromDate, itemIds, toDate) => set((state) => {
        // 串行叠加，避免每次只拿旧快照导致后续覆盖前面
        const base = carryOverIncompleteTasks(state.dailyWorkspace, fromDate);
        const nextDailyWorkspace = itemIds.reduce(
          (workspace, itemId) => moveDailyEntryItem(workspace, fromDate, itemId, toDate),
          base,
        );
        persistDailyWorkspaceBackup(nextDailyWorkspace, state.projectRootPath);
        return { dailyWorkspace: nextDailyWorkspace };
      }),
      moveDailyTaskToTodo: (dateKey, itemId) => set((state) => {
        const nextDailyWorkspace = sendDailyEntryTaskToTodo(
          carryOverIncompleteTasks(state.dailyWorkspace, dateKey),
          dateKey,
          itemId,
        );
        persistDailyWorkspaceBackup(nextDailyWorkspace, state.projectRootPath);
        return { dailyWorkspace: nextDailyWorkspace };
      }),
      addTodoItem: (text) => set((state) => {
        const nextDailyWorkspace = addTodoPoolItem(state.dailyWorkspace, text);
        persistDailyWorkspaceBackup(nextDailyWorkspace, state.projectRootPath);
        return { dailyWorkspace: nextDailyWorkspace };
      }),
      promoteTodoToDaily: (todoId, dateKey) => set((state) => {
        const nextDailyWorkspace = promoteTodoToDaily(state.dailyWorkspace, todoId, dateKey);
        persistDailyWorkspaceBackup(nextDailyWorkspace, state.projectRootPath);
        return { dailyWorkspace: nextDailyWorkspace };
      }),
      removeTodoItem: (todoId) => set((state) => {
        const nextDailyWorkspace = removeTodoPoolItem(state.dailyWorkspace, todoId);
        persistDailyWorkspaceBackup(nextDailyWorkspace, state.projectRootPath);
        return { dailyWorkspace: nextDailyWorkspace };
      }),
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

      // 构建选中节点的状态补丁；includeSurface=false 时保持当前 surface 不变
      // （用于同步/设置等覆盖页：点目录只记选中态，返回后再切到内容）
      _buildSelectPatch: (nodeId, includeSurface) => {
        const { workspace, openTabs } = get();
        const node = findNodeById(workspace, nodeId);
        const isFolder = node?.type === 'folder';
        const markdown = isFolder ? get().markdown : (node?.content ?? '');
        const patch = {
          activeBlockId: null,
          activeBlockDraft: '',
          selectedId: nodeId,
          markdown,
        };
        if (includeSurface) {
          patch.surface = isFolder ? 'folder' : 'paper';
        }
        // 打开文件时自动添加 tab
        if (!isFolder && node) {
          const exists = openTabs.some((t) => t.id === nodeId);
          if (!exists) {
            patch.openTabs = [...openTabs, { id: nodeId, title: node.name || '未命名' }];
          }
        }
        return patch;
      },

      selectNode: (nodeId) => {
        set(get()._buildSelectPatch(nodeId, true));
      },

      // 只更新选中态与内容，不切换 surface（覆盖页下点目录用）
      selectNodeKeepSurface: (nodeId) => {
        set(get()._buildSelectPatch(nodeId, false));
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
          if (Object.prototype.hasOwnProperty.call(patch ?? {}, 'cover')) {
            nextPatch.cover = String(patch.cover ?? '').trim();
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
            createdAt: Date.now(),
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
        const now = Date.now();
        const newFile = {
          id: fileId,
          type: 'file',
          name,
          content: '',
          createdAt: now,
          updatedAt: now,
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

      createGeneratedFile: async ({
        name = '',
        content = '',
        contextNodeId,
        meta = {},
      } = {}) => {
        const { workspace, selectedId, openTabs } = get();
        const targetNodeId = contextNodeId ?? selectedId;
        const currentFile = findNodeById(workspace, selectedId);
        const fallbackBaseName = sanitizeGeneratedFileBaseName(currentFile?.name, 'AI 生成');
        const normalizedContent = normalizeMarkdown(String(content ?? ''));
        const targetFolderId = resolveTargetFolderId(workspace, targetNodeId);
        const targetFolder = findNodeById(workspace, targetFolderId);

        if (!targetFolder || targetFolder.type !== 'folder') {
          return { ok: false, error: '无法定位目标文件夹。' };
        }

        if (targetFolder.projectRootPath) {
          const target = resolveLocalProjectCreateTarget(
            workspace,
            targetNodeId,
            targetFolder.projectRootPath,
          );
          if (!target) {
            return { ok: false, error: '无法定位本地项目目录。' };
          }

          const finalName = buildGeneratedFileName(target.parentFolder, name, fallbackBaseName);
          const relativePath = target.parentRelativePath
            ? `${target.parentRelativePath}/${finalName}`
            : finalName;

          try {
            const result = await createLocalProjectFileOnDisk({
              projectRootPath: target.projectRootPath,
              relativePath,
              content: normalizedContent,
            });
            const node = {
              ...createLocalProjectFileNode(
                target.projectRootPath,
                result.relativePath,
                finalName,
                normalizedContent,
              ),
              ...createDefaultKnowledgeFields(meta),
              updatedAt: result.updatedAt ?? Date.now(),
            };
            const nextWorkspace = addChildNode(workspace, target.parentFolderId, node, true);
            persistWorkspace(nextWorkspace);
            set({
              workspace: nextWorkspace,
              selectedId: node.id,
              markdown: normalizedContent,
              surface: 'paper',
              activeBlockId: null,
              activeBlockDraft: '',
              openTabs: [...openTabs, { id: node.id, title: node.name || '未命名' }],
            });
            persistLocalProjectMetadata(node);
            return { ok: true, fileId: node.id, name: finalName };
          } catch (error) {
            return { ok: false, error: error?.message || '新建文件失败。' };
          }
        }

        const fileId = createId('file');
        const finalName = buildGeneratedFileName(targetFolder, name, fallbackBaseName);
        const newFile = {
          id: fileId,
          type: 'file',
          name: finalName,
          content: normalizedContent,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          ...createDefaultKnowledgeFields(meta),
        };
        const nextWorkspace = addChildNode(workspace, targetFolderId, newFile, true);
        persistWorkspace(nextWorkspace);
        set({
          workspace: nextWorkspace,
          selectedId: fileId,
          markdown: normalizedContent,
          surface: 'paper',
          activeBlockId: null,
          activeBlockDraft: '',
          openTabs: [...openTabs, { id: fileId, title: finalName }],
        });
        return { ok: true, fileId, name: finalName };
      },

      addFolder: (contextNodeId) => {
        const { workspace, selectedId } = get();
        const folderId = createId('folder');
        const folderName = buildUniqueName(workspace, '新建文件夹');
        const now = Date.now();
        const newFolder = {
          id: folderId,
          type: 'folder',
          name: folderName,
          children: [],
          createdAt: now,
        };
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
        const importedWorkspace = imported?.workspace ?? imported;
        const importedDailyWorkspace = imported?.dailyWorkspace ?? null;
        const normalized = ensureKnowledgeFields(importedWorkspace);
        const firstFileId = findFirstFileId(normalized);
        const initialId = firstFileId ?? normalized?.id ?? 'root';
        const node = findNodeById(normalized, initialId);
        const nextDailyWorkspace = mergeDailyWorkspaces(
          normalizeDailyWorkspace(importedDailyWorkspace, null),
          null,
          null,
        );
        persistWorkspace(normalized);
        persistDailyWorkspaceBackup(nextDailyWorkspace);
        set({
          workspace: normalized,
          dailyWorkspace: nextDailyWorkspace,
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
