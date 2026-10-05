/**
 * 本地 agent 的工作目录（L1-2）：挂载了本地项目就用项目根目录，否则用内容库根目录。
 * bypass 模式下 agent 能在 cwd 里任意改文件，所以不允许 home 本身、根目录和系统目录。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SYSTEM_DIRS = Object.freeze([
  '/bin', '/boot', '/dev', '/etc', '/lib', '/opt', '/private', '/proc', '/sbin', '/sys', '/tmp', '/usr', '/var',
  '/Applications', '/Library', '/System', '/Volumes',
  'C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)',
]);

const isSameOrInside = (dir, parent) => {
  const relative = path.relative(parent, dir);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

/** 这个目录能不能当工作目录（纯函数，不碰磁盘） */
export const isSafeWorkDir = (dir, { home = os.homedir() } = {}) => {
  if (!dir || !path.isAbsolute(dir)) return false;
  const resolved = path.resolve(dir);
  if (resolved === path.parse(resolved).root) return false;
  if (resolved === path.resolve(home)) return false;
  // home 的上级（/Users、/home）也不行
  if (isSameOrInside(path.resolve(home), resolved)) return false;
  return !SYSTEM_DIRS.some((sys) => isSameOrInside(resolved, sys));
};

const isDirectory = (dir) => {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
};

/**
 * 选工作目录：项目根目录优先，其次内容库根目录。
 * @returns {{ ok: true, cwd: string, source: 'project'|'vault' } | { ok: false, error: string }}
 */
export const resolveWorkDir = ({ projectRoot = '', vaultRoot = '', home = os.homedir(), exists = isDirectory } = {}) => {
  const candidates = [
    { dir: projectRoot, source: 'project' },
    { dir: vaultRoot, source: 'vault' },
  ].filter(({ dir }) => dir);
  const unsafe = candidates.find(({ dir }) => !isSafeWorkDir(dir, { home }));
  const picked = candidates.find(({ dir }) => isSafeWorkDir(dir, { home }) && exists(dir));
  if (picked) return { ok: true, cwd: path.resolve(picked.dir), source: picked.source };
  if (unsafe) return { ok: false, error: `不能把 ${unsafe.dir} 当作 agent 工作目录（home、根目录和系统目录都不允许）` };
  return { ok: false, error: '没有可用的工作目录：请先打开本地项目，或确认内容库目录存在' };
};
