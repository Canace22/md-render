import { getMdRenderRootPath } from '../localProject.js';
import { getVaultSkillsDir, readSkillEntries, watchSkillsDir } from '../skillFiles.js';

export const SKILLS_CHANGED_CHANNEL = 'skills:changed';

/**
 * 内容库 skill：列出原始文件 + 目录变化时通知 renderer 重新加载。
 * 第一次读取时才开始监听，避免启动时就去建目录。
 */
export function registerSkillHandlers({ ipcMain, getMainWindow, getSkillsDir = () => getVaultSkillsDir(getMdRenderRootPath()) }) {
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

  return () => stopWatching?.();
}
