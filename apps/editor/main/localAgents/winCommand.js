/**
 * Windows 下启动 .cmd / .bat：Node 20+ 不允许不经 shell 直接 spawn 它们（同步抛 `spawn EINVAL`）。
 * npm / pnpm 装的 CLI（codex、claude…）在 Windows 上就是 .cmd 启动脚本，
 * 优先解析出脚本真正调用的 js / exe 直接 spawn（参数里有换行时 cmd.exe 传不了）；
 * 认不出的启动脚本（如 Cursor 自带的）退回 cmd.exe，按 cross-spawn 的规则转义参数。
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const BATCH_EXT_PATTERN = /\.(cmd|bat)$/i;
const SCRIPT_EXT_PATTERN = /\.[cm]?js$/i;
const EXE_EXT_PATTERN = /\.exe$/i;
// npm cmd-shim 写 "%dp0%\xxx"，pnpm 写 "%~dp0\xxx"，手写脚本常省掉反斜杠写 "%~dp0xxx"
const SHIM_TARGET_PATTERN = /"%~?dp0%?\\?([^"]+)"/gi;
const NODE_EXE = 'node.exe';
const CMD_META_PATTERN = /([()\][%!^"`<>&|;, *?])/g;
const LINE_BREAK_PATTERN = /[\r\n]/;

export const isBatchFile = (file) => BATCH_EXT_PATTERN.test(String(file ?? ''));

/** 从 .cmd 内容里取目标路径（相对 .cmd 所在目录），跳过 node.exe 和带 %变量% 的；取不到返回空串 */
export const parseShimTarget = (content) => {
  const targets = [...String(content ?? '').matchAll(SHIM_TARGET_PATTERN)]
    .map((match) => match[1])
    .filter((target) => !target.includes('%') && path.win32.basename(target).toLowerCase() !== NODE_EXE);
  return targets.at(-1) ?? '';
};

const readText = (file) => readFileSync(file, 'utf8');

const escapeCmdMeta = (text) => text.replace(CMD_META_PATTERN, '^$1');

/** 参数先按 C 运行时规则加引号，再转义 cmd 元字符；.cmd 会把 %* 再解析一遍，所以元字符转两遍 */
const escapeCmdArg = (arg) => {
  const quoted = `"${String(arg).replace(/(\\*)"/g, '$1$1\\"').replace(/(\\*)$/, '$1$1')}"`;
  return escapeCmdMeta(escapeCmdMeta(quoted));
};

/** 经 cmd.exe 启动；参数里有换行时 cmd 传不了，返回 null */
export const buildCmdLaunch = (command, args = [], comspec = 'cmd.exe') => {
  if (args.some((arg) => LINE_BREAK_PATTERN.test(String(arg)))) return null;
  const line = [escapeCmdMeta(command), ...args.map(escapeCmdArg)].join(' ');
  return { command: comspec, args: ['/d', '/s', '/c', `"${line}"`], options: { windowsVerbatimArguments: true } };
};

/**
 * 转成可直接 spawn 的命令：非 Windows / 非 .cmd 原样返回；
 * .cmd 能认出目标就直接起目标，认不出走 cmd.exe；走 cmd.exe 又带换行参数时返回 null。
 * @returns {{ command: string, args: string[], options?: object } | null}
 */
export const resolveSpawnCommand = (command, args = [], {
  platform = process.platform,
  readFile = readText,
  exists = existsSync,
  comspec = process.env.ComSpec || 'cmd.exe',
} = {}) => {
  if (platform !== 'win32' || !isBatchFile(command)) return { command, args };
  let target = '';
  try {
    target = parseShimTarget(readFile(command));
  } catch { /* 读不了就走 cmd.exe */ }
  const dir = path.win32.dirname(command);
  const targetPath = target ? path.win32.join(dir, target) : '';
  if (EXE_EXT_PATTERN.test(targetPath)) return { command: targetPath, args };
  if (!SCRIPT_EXT_PATTERN.test(targetPath)) return buildCmdLaunch(command, args, comspec);
  // 和 npm 启动脚本一致：同目录有 node.exe 用它，否则用 PATH 里的 node
  const localNode = path.win32.join(dir, NODE_EXE);
  return { command: exists(localNode) ? localNode : 'node', args: [targetPath, ...args] };
};
