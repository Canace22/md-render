// Web 版（File System Access）的根路径是合成标识，不是真实磁盘路径
const WEB_FS_ROOT_PREFIX = 'webfs:';

/**
 * 拼出本地项目节点在磁盘上的绝对路径；不是本地项目里的节点（或 Web 版合成路径）返回空串。
 * Windows 根路径带反斜杠时沿用反斜杠，其余用正斜杠。
 */
export const buildLocalEntryPath = (node) => {
  const root = String(node?.projectRootPath ?? '').replace(/[\\/]+$/, '');
  if (!root || root.startsWith(WEB_FS_ROOT_PREFIX)) return '';
  const sep = root.includes('\\') ? '\\' : '/';
  const rel = String(node?.relativePath ?? '').replace(/^[\\/]+/, '').replace(/[\\/]+/g, sep);
  return rel ? `${root}${sep}${rel}` : root;
};
