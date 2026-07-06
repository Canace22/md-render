import {
  getBacklinks,
  getGraphData,
  getVersionById,
  getVersions,
  isMigratedFromLocalStorage,
  loadEditorState,
  markMigratedFromLocalStorage,
  saveEditorState,
  saveVersions,
  searchDocuments,
  syncAllLinks,
  syncDocuments,
  updateDocumentDiskPaths,
} from '../database.js';
import { writeBuiltInDocsToDisk } from '../mdSync.js';

const syncBuiltInDocs = (workspace, logPrefix) => {
  if (!workspace) return;
  writeBuiltInDocsToDisk(workspace).then((diskPaths) => {
    if (Object.keys(diskPaths).length > 0) updateDocumentDiskPaths(diskPaths);
  }).catch((err) => console.error(`[db] ${logPrefix} disk-write failed:`, err));
};

export function registerDbHandlers({ ipcMain }) {
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
          syncDocuments(workspace);
          syncAllLinks(workspace);
          saveVersions(workspace);
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

  ipcMain.handle('db:search', (_event, payload = {}) => {
    try {
      const { query } = payload;
      return { ok: true, results: searchDocuments(query) };
    } catch (err) {
      console.error('[db] search error:', err);
      return { ok: false, results: [] };
    }
  });
}
