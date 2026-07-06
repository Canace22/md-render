import { BrowserWindow, dialog } from 'electron';
import fs from 'fs/promises';

export function registerExportHandlers({ ipcMain, getMainWindow }) {
  ipcMain.handle('export-save-file', async (_event, payload = {}) => {
    const { defaultName, filters, content, encoding } = payload;
    const result = await dialog.showSaveDialog(getMainWindow() ?? undefined, {
      title: '导出文件',
      defaultPath: defaultName,
      filters,
    });
    if (result.canceled || !result.filePath) return { canceled: true };

    if (encoding === 'base64') {
      await fs.writeFile(result.filePath, Buffer.from(content, 'base64'));
    } else {
      await fs.writeFile(result.filePath, content, 'utf8');
    }
    return { canceled: false, filePath: result.filePath };
  });

  ipcMain.handle('export-to-pdf', async (_event, payload = {}) => {
    const { html, defaultName } = payload;
    const result = await dialog.showSaveDialog(getMainWindow() ?? undefined, {
      title: '导出 PDF',
      defaultPath: defaultName || 'export.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };

    const printWin = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
    await printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const pdfBuffer = await printWin.webContents.printToPDF({
      marginsType: 0,
      printBackground: true,
      landscape: false,
      pageSize: 'A4',
    });
    printWin.close();

    await fs.writeFile(result.filePath, pdfBuffer);
    return { canceled: false, filePath: result.filePath };
  });
}
