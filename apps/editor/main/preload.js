const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的桥接 API 给渲染进程
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
  pickFile: (payload) => ipcRenderer.invoke('pick-file', payload),
  pickSavePath: (payload) => ipcRenderer.invoke('pick-save-path', payload),
  saveLocalProjectFile: (payload) => ipcRenderer.invoke('save-local-project-file', payload),
  saveLocalProjectMetadata: (payload) => ipcRenderer.invoke('save-local-project-metadata', payload),
  ensureMdRenderWorkspace: () => ipcRenderer.invoke('ensure-md-render-workspace'),
  readDailyWorkspaceBackup: (payload) => ipcRenderer.invoke('read-daily-workspace-backup', payload),
  saveDailyWorkspaceBackup: (payload) => ipcRenderer.invoke('save-daily-workspace-backup', payload),
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
    chatStream: (payload) => ipcRenderer.invoke('ai:chatStream', payload),
    abortChatStream: (requestId) => ipcRenderer.invoke('ai:chatStream:abort', { requestId }),
    onChatStreamEvent: (callback) => {
      const sub = (_event, payload) => callback(payload);
      ipcRenderer.on('ai:chatStream:event', sub);
      return () => ipcRenderer.removeListener('ai:chatStream:event', sub);
    },
    getConfig: () => ipcRenderer.invoke('ai:getConfig'),
    execTool: (payload) => ipcRenderer.invoke('ai:execTool', payload),
    listTools: (payload) => ipcRenderer.invoke('ai:listTools', payload),
    searchKnowledge: (payload) => ipcRenderer.invoke('ai:searchKnowledge', payload),
    readUrl: (payload) => ipcRenderer.invoke('ai:readUrl', payload),
    extractAttachmentText: (payload) => ipcRenderer.invoke('ai:extractAttachmentText', payload),
  },

  // 本机 agent（Codex / Claude Code / Cursor）：检测、模型、运行一轮、停止
  localAgent: {
    detect: (payload) => ipcRenderer.invoke('local-agent:detect', payload),
    models: (payload) => ipcRenderer.invoke('local-agent:models', payload),
    run: (payload) => ipcRenderer.invoke('local-agent:run', payload),
    cancel: (payload) => ipcRenderer.invoke('local-agent:cancel', payload),
    onEvent: (callback) => {
      const sub = (_event, payload) => callback(payload);
      ipcRenderer.on('local-agent:event', sub);
      return () => ipcRenderer.removeListener('local-agent:event', sub);
    },
  },

  // 内容库产品 skill（MdRender/.agents/skills）：读原始文件 + 变化通知
  skills: {
    list: () => ipcRenderer.invoke('skills:list'),
    write: (payload) => ipcRenderer.invoke('skills:write', payload),
    open: (payload) => ipcRenderer.invoke('skills:open', payload),
    syncVault: (builtinSkills) => ipcRenderer.invoke('skills:sync-vault', { builtinSkills }),
    onChanged: (callback) => {
      const sub = (_event, payload) => callback(payload);
      ipcRenderer.on('skills:changed', sub);
      return () => ipcRenderer.removeListener('skills:changed', sub);
    },
  },

  // 内容库 .agent/：提案（待确认改动）和活动日志
  agentData: {
    writeProposal: (proposal) => ipcRenderer.invoke('agent-data:write-proposal', { proposal }),
    listProposals: () => ipcRenderer.invoke('agent-data:list-proposals'),
    appendActivity: (entry) => ipcRenderer.invoke('agent-data:append-activity', { entry }),
    readActivity: (payload) => ipcRenderer.invoke('agent-data:read-activity', payload),
  },

  // 数据层文件化：迁移向导 + 迁移后 Daily / 白板 / 编辑部记忆的文件读写
  migration: {
    getState: () => ipcRenderer.invoke('migration:state'),
    plan: (payload, steps) => ipcRenderer.invoke('migration:plan', { payload, steps }),
    execute: (payload, steps) => ipcRenderer.invoke('migration:execute', { payload, steps }),
    rollback: () => ipcRenderer.invoke('migration:rollback'),
    onProgress: (callback) => {
      const sub = (_event, progress) => callback(progress);
      ipcRenderer.on('migration:progress', sub);
      return () => ipcRenderer.removeListener('migration:progress', sub);
    },
  },
  vault: {
    readText: (relativePath) => ipcRenderer.invoke('vault:read-text', { relativePath }),
    writeText: (relativePath, content) => ipcRenderer.invoke('vault:write-text', { relativePath, content }),
    readDaily: () => ipcRenderer.invoke('vault:read-daily'),
    readCanvas: () => ipcRenderer.invoke('vault:read-canvas'),
    ensureIds: () => ipcRenderer.invoke('vault:ensure-ids'),
    rebuildIndex: (workspaceJson) => ipcRenderer.invoke('db:rebuild-index', { workspaceJson }),
    agentInfo: () => ipcRenderer.invoke('vault:agent-info'),
    open: (target) => ipcRenderer.invoke('vault:open', { target }),
  },

  // 只读本机运行诊断
  diagnostics: {
    getSnapshot: (payload) => ipcRenderer.invoke('diagnostics:get-snapshot', payload),
  },

  // Agent 控制桥：主进程收到「别的 AI」的工具请求后转发到 renderer，
  // renderer 用现有 host+executeTool 执行完再回帖。
  agentBridge: {
    onInvoke: (callback) => {
      const sub = (_event, payload) => callback(payload);
      ipcRenderer.on('agent-bridge:invoke', sub);
      return () => ipcRenderer.removeListener('agent-bridge:invoke', sub);
    },
    reply: (payload) => ipcRenderer.send('agent-bridge:reply', payload),
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
    saveVersionSnapshot: (docId, content) => ipcRenderer.invoke('db:save-version-snapshot', { docId, content }),
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
    const allowedChannels = ['menu-select-all', 'update-available', 'updater-status'];
    if (allowedChannels.includes(channel)) {
      const sub = (_event, ...args) => callback(...args);
      ipcRenderer.on(channel, sub);
      return () => ipcRenderer.removeListener(channel, sub);
    }
    throw new Error(`IPC channel "${channel}" not allowed`);
  },
});
