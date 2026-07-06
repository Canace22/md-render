export function registerUpdaterHandlers({ ipcMain, autoUpdater }) {
  ipcMain.handle('updater:check', () => {
    autoUpdater.checkForUpdates().catch((err) =>
      console.error('[updater] manual check failed:', err));
    return { ok: true };
  });

  ipcMain.handle('updater:download', () => {
    autoUpdater.downloadUpdate().catch((err) =>
      console.error('[updater] download failed:', err));
    return { ok: true };
  });

  ipcMain.handle('updater:install', () => {
    autoUpdater.quitAndInstall(false, true);
    return { ok: true };
  });
}
