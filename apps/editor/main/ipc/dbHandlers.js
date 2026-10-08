import path from 'node:path';
import { createDatabaseSearch } from '../databaseSearch.js';
import {
  getBacklinks,
  getGraphData,
  getVersionById,
  getVersions,
  isMigratedFromLocalStorage,
  loadEditorState,
  markMigratedFromLocalStorage,
  saveEditorState,
  saveVersionSnapshot,
  saveVersions,
  syncAllLinks,
  syncDocuments,
  updateDocumentDiskPaths,
} from '../database.js';
import { writeBuiltInDocsToDisk } from '../mdSync.js';
import { isStepOnFilesCached } from '../migration/stateCache.js';

const syncBuiltInDocs = (workspace, logPrefix) => {
  // 内置文档已迁成真文件后，不再往 Artifacts/ 单向导出（M6）
  if (!workspace || isStepOnFilesCached('docs')) return;
  writeBuiltInDocsToDisk(workspace).then((diskPaths) => {
    if (Object.keys(diskPaths).length > 0) updateDocumentDiskPaths(diskPaths);
  }).catch((err) => console.error(`[db] ${logPrefix} disk-write failed:`, err));
};

export function registerDbHandlers({ ipcMain, app }) {
  const databaseSearch = createDatabaseSearch(path.join(app.getPath('userData'), 'knowledge.db'));
  app.once('before-quit', () => databaseSearch.close());
  ipcMain.handle('db:is-migrated', () => isMigratedFromLocalStorage());

  ipcMain.handle('db:migrate', (_event, payload = {}) => {
    try {
      const { stateMap } = payload;
      let workspace = null;
      if (stateMap && typeof stateMap === 'object') {
        saveEditorState(stateMap);
        if (stateMap.workspace_json) {
          try {
            workspace = JSON.parse(stateMap.workspace_json);
            syncDocuments(workspace);
          } catch {
            // ignore parse errors
          }
        }
      }
      markMigratedFromLocalStorage();
      syncBuiltInDocs(workspace, 'migrate');
      return { ok: true };
    } catch (err) {
      console.error('[db] migrate error:', err);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('db:load', () => {
    try {
      return { ok: true, state: loadEditorState() };
    } catch (err) {
      console.error('[db] load error:', err);
      return { ok: false, state: {} };
    }
  });

  ipcMain.handle('db:save', (_event, payload = {}) => {
    try {
      const { stateMap, workspaceJson } = payload;
      if (stateMap && typeof stateMap === 'object') {
        saveEditorState(stateMap);
      }
      let workspace = null;
      if (workspaceJson) {
        try {
          workspace = JSON.parse(workspaceJson);
          // 快照要在 syncDocuments 覆盖旧正文之前存；快照失败不能影响正常保存
          try {
            saveVersions(workspace);
          } catch (err) {
            console.error('[db] save-versions error:', err);
          }
          syncDocuments(workspace);
          syncAllLinks(workspace);
        } catch {
          // ignore parse errors
        }
      }
      syncBuiltInDocs(workspace, 'save');
      return { ok: true };
    } catch (err) {
      console.error('[db] save error:', err);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('db:get-graph', () => {
    try {
      return { ok: true, data: getGraphData() };
    } catch (err) {
      console.error('[db] get-graph error:', err);
      return { ok: false, data: { nodes: [], edges: [] } };
    }
  });

  ipcMain.handle('db:get-backlinks', (_event, payload = {}) => {
    try {
      return { ok: true, backlinks: getBacklinks(payload.docId) };
    } catch (err) {
      console.error('[db] get-backlinks error:', err);
      return { ok: false, backlinks: [] };
    }
  });

  ipcMain.handle('db:get-versions', (_event, payload = {}) => {
    try {
      return { ok: true, versions: getVersions(payload.docId) };
    } catch (err) {
      console.error('[db] get-versions error:', err);
      return { ok: false, versions: [] };
    }
  });

  ipcMain.handle('db:get-version-content', (_event, payload = {}) => {
    try {
      const ver = getVersionById(payload.versionId);
      return { ok: !!ver, version: ver ?? null };
    } catch (err) {
      console.error('[db] get-version-content error:', err);
      return { ok: false, version: null };
    }
  });

  ipcMain.handle('db:save-version-snapshot', (_event, payload = {}) => {
    try {
      return { ok: true, ...saveVersionSnapshot(payload.docId, payload.content) };
    } catch (err) {
      console.error('[db] save-version-snapshot error:', err);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('db:search', async (_event, payload = {}) => {
    try {
      const { query } = payload;
      return { ok: true, results: await databaseSearch.search(query) };
    } catch (err) {
      console.error('[db] search error:', err);
      return { ok: false, results: [], error: err.message };
    }
  });
}
