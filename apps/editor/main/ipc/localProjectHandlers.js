import { dialog, shell } from 'electron';
import fs from 'fs/promises';
import {
  createLocalProjectFile,
  createLocalProjectFolder,
  deleteLocalProjectEntry,
  ensureMdRenderWorkspaceData,
  fetchBookmarkPageSnapshot,
  readDailyWorkspaceBackup,
  readLocalProjectFileContent,
  readLocalProjectWorkspace,
  readProjectsChildren,
  renameLocalProjectEntry,
  resolveProjectFilePath,
  saveBinaryAsset,
  saveDailyWorkspaceBackup,
  saveLocalProjectFile,
  saveLocalProjectMetadata,
} from '../localProject.js';

export function registerLocalProjectHandlers({
  ipcMain,
  getMainWindow,
  startWatchingLocalProject,
  markSavedLocalFileIgnored,
  markLocalProjectRootIgnored,
  markLocalProjectWriteIgnored,
}) {
  ipcMain.handle('open-local-project', async () => {
    const result = await dialog.showOpenDialog(getMainWindow() ?? undefined, {
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

  ipcMain.handle('select-cover-image', async () => {
    const result = await dialog.showOpenDialog(getMainWindow() ?? undefined, {
      title: '选择封面图片',
      properties: ['openFile'],
      filters: [
        { name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'] },
      ],
    });
    if (result.canceled || !result.filePaths?.length) {
      return { canceled: true };
    }
    return { canceled: false, filePath: result.filePaths[0] };
  });

  ipcMain.handle('pick-file', async (_event, payload = {}) => {
    const { title = '选择文件', extensions = [] } = payload;
    const result = await dialog.showOpenDialog(getMainWindow() ?? undefined, {
      title,
      properties: ['openFile'],
      filters: extensions.length ? [{ name: title, extensions }] : undefined,
    });
    if (result.canceled || !result.filePaths?.length) {
      return { canceled: true };
    }
    return { canceled: false, filePath: result.filePaths[0] };
  });

  ipcMain.handle('pick-save-path', async (_event, payload = {}) => {
    const { title = '保存文件', defaultName = 'output', extensions = [] } = payload;
    const result = await dialog.showSaveDialog(getMainWindow() ?? undefined, {
      title,
      defaultPath: defaultName,
      filters: extensions.length ? [{ name: title, extensions }] : undefined,
    });
    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }
    return { canceled: false, filePath: result.filePath };
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

  ipcMain.handle('save-local-project-metadata', async (_event, payload = {}) => {
    const { projectRootPath, relativePath, metadata } = payload;
    await saveLocalProjectMetadata(projectRootPath, relativePath, metadata);
    markSavedLocalFileIgnored(projectRootPath, relativePath);
    return { ok: true };
  });

  ipcMain.handle('ensure-md-render-workspace', async () => {
    const result = await ensureMdRenderWorkspaceData();
    startWatchingLocalProject(result.projectRootPath);
    return result;
  });

  ipcMain.handle('read-daily-workspace-backup', async (_event, payload = {}) => {
    const { projectRootPath } = payload;
    return {
      ok: true,
      dailyWorkspace: await readDailyWorkspaceBackup(projectRootPath),
    };
  });

  ipcMain.handle('save-daily-workspace-backup', async (_event, payload = {}) => {
    const { projectRootPath, dailyWorkspace } = payload;
    const result = await saveDailyWorkspaceBackup(projectRootPath, dailyWorkspace);
    if (result?.relativePath) {
      markSavedLocalFileIgnored(projectRootPath, result.relativePath);
    }
    return { ok: true, ...result };
  });

  ipcMain.handle('create-local-project-file', async (_event, payload = {}) => {
    const { projectRootPath, relativePath, content } = payload;
    const result = await createLocalProjectFile(projectRootPath, relativePath, content);
    markSavedLocalFileIgnored(projectRootPath, result.relativePath ?? relativePath);
    return result;
  });

  ipcMain.handle('create-local-project-folder', async (_event, payload = {}) => {
    const { projectRootPath, relativePath } = payload;
    const result = await createLocalProjectFolder(projectRootPath, relativePath);
    markLocalProjectRootIgnored(projectRootPath);
    return result;
  });

  ipcMain.handle('save-binary-asset', async (_event, payload = {}) => {
    const { projectRootPath, base64, mimeSubtype } = payload;
    const result = await saveBinaryAsset(projectRootPath, base64, mimeSubtype);
    markLocalProjectRootIgnored(projectRootPath);
    markSavedLocalFileIgnored(projectRootPath, result.relativePath);
    return result;
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
    markLocalProjectRootIgnored(projectRootPath);
    try {
      markLocalProjectWriteIgnored(resolveProjectFilePath(projectRootPath, relativePath));
    } catch {
      // ignore
    }
    return { ok: true };
  });

  ipcMain.handle('read-local-project-file-content', async (_event, payload = {}) => {
    const { projectRootPath, relativePath } = payload;
    try {
      const result = await readLocalProjectFileContent(projectRootPath, relativePath);
      return { ok: true, ...result };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('reveal-local-project-entry', async (_event, payload = {}) => {
    const { projectRootPath, relativePath = '' } = payload;
    if (!projectRootPath) {
      return { ok: false, error: '缺少项目路径' };
    }

    try {
      const targetPath = relativePath
        ? resolveProjectFilePath(projectRootPath, relativePath)
        : projectRootPath;
      const stat = await fs.stat(targetPath);

      if (stat.isDirectory()) {
        const errorMessage = await shell.openPath(targetPath);
        if (errorMessage) {
          return { ok: false, error: errorMessage };
        }
        return { ok: true, targetPath, kind: 'directory' };
      }

      shell.showItemInFolder(targetPath);
      return { ok: true, targetPath, kind: 'file' };
    } catch (err) {
      return { ok: false, error: err?.message || '在文件管理器中查看失败' };
    }
  });

  ipcMain.handle('fetch-bookmark-page-snapshot', async (_event, payload = {}) => {
    try {
      const result = await fetchBookmarkPageSnapshot(payload.url);
      return { ok: true, ...result };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
}
