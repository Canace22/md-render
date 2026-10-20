import { getDesktopRuntimeKind } from './desktopBridge.js';

const getElectronDb = () => (
  typeof window !== 'undefined' ? window.electronAPI?.db : null
);

const invokeTauri = async (command, payload) => {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke(command, payload);
};

const requireSuccessfulMutation = async (operation, fallbackMessage) => {
  const result = await operation;
  if (!result?.ok) {
    throw new Error(result?.error || fallbackMessage);
  }
  return result;
};

export const hasDatabaseBridge = () => (
  Boolean(getElectronDb()) || getDesktopRuntimeKind() === 'tauri'
);

export const databaseIsMigrated = () => {
  const electronDb = getElectronDb();
  if (electronDb) return electronDb.isMigrated();
  return invokeTauri('db_is_migrated');
};

export const databaseMigrate = (stateMap) => {
  const electronDb = getElectronDb();
  const operation = electronDb
    ? electronDb.migrate(stateMap)
    : invokeTauri('db_migrate', { stateMap });
  return requireSuccessfulMutation(operation, '初始数据迁移失败');
};

export const databaseLoad = () => {
  const electronDb = getElectronDb();
  if (electronDb) return electronDb.load();
  return invokeTauri('db_load');
};

export const databaseSave = (stateMap, workspaceJson) => {
  const electronDb = getElectronDb();
  const operation = electronDb
    ? electronDb.save(stateMap, workspaceJson)
    : invokeTauri('db_save', { stateMap, workspaceJson });
  return requireSuccessfulMutation(operation, '数据库保存失败');
};

export const databaseSearch = (query) => {
  const electronDb = getElectronDb();
  if (electronDb) return electronDb.search(query);
  return invokeTauri('db_search', { query });
};

export const databaseGetGraph = () => {
  const electronDb = getElectronDb();
  if (electronDb) return electronDb.getGraph();
  return invokeTauri('db_get_graph');
};

export const databaseGetBacklinks = (docId) => {
  const electronDb = getElectronDb();
  if (electronDb) return electronDb.getBacklinks(docId);
  return invokeTauri('db_get_backlinks', { docId });
};

export const databaseGetVersions = (docId) => {
  const electronDb = getElectronDb();
  if (electronDb) return electronDb.getVersions(docId);
  return invokeTauri('db_get_versions', { docId });
};

export const databaseGetVersionContent = (versionId) => {
  const electronDb = getElectronDb();
  if (electronDb) return electronDb.getVersionContent(versionId);
  return invokeTauri('db_get_version_content', { versionId });
};

export const databaseSaveVersionSnapshot = (docId, content) => {
  const electronDb = getElectronDb();
  if (electronDb) return electronDb.saveVersionSnapshot(docId, content);
  return invokeTauri('db_save_version_snapshot', { docId, content });
};

export const importLegacyDatabase = async () => {
  if (getDesktopRuntimeKind() !== 'tauri') {
    return { ok: false, cancelled: false, error: '只有 Tauri 版需要导入 Electron 数据' };
  }
  return invokeTauri('db_import_legacy_database');
};
