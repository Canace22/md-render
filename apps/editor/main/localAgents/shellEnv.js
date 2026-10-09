/**
 * 本地 agent 的运行环境：macOS 从 Finder 启动的 Electron 不继承 shell 的 PATH / 代理等变量，
 * 这里读一次 login shell 的环境变量并缓存，检测和 spawn 都用它（用户的代理、登录态依赖它）。
 */
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const SHELL_ENV_TIMEOUT_MS = 5000;
const SHELL_ENV_MAX_BUFFER = 1_000_000;
const ENV_MARKER = '__MD_RENDER_ENV__';
// 先用 -ilc：交互式才会读 .zshrc / .bashrc（多数人把代理 export 写在那）；读不到再退回只读 login 配置的 -lc
export const SHELL_ENV_FLAGS = Object.freeze(['-ilc', '-lc']);

/** 查不到时兜底的常见安装目录 */
export const COMMON_BIN_DIRS = Object.freeze([
  '~/.local/bin',
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '~/.npm-global/bin',
  '~/.volta/bin',
  '~/.bun/bin',
  '~/.claude/local',
  '~/.cursor/bin',
  // fnm 装的全局 npm 包（如 codex）只在 .zshrc 的 `fnm env` 里进 PATH，这里兜底默认 Node 版本
  '~/.local/share/fnm/aliases/default/bin',
]);

export const expandHome = (dir, home = os.homedir()) => (
  dir === '~' ? home : dir.startsWith('~/') ? path.join(home, dir.slice(2)) : dir
);

/** 解析 `env -0` 的输出（NUL 分隔，值里可能有换行） */
export const parseEnvOutput = (output) => {
  const text = String(output ?? '');
  const start = text.indexOf(ENV_MARKER);
  const body = start >= 0 ? text.slice(start + ENV_MARKER.length) : text;
  const env = {};
  body.split('\0').forEach((pair) => {
    const index = pair.indexOf('=');
    if (index <= 0) return;
    const key = pair.slice(0, index).replace(/^\s+/, '');
    if (key) env[key] = pair.slice(index + 1);
  });
  return env;
};

const readLoginShellEnv = (shell, flags) => new Promise((resolve) => {
  // 先打标记，避开 shell 启动脚本往 stdout 打的欢迎语
  execFile(shell, [flags, `printf '${ENV_MARKER}'; env -0`], {
    timeout: SHELL_ENV_TIMEOUT_MS,
    maxBuffer: SHELL_ENV_MAX_BUFFER,
    killSignal: 'SIGKILL',
    env: process.env,
  }, (error, stdout) => resolve(error && !stdout ? {} : parseEnvOutput(stdout)));
});

/** 按 SHELL_ENV_FLAGS 依次读，拿到 PATH 就算成功；全失败返回 {} */
export const readShellEnv = async (shell, read = readLoginShellEnv) => {
  for (const flags of SHELL_ENV_FLAGS) {
    const env = await read(shell, flags);
    if (env.PATH) return env;
  }
  return {};
};

/** 合并 PATH：login shell 的 → 当前进程的 → 常见目录（去重） */
export const mergePath = ({ shellPath = '', processPath = '', home = os.homedir() } = {}) => {
  const dirs = [
    ...String(shellPath).split(path.delimiter),
    ...String(processPath).split(path.delimiter),
    ...COMMON_BIN_DIRS.map((dir) => expandHome(dir, home)),
  ].filter(Boolean);
  return [...new Set(dirs)].join(path.delimiter);
};

let cachedEnv = null;

/**
 * agent 运行环境：login shell 环境 + 当前进程环境，PATH 合并。结果缓存，refresh 时重读。
 * Windows 没有 login shell 的问题，直接用 process.env。
 */
export const getAgentEnv = ({ refresh = false } = {}) => {
  if (cachedEnv && !refresh) return cachedEnv;
  const shell = process.env.SHELL || '/bin/zsh';
  const shellEnvPromise = process.platform === 'win32' ? Promise.resolve({}) : readShellEnv(shell);
  cachedEnv = shellEnvPromise.then((shellEnv) => {
    const env = { ...shellEnv, ...process.env };
    env.PATH = mergePath({ shellPath: shellEnv.PATH, processPath: process.env.PATH });
    // 从 Electron 继承的这个变量会让 node 写的 CLI 以 Electron 身份启动
    delete env.ELECTRON_RUN_AS_NODE;
    return env;
  });
  return cachedEnv;
};
