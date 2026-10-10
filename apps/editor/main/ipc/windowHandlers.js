import { clipboard, nativeImage } from 'electron';
import { copyImageSrcToClipboard } from '../clipboardImage.js';

export function registerWindowHandlers({ ipcMain, app, getMainWindow }) {
  ipcMain.handle('window-is-fullscreen', () => getMainWindow()?.isFullScreen() ?? false);
  ipcMain.handle('get-app-version', () => app.getVersion());
  ipcMain.handle('copy-image-to-clipboard', (_event, src) => (
    copyImageSrcToClipboard(src, { clipboard, nativeImage })
  ));
}
