export function registerWindowHandlers({ ipcMain, app, getMainWindow }) {
  ipcMain.handle('window-is-fullscreen', () => getMainWindow()?.isFullScreen() ?? false);
  ipcMain.handle('get-app-version', () => app.getVersion());
}
