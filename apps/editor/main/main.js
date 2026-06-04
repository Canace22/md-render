import { app, BrowserWindow, Menu, Tray, nativeImage, shell, dialog, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  readLocalProjectWorkspace,
  saveLocalProjectFile,
  ensureMdRenderWorkspaceData,
  createLocalProjectFile,
  createLocalProjectFolder,
  renameLocalProjectEntry,
  deleteLocalProjectEntry,
  readProjectsChildren,
  resolveProjectFilePath,
} from './localProject.js';
import {
  watchLocalProjectRoot,
  markLocalProjectWriteIgnored,
  unwatchAllLocalProjects,
} from './localProjectWatcher.js';
import {
  initDatabase,
  loadEditorState,
  saveEditorState,
  isMigratedFromLocalStorage,
  markMigratedFromLocalStorage,
  syncDocuments,
  searchDocuments,
  closeDatabase,
} from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let store = null;
let mainWindow = null;
let tray = null;

const notifyLocalProjectDiskChanged = (payload) => {
  mainWindow?.webContents?.send('local-project-disk-changed', payload);
};

const startWatchingLocalProject = (projectRootPath) => {
  if (!projectRootPath) return;
  watchLocalProjectRoot(projectRootPath, notifyLocalProjectDiskChanged);
};

const markSavedLocalFileIgnored = (projectRootPath, relativePath) => {
  try {
    const filePath = resolveProjectFilePath(projectRootPath, relativePath);
    markLocalProjectWriteIgnored(filePath);
  } catch {
    // ignore invalid paths
  }
};

ipcMain.handle('open-local-project', async () => {
  const result = await dialog.showOpenDialog(mainWindow ?? undefined, {
    title: '打开本地项目',
    properties: ['openDirectory', 'multiSelections'],
  });

  const projectRootPaths = result.filePaths ?? [];
  if (result.canceled || projectRootPaths.length === 0) {
    return { canceled: true };
  }

  const projects = await Promise.all(projectRootPaths.map(async (projectRootPath) => ({
    projectRootPath,
    workspace: await readLocalProjectWorkspace(projectRootPath),
  })));
  const firstProject = projects[0];
  for (const project of projects) {
    startWatchingLocalProject(project.projectRootPath);
  }

  return {
    canceled: false,
    projectRootPath: firstProject.projectRootPath,
    workspace: firstProject.workspace,
    projects,
  };
});

ipcMain.handle('register-local-project-watch', async (_event, payload = {}) => {
  const { projectRootPath } = payload;
  startWatchingLocalProject(projectRootPath);
  return { ok: true };
});

ipcMain.handle('read-local-project-disk', async (_event, payload = {}) => {
  const { projectRootPath, mode } = payload;
  if (!projectRootPath) return { ok: false };
  if (mode === 'tree') {
    const workspace = await readLocalProjectWorkspace(projectRootPath);
    return { ok: true, workspace };
  }
  const projectsChildren = await readProjectsChildren(projectRootPath);
  return { ok: true, projectsChildren };
});

ipcMain.handle('save-local-project-file', async (_event, payload = {}) => {
  const { projectRootPath, relativePath, content } = payload;
  await saveLocalProjectFile(projectRootPath, relativePath, content);
  markSavedLocalFileIgnored(projectRootPath, relativePath);
  return { ok: true };
});

ipcMain.handle('ensure-md-render-workspace', async () => {
  const result = await ensureMdRenderWorkspaceData();
  startWatchingLocalProject(result.projectRootPath);
  return result;
});

ipcMain.handle('create-local-project-file', async (_event, payload = {}) => {
  const { projectRootPath, relativePath, content } = payload;
  const result = await createLocalProjectFile(projectRootPath, relativePath, content);
  markSavedLocalFileIgnored(projectRootPath, result.relativePath ?? relativePath);
  return result;
});

ipcMain.handle('create-local-project-folder', async (_event, payload = {}) => {
  const { projectRootPath, relativePath } = payload;
  return createLocalProjectFolder(projectRootPath, relativePath);
});

ipcMain.handle('rename-local-project-entry', async (_event, payload = {}) => {
  const { projectRootPath, relativePath, newRelativePath } = payload;
  const result = await renameLocalProjectEntry(projectRootPath, relativePath, newRelativePath);
  markSavedLocalFileIgnored(projectRootPath, result.relativePath ?? newRelativePath);
  return result;
});

ipcMain.handle('delete-local-project-entry', async (_event, payload = {}) => {
  const { projectRootPath, relativePath } = payload;
  await deleteLocalProjectEntry(projectRootPath, relativePath);
  try {
    markLocalProjectWriteIgnored(resolveProjectFilePath(projectRootPath, relativePath));
  } catch {
    // ignore
  }
  return { ok: true };
});

ipcMain.handle('window-is-fullscreen', () => mainWindow?.isFullScreen() ?? false);

// ── SQLite IPC handlers ───────────────────────────────────────────────────────

ipcMain.handle('db:is-migrated', () => isMigratedFromLocalStorage());

ipcMain.handle('db:migrate', (_event, payload = {}) => {
  try {
    const { stateMap } = payload;
    if (stateMap && typeof stateMap === 'object') {
      saveEditorState(stateMap);
      if (stateMap.workspace_json) {
        try {
          syncDocuments(JSON.parse(stateMap.workspace_json));
        } catch { /* ignore parse errors */ }
      }
    }
    markMigratedFromLocalStorage();
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
    if (workspaceJson) {
      try {
        syncDocuments(JSON.parse(workspaceJson));
      } catch { /* ignore parse errors */ }
    }
    return { ok: true };
  } catch (err) {
    console.error('[db] save error:', err);
    return { ok: false, error: err.message };
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

// ---- 窗口状态记忆（延迟初始化） ----
async function getStore() {
  if (store) return store;
  const { default: Store } = await import('electron-store');
  store = new Store({
    defaults: {
      windowBounds: { width: 1200, height: 800 },
      windowPosition: null,
      windowMaximized: false,
    },
  });
  return store;
}

async function createWindow() {
  const s = await getStore();
  const { width, height } = s.get('windowBounds');
  const position = s.get('windowPosition');
  const maximized = s.get('windowMaximized');

  mainWindow = new BrowserWindow({
    width,
    height,
    ...(position ? { x: position.x, y: position.y } : {}),
    title: 'MD Render',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (maximized) mainWindow.maximize();

  // vite-plugin-electron 在 dev 时自动注入 VITE_DEV_SERVER_URL
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  const saveWindowState = () => {
    if (!mainWindow) return;
    s.set('windowMaximized', mainWindow.isMaximized());
    if (!mainWindow.isMaximized()) {
      s.set('windowBounds', mainWindow.getBounds());
      const [x, y] = mainWindow.getPosition();
      s.set('windowPosition', { x, y });
    }
  };

  const notifyFullScreenChange = () => {
    mainWindow?.webContents.send('window-fullscreen-changed', mainWindow.isFullScreen());
  };

  mainWindow.on('enter-full-screen', notifyFullScreenChange);
  mainWindow.on('leave-full-screen', notifyFullScreenChange);
  mainWindow.on('resize', saveWindowState);
  mainWindow.on('move', saveWindowState);
  mainWindow.on('closed', () => { mainWindow = null; });

  mainWindow.webContents.on('did-finish-load', notifyFullScreenChange);
}

// ---- 托盘图标 ----
function createTray() {
  const size = 16;
  const canvas = Buffer.alloc(size * size * 4, 0);
  for (let i = 0; i < size * size; i++) {
    canvas[i * 4 + 3] = 180;
  }
  const icon = nativeImage.createFromBuffer(canvas, { width: size, height: size });
  icon.setTemplateImage(true);

  tray = new Tray(icon);
  tray.setToolTip('MD Render');
  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    } else {
      createWindow();
    }
  });
}

// ---- 应用菜单 ----
function createMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { label: '文件', submenu: [{ role: 'close' }] },
    {
      label: '编辑',
      submenu: [
        { role: 'undo' }, { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize' }, { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---- preload 热重载 ----
process.on('message', (msg) => {
  if (msg === 'electron-vite&type=hot-reload') {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.reload();
    }
  }
});

// ---- 生命周期 ----
app.whenReady().then(async () => {
  console.log('[electron] app ready');
  initDatabase();
  createMenu();
  createTray();
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch(err => {
  console.error('[electron] startup error:', err);
  app.quit();
});

app.on('window-all-closed', () => {
  unwatchAllLocalProjects();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  unwatchAllLocalProjects();
  closeDatabase();
});
