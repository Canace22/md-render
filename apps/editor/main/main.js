import { app, BrowserWindow, Menu, Tray, nativeImage, shell, dialog, ipcMain, protocol } from 'electron';
import pkg from 'electron-updater';
const { autoUpdater } = pkg;
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import {
  readLocalProjectWorkspace,
  saveLocalProjectFile,
  saveLocalProjectMetadata,
  ensureMdRenderWorkspaceData,
  readDailyWorkspaceBackup,
  saveDailyWorkspaceBackup,
  fetchBookmarkPageSnapshot,
  createLocalProjectFile,
  createLocalProjectFolder,
  saveBinaryAsset,
  renameLocalProjectEntry,
  deleteLocalProjectEntry,
  readProjectsChildren,
  resolveProjectFilePath,
  readLocalProjectFileContent,
} from './localProject.js';
import { requestChatCompletion, requestToolExec, requestToolSchema } from './aiRequest.js';
import { listAvailableProviders } from './aiConfig.js';
import {
  watchLocalProjectRoot,
  markLocalProjectWriteIgnored,
  markLocalProjectRootIgnored,
  unwatchAllLocalProjects,
} from './localProjectWatcher.js';
import {
  initDatabase,
  loadEditorState,
  saveEditorState,
  isMigratedFromLocalStorage,
  markMigratedFromLocalStorage,
  syncDocuments,
  syncAllLinks,
  getBacklinks,
  saveVersions,
  getVersions,
  getVersionById,
  searchDocuments,
  updateDocumentDiskPaths,
  getGraphData,
  closeDatabase,
} from './database.js';
import { writeBuiltInDocsToDisk } from './mdSync.js';
import { registerIpcHandlers } from './ipc/registerIpcHandlers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 注册自定义协议（必须在 app.ready 之前调用）
// 解决 file:// URL 在 dev 模式下被跨域安全策略阻断的问题
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'local-media',
    privileges: { secure: true, supportFetchAPI: true, stream: true, standard: true },
  },
]);

let store = null;
let mainWindow = null;
let tray = null;

const STABLE_USER_DATA_DIRNAME = 'md-render';
const LEGACY_USER_DATA_PATH_SEGMENTS = [
  ['md-render'],
  ['@md-render', 'editor'],
  ['MD Render'],
];
const KNOWLEDGE_DB_FILENAME = 'knowledge.db';
const DEFAULT_AI_PROXY_BASE = 'http://localhost:8788';
const normalizeAiProxyBase = (value) => String(value ?? '').trim().replace(/\/+$/, '');
const resolveAiProxyBase = (value) =>
  normalizeAiProxyBase(value) || normalizeAiProxyBase(process.env.AI_PROXY_BASE) || DEFAULT_AI_PROXY_BASE;

app.setPath('userData', path.join(app.getPath('appData'), STABLE_USER_DATA_DIRNAME));

const notifyLocalProjectDiskChanged = (payload) => {
  mainWindow?.webContents?.send('local-project-disk-changed', payload);
};

const startWatchingLocalProject = (projectRootPath) => {
  if (!projectRootPath) return;
  watchLocalProjectRoot(projectRootPath, notifyLocalProjectDiskChanged);
};

const markSavedLocalFileIgnored = (projectRootPath, relativePath) => {
  markLocalProjectRootIgnored(projectRootPath);
  try {
    const filePath = resolveProjectFilePath(projectRootPath, relativePath);
    markLocalProjectWriteIgnored(filePath);
  } catch {
    // ignore invalid paths
  }
};

const pathExists = async (targetPath) => {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
};

const getPathStat = async (targetPath) => {
  try {
    return await fs.stat(targetPath);
  } catch {
    return null;
  }
};

const getLegacyUserDataPaths = () => {
  const appDataPath = app.getPath('appData');
  const stableUserDataPath = app.getPath('userData');
  return LEGACY_USER_DATA_PATH_SEGMENTS
    .map((segments) => path.join(appDataPath, ...segments))
    .filter((candidatePath) => candidatePath !== stableUserDataPath);
};

const listLegacyUserDataCandidates = async () => {
  const candidates = [];

  for (const candidatePath of getLegacyUserDataPaths()) {
    const dirStat = await getPathStat(candidatePath);
    if (!dirStat?.isDirectory()) continue;

    let entryCount = 0;
    try {
      entryCount = (await fs.readdir(candidatePath)).length;
    } catch {
      entryCount = 0;
    }
    if (entryCount === 0) continue;

    const dbStat = await getPathStat(path.join(candidatePath, KNOWLEDGE_DB_FILENAME));
    candidates.push({
      candidatePath,
      score: dbStat?.mtimeMs ?? dirStat.mtimeMs ?? 0,
    });
  }

  return candidates
    .sort((left, right) => right.score - left.score)
    .map((candidate) => candidate.candidatePath);
};

const copyMissingDirectoryEntries = async (sourceDir, targetDir) => {
  await fs.mkdir(targetDir, { recursive: true });
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      await copyMissingDirectoryEntries(sourcePath, targetPath);
      continue;
    }

    if (!entry.isFile()) continue;
    if (await pathExists(targetPath)) continue;
    await fs.copyFile(sourcePath, targetPath);
  }
};

const migrateLegacyUserDataIfNeeded = async () => {
  const stableUserDataPath = app.getPath('userData');
  const stableDbPath = path.join(stableUserDataPath, KNOWLEDGE_DB_FILENAME);

  if (await pathExists(stableDbPath)) {
    return;
  }

  const legacyPaths = await listLegacyUserDataCandidates();
  if (legacyPaths.length === 0) {
    await fs.mkdir(stableUserDataPath, { recursive: true });
    return;
  }

  const sourcePath = legacyPaths[0];
  const stablePathExists = await pathExists(stableUserDataPath);

  if (!stablePathExists) {
    try {
      await fs.rename(sourcePath, stableUserDataPath);
      console.log('[electron] migrated userData directory:', sourcePath, '->', stableUserDataPath);
      return;
    } catch (err) {
      console.warn('[electron] userData directory rename failed, falling back to copy:', err.message);
    }
  }

  await copyMissingDirectoryEntries(sourcePath, stableUserDataPath);
  console.log('[electron] copied legacy userData into stable directory:', sourcePath, '->', stableUserDataPath);
};

registerIpcHandlers({
  ipcMain,
  app,
  autoUpdater,
  getMainWindow: () => mainWindow,
  resolveAiProxyBase,
  startWatchingLocalProject,
  markSavedLocalFileIgnored,
  markLocalProjectRootIgnored,
  markLocalProjectWriteIgnored,
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

  const isMac = process.platform === 'darwin';

  mainWindow = new BrowserWindow({
    width,
    height,
    ...(position ? { x: position.x, y: position.y } : {}),
    title: 'MD Render',
    ...(isMac ? { titleBarStyle: 'hiddenInset' } : {}),
    icon: isMac ? undefined : path.join(__dirname, '../assets/icon.ico'),
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
    await mainWindow.webContents.session.clearCache();
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
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
  let icon;
  if (process.platform === 'darwin') {
    icon = nativeImage.createFromPath(path.join(__dirname, '../assets/icons/16x16.png'));
  } else {
    icon = nativeImage.createFromPath(path.join(__dirname, '../assets/icon.ico'));
  }

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
  const isMac = process.platform === 'darwin';

  const template = [
    ...(isMac
      ? [{
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
        }]
      : []),
    {
      label: '文件',
      submenu: [
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
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
        { role: 'minimize' },
        ...(isMac ? [{ role: 'zoom' }] : []),
        { type: 'separator' },
        ...(isMac ? [{ role: 'front' }] : [{ role: 'close' }]),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---- 自动更新 ----
function setupAutoUpdater() {
  // 不自动下载，先通知用户
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  const send = (channel, data) => {
    mainWindow?.webContents?.send(channel, data);
  };

  autoUpdater.on('checking-for-update', () => {
    send('updater-status', { status: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    send('updater-status', {
      status: 'available',
      version: info.version,
      releaseNotes: info.releaseNotes,
      releaseDate: info.releaseDate,
    });
  });

  autoUpdater.on('update-not-available', () => {
    send('updater-status', { status: 'up-to-date' });
  });

  autoUpdater.on('download-progress', (progress) => {
    send('updater-status', {
      status: 'downloading',
      percent: Math.round(progress.percent),
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    send('updater-status', {
      status: 'downloaded',
      version: info.version,
    });
  });

  autoUpdater.on('error', (err) => {
    console.error('[updater] error:', err.message);
    send('updater-status', { status: 'error', message: err.message });
  });
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
// macOS 上 Electron GPU 渲染问题修复：禁用硬件加速，避免 "Unable to auto-detect a suitable renderer" 错误
if (process.platform === 'darwin') {
  app.disableHardwareAcceleration();
}

app.whenReady().then(async () => {
  console.log('[electron] app ready');

  // 注册 local-media:// 协议处理器，安全地向渲染进程提供本地媒体文件
  // 直接读取文件返回 Response，避免 net.fetch + file:// 在部分 Electron 版本下 ERR_FILE_NOT_FOUND
  protocol.handle('local-media', async (request) => {
    // local-media 注册为 standard 协议，new URL() 会把绝对路径首段（如 /Users 的 Users）
    // 当成 host 丢失并强制小写，导致读盘 404、图片碎图。
    // 因此直接从原始 URL 切掉 scheme 前缀取完整路径，保留首段、不受大小写影响。
    const rawPath = request.url.replace(/^local-media:\/\/+/i, '/');
    const filePath = decodeURIComponent(rawPath);
    try {
      const buffer = await fs.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mimeMap = {
        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
        '.bmp': 'image/bmp', '.ico': 'image/x-icon',
        '.mp4': 'video/mp4', '.webm': 'video/webm', '.ogg': 'video/ogg', '.mov': 'video/quicktime',
        '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.flac': 'audio/flac', '.aac': 'audio/aac',
      };
      return new Response(buffer, {
        headers: { 'Content-Type': mimeMap[ext] || 'application/octet-stream' },
      });
    } catch (err) {
      console.error('[local-media] failed to read:', filePath, err.message);
      return new Response('File not found', { status: 404 });
    }
  });

  await migrateLegacyUserDataIfNeeded();
  initDatabase();
  createMenu();
  createTray();
  await createWindow();

  // 生产环境下启动自动更新检查
  if (!process.env.VITE_DEV_SERVER_URL) {
    setupAutoUpdater();
    // 启动后 3 秒检查一次，之后每 30 分钟检查一次
    setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 3000);
    setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 30 * 60 * 1000);
  }

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
