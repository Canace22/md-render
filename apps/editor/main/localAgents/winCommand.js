/**
 * Windows 下启动 .cmd / .bat：Node 20+ 不允许不经 shell 直接 spawn 它们（同步抛 `spawn EINVAL`）。
 * npm / pnpm 装的 CLI（codex、claude…）在 Windows 上就是 .cmd 启动脚本，
 * 这里解析出脚本真正调用的 js / exe 直接 spawn，不走 cmd.exe（参数里有换行、引号时 cmd 转义不可靠）。
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const BATCH_EXT_PATTERN = /\.(cmd|bat)$/i;
const SCRIPT_EXT_PATTERN = /\.[cm]?js$/i;
// npm cmd-shim 写 "%dp0%\xxx"，pnpm 写 "%~dp0\xxx"
const SHIM_TARGET_PATTERN = /"%~?dp0%?\\([^"]+)"/gi;
const NODE_EXE = 'node.exe';

export const isBatchFile = (file) => BATCH_EXT_PATTERN.test(String(file ?? ''));

/** 从 .cmd 内容里取目标路径（相对 .cmd 所在目录），跳过 node.exe；取不到返回空串 */
export const parseShimTarget = (content) => {
  const targets = [...String(content ?? '').matchAll(SHIM_TARGET_PATTERN)]
    .map((match) => match[1])
    .filter((target) => path.win32.basename(target).toLowerCase() !== NODE_EXE);
  return targets.at(-1) ?? '';
};

const readText = (file) => readFileSync(file, 'utf8');

/**
 * 转成可直接 spawn 的命令：非 Windows / 非 .cmd 原样返回；.cmd 解析不了返回 null。
 * @returns {{ command: string, args: string[] } | null}
 */
export const resolveSpawnCommand = (command, args = [], {
  platform = process.platform,
  readFile = readText,
  exists = existsSync,
} = {}) => {
  if (platform !== 'win32' || !isBatchFile(command)) return { command, args };
  let target = '';
  try {
    target = parseShimTarget(readFile(command));
  } catch {
    return null;
  }
  if (!target) return null;
  const dir = path.win32.dirname(command);
  const targetPath = path.win32.join(dir, target);
  if (!SCRIPT_EXT_PATTERN.test(targetPath)) return { command: targetPath, args };
  // 和 npm 启动脚本一致：同目录有 node.exe 用它，否则用 PATH 里的 node
  const localNode = path.win32.join(dir, NODE_EXE);
  return { command: exists(localNode) ? localNode : 'node', args: [targetPath, ...args] };
};
