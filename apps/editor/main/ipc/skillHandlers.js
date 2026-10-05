import { getMdRenderRootPath } from '../localProject.js';
import {
  getVaultSkillsDir,
  isInsideSkillsDir,
  readSkillEntries,
  watchSkillsDir,
  writeSkillFiles,
} from '../skillFiles.js';

export const SKILLS_CHANGED_CHANNEL = 'skills:changed';

/**
 * 内容库 skill：列出原始文件 + 目录变化时通知 renderer 重新加载。
 * 第一次读取时才开始监听，避免启动时就去建目录。
 */
export function registerSkillHandlers({
  ipcMain,
  getMainWindow,
  openPath = async () => '',
  getSkillsDir = () => getVaultSkillsDir(getMdRenderRootPath()),
}) {
  let stopWatching = null;

  const ensureWatching = (skillsDir) => {
    if (stopWatching) return;
    stopWatching = watchSkillsDir(skillsDir, () => {
      getMainWindow?.()?.webContents?.send(SKILLS_CHANGED_CHANNEL, { skillsDir });
    });
  };

  ipcMain.handle('skills:list', async () => {
    const skillsDir = getSkillsDir();
    try {
      const entries = await readSkillEntries(skillsDir);
      ensureWatching(skillsDir);
      return { ok: true, skillsDir, entries };
    } catch (err) {
      return { ok: false, skillsDir, entries: [], error: err.message };
    }
  });

  // 新建 skill，或把内置 skill 复制到内容库（已有同名就保留用户的版本）
  ipcMain.handle('skills:write', async (_event, payload = {}) => {
    const skillsDir = getSkillsDir();
    try {
      const { skillPath, existed } = await writeSkillFiles(skillsDir, payload, { overwrite: Boolean(payload.overwrite) });
      return { ok: true, skillPath, existed };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // 用系统默认程序打开 skill 文件；只允许内容库 skill 目录里的文件
  ipcMain.handle('skills:open', async (_event, payload = {}) => {
    const skillsDir = getSkillsDir();
    if (!isInsideSkillsDir(skillsDir, payload.skillPath)) {
      return { ok: false, error: '只能打开内容库 skill 目录里的文件' };
    }
    const error = await openPath(payload.skillPath);
    return error ? { ok: false, error } : { ok: true };
  });

  return () => stopWatching?.();
}
