const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的桥接 API 给渲染进程
// 后续集成 Notion OAuth、本地文件读写等功能时在这里扩展
contextBridge.exposeInMainWorld('electronAPI', {
  // 平台信息
  platform: process.platform,
  openLocalProject: () => ipcRenderer.invoke('open-local-project'),
  saveLocalProjectFile: (payload) => ipcRenderer.invoke('save-local-project-file', payload),
  ensureMdRenderWorkspace: () => ipcRenderer.invoke('ensure-md-render-workspace'),
  createLocalProjectFile: (payload) => ipcRenderer.invoke('create-local-project-file', payload),
  createLocalProjectFolder: (payload) => ipcRenderer.invoke('create-local-project-folder', payload),
  renameLocalProjectEntry: (payload) => ipcRenderer.invoke('rename-local-project-entry', payload),
  deleteLocalProjectEntry: (payload) => ipcRenderer.invoke('delete-local-project-entry', payload),

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
    const allowedChannels = ['update-available'];
    if (allowedChannels.includes(channel)) {
      const sub = (_event, ...args) => callback(...args);
      ipcRenderer.on(channel, sub);
      return () => ipcRenderer.removeListener(channel, sub);
    }
    throw new Error(`IPC channel "${channel}" not allowed`);
  },
});
