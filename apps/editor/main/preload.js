const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的桥接 API 给渲染进程
// 后续集成 Notion OAuth、本地文件读写等功能时在这里扩展
contextBridge.exposeInMainWorld('electronAPI', {
  // 平台信息
  platform: process.platform,
  isFullScreen: () => ipcRenderer.invoke('window-is-fullscreen'),
  onFullScreenChange: (callback) => {
    const sub = (_event, isFullScreen) => callback(isFullScreen);
    ipcRenderer.on('window-fullscreen-changed', sub);
    return () => ipcRenderer.removeListener('window-fullscreen-changed', sub);
  },
  openLocalProject: () => ipcRenderer.invoke('open-local-project'),
  selectCoverImage: () => ipcRenderer.invoke('select-cover-image'),
  saveLocalProjectFile: (payload) => ipcRenderer.invoke('save-local-project-file', payload),
  saveLocalProjectMetadata: (payload) => ipcRenderer.invoke('save-local-project-metadata', payload),
  ensureMdRenderWorkspace: () => ipcRenderer.invoke('ensure-md-render-workspace'),
  createLocalProjectFile: (payload) => ipcRenderer.invoke('create-local-project-file', payload),
  createLocalProjectFolder: (payload) => ipcRenderer.invoke('create-local-project-folder', payload),
  saveBinaryAsset: (payload) => ipcRenderer.invoke('save-binary-asset', payload),
  renameLocalProjectEntry: (payload) => ipcRenderer.invoke('rename-local-project-entry', payload),
  deleteLocalProjectEntry: (payload) => ipcRenderer.invoke('delete-local-project-entry', payload),
  registerLocalProjectWatch: (payload) => ipcRenderer.invoke('register-local-project-watch', payload),
  readLocalProjectDisk: (payload) => ipcRenderer.invoke('read-local-project-disk', payload),
  readLocalProjectFileContent: (payload) => ipcRenderer.invoke('read-local-project-file-content', payload),
  revealLocalProjectEntry: (payload) => ipcRenderer.invoke('reveal-local-project-entry', payload),
  fetchBookmarkPageSnapshot: (payload) => ipcRenderer.invoke('fetch-bookmark-page-snapshot', payload),
  exportSaveFile: (payload) => ipcRenderer.invoke('export-save-file', payload),
  exportToPdf: (payload) => ipcRenderer.invoke('export-to-pdf', payload),
  onLocalProjectDiskChanged: (callback) => {
    const sub = (_event, payload) => callback(payload);
    ipcRenderer.on('local-project-disk-changed', sub);
    return () => ipcRenderer.removeListener('local-project-disk-changed', sub);
  },

  // AI 请求 IPC（主进程直连，无 CORS，无需代理服务器）
  ai: {
    chat: (payload) => ipcRenderer.invoke('ai:chat', payload),
  },

  // SQLite 数据库 IPC
  db: {
    isMigrated: () => ipcRenderer.invoke('db:is-migrated'),
    migrate: (stateMap) => ipcRenderer.invoke('db:migrate', { stateMap }),
    load: () => ipcRenderer.invoke('db:load'),
    save: (stateMap, workspaceJson) => ipcRenderer.invoke('db:save', { stateMap, workspaceJson }),
    search: (query) => ipcRenderer.invoke('db:search', { query }),
    getGraph: () => ipcRenderer.invoke('db:get-graph'),
    getBacklinks: (docId) => ipcRenderer.invoke('db:get-backlinks', { docId }),
    getVersions: (docId) => ipcRenderer.invoke('db:get-versions', { docId }),
    getVersionContent: (versionId) => ipcRenderer.invoke('db:get-version-content', { versionId }),
  },

  // 自动更新 API
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    download: () => ipcRenderer.invoke('updater:download'),
    install: () => ipcRenderer.invoke('updater:install'),
    onStatus: (callback) => {
      const sub = (_event, data) => callback(data);
      ipcRenderer.on('updater-status', sub);
      return () => ipcRenderer.removeListener('updater-status', sub);
    },
  },

  // 通用 IPC：渲染进程 → 主进程
  invoke: (channel, ...args) => {
    const allowedChannels = ['get-app-version'];
    if (allowedChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args);
    }
    throw new Error(`IPC channel "${channel}" not allowed`);
  },

  // 通用 IPC：主进程 → 渲染进程（监听）
  on: (channel, callback) => {
    const allowedChannels = ['update-available', 'updater-status'];
    if (allowedChannels.includes(channel)) {
      const sub = (_event, ...args) => callback(...args);
      ipcRenderer.on(channel, sub);
      return () => ipcRenderer.removeListener(channel, sub);
    }
    throw new Error(`IPC channel "${channel}" not allowed`);
  },
});
