/**
 * 检测本机装了哪些 agent CLI / 本地模型服务（L0-2 ~ L0-4）。
 *
 * 顺序：当前 PATH → login shell 的 PATH → 常见安装目录 → 桌面 app 自带的 CLI。
 * 每项并行检测、单项超时，一个 CLI 卡住不拖垮整体；结果缓存，refresh 时重测。
 */
import { execFile } from 'node:child_process';
import { accessSync, constants, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import {
  LOCAL_AGENTS,
  LOCAL_AGENT_KINDS,
  LOCAL_AGENT_STATUS,
} from '@shared/localAgents.js';
import { expandHome, getAgentEnv, getCommonBinDirs } from './shellEnv.js';
import { resolveSpawnCommand } from './winCommand.js';

export const DETECT_TIMEOUT_MS = 3000;
const PROBE_TIMEOUT_MS = 1500;
const COMMAND_MAX_BUFFER = 256_000;
const APP_DIRS = ['/Applications', '~/Applications'];
const NOT_LOGGED_IN_PATTERN = /not logged in|not authenticated|authentication required|login required|unauthorized|please log ?in/i;
// Cursor CLI 的版本号形如 2026.09.28-64d2043
const CURSOR_VERSION_PATTERN = /^\d{4}\.\d{2}\.\d{2}-[0-9a-f]+$/;
const VERSION_PATTERN = /\d+\.\d+[\w.+-]*/;

const isExecutable = (file) => {
  try {
    accessSync(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

const resolveRealPath = (file) => {
  try {
    return realpathSync(file);
  } catch {
    return file;
  }
};

const failedResult = (error) => ({ ok: false, code: error?.code ?? 1, timedOut: false, output: error?.message ?? '' });

/** 跑一条短命令，超时 / 失败都不抛，返回 { ok, code, output } */
export const runShortCommand = (command, args, { env, timeout = DETECT_TIMEOUT_MS } = {}) => new Promise((resolve) => {
  const target = resolveSpawnCommand(command, args);
  if (!target) {
    resolve(failedResult(new Error(`无法解析启动脚本 ${command}`)));
    return;
  }
  try {
    execFile(target.command, target.args, {
      env: { ...env, NO_COLOR: '1' },
      timeout,
      killSignal: 'SIGKILL',
      maxBuffer: COMMAND_MAX_BUFFER,
      windowsHide: true,
    }, (error, stdout, stderr) => {
      const output = stripVTControlCharacters(`${stdout ?? ''}\n${stderr ?? ''}`).trim();
      resolve({ ok: !error, code: error ? (error.code ?? 1) : 0, timedOut: Boolean(error?.killed), output });
    });
  } catch (error) {
    // spawn 的部分错误（如 EINVAL）是同步抛的，不能让它变成整项检测失败
    resolve(failedResult(error));
  }
});

/** 候选路径（按优先级），纯函数 */
export const buildCandidatePaths = (agent, { pathEnv = '', home = os.homedir(), platform = process.platform } = {}) => {
  // Windows 上不带扩展名的同名文件是给 Git Bash 用的 sh 脚本，不能直接执行
  const exe = (name) => (platform === 'win32' ? [`${name}.exe`, `${name}.cmd`] : [name]);
  const pathDirs = String(pathEnv).split(path.delimiter).filter(Boolean);
  const extraDirs = [...(agent.extraDirs ?? []), ...getCommonBinDirs(platform)].map((dir) => expandHome(dir, home));
  const candidates = [];
  [...pathDirs, ...extraDirs].forEach((dir) => {
    agent.bins.forEach((bin) => exe(bin).forEach((name) => candidates.push({ bin, file: path.join(dir, name) })));
  });
  // bins 优先级高于目录：先把 cursor-agent 的所有位置排在 agent 前面
  candidates.sort((a, b) => agent.bins.indexOf(a.bin) - agent.bins.indexOf(b.bin));
  if (platform === 'darwin') {
    (agent.appBundlePaths ?? []).forEach((bundlePath) => {
      APP_DIRS.forEach((dir) => candidates.push({ bin: agent.bins[0], file: path.join(expandHome(dir, home), bundlePath) }));
    });
  }
  const seen = new Set();
  return candidates.filter(({ file }) => (seen.has(file) ? false : seen.add(file)));
};

/** 从 --version 输出里取版本号 */
export const parseVersion = (output) => {
  const firstLine = String(output ?? '').split('\n').map((line) => line.trim()).find(Boolean) ?? '';
  return firstLine.match(VERSION_PATTERN)?.[0] ?? firstLine.slice(0, 40);
};

/**
 * 重名的 `agent` 是不是 Cursor：真实路径里带 cursor，或版本号是 Cursor 的日期格式。
 */
export const isCursorBinary = ({ realPath = '', versionOutput = '' }) => (
  /cursor/i.test(realPath) || CURSOR_VERSION_PATTERN.test(String(versionOutput).trim().split('\n')[0] ?? '')
);

/** 登录检测输出 → 状态 */
export const parseLoginStatus = ({ ok, output }) => (
  ok && !NOT_LOGGED_IN_PATTERN.test(output ?? '') ? LOCAL_AGENT_STATUS.READY : LOCAL_AGENT_STATUS.NEEDS_LOGIN
);

const defaultDeps = () => ({
  getEnv: getAgentEnv,
  isExecutable,
  realPath: resolveRealPath,
  resolveCommand: resolveSpawnCommand,
  run: runShortCommand,
  probe: async (url) => {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
      return res.ok;
    } catch {
      return false;
    }
  },
  platform: process.platform,
  home: os.homedir(),
});

/** 找到第一个可用的二进制；重名 bin 要验明正身 */
const locateBinary = async (agent, env, deps) => {
  const candidates = buildCandidatePaths(agent, { pathEnv: env.PATH, home: deps.home, platform: deps.platform });
  for (const { bin, file } of candidates) {
    if (!deps.isExecutable(file)) continue;
    // 解析不了的 .cmd 启动脚本跑不起来，当作没找到
    if (!deps.resolveCommand(file, [], { platform: deps.platform })) continue;
    const versionResult = await deps.run(file, ['--version'], { env });
    if (agent.ambiguousBins?.includes(bin) && !isCursorBinary({ realPath: deps.realPath(file), versionOutput: versionResult.output })) {
      continue;
    }
    return { path: file, version: versionResult.ok ? parseVersion(versionResult.output) : '' };
  }
  return null;
};

const baseResult = (agent) => ({
  id: agent.id,
  label: agent.label,
  kind: agent.kind,
  priority: agent.priority,
  supported: agent.supported,
  installed: false,
  version: '',
  path: '',
  status: LOCAL_AGENT_STATUS.MISSING,
});

const detectCli = async (agent, env, deps) => {
  const found = await locateBinary(agent, env, deps);
  if (!found) return baseResult(agent);
  const result = { ...baseResult(agent), installed: true, ...found };
  if (!agent.supported) return { ...result, status: LOCAL_AGENT_STATUS.UNSUPPORTED };
  if (!agent.loginCheckArgs) return { ...result, status: LOCAL_AGENT_STATUS.UNVERIFIED };
  const login = await deps.run(found.path, agent.loginCheckArgs, { env });
  // 登录检测超时不等于没登录：标未验证，首轮再说
  if (login.timedOut) return { ...result, status: LOCAL_AGENT_STATUS.UNVERIFIED };
  return { ...result, status: parseLoginStatus(login) };
};

const detectModelServer = async (agent, deps) => {
  const reachable = await deps.probe(agent.probeUrl);
  return reachable
    ? { ...baseResult(agent), installed: true, path: agent.probeUrl, status: LOCAL_AGENT_STATUS.UNSUPPORTED }
    : baseResult(agent);
};

/** 单项总超时：卡住的 CLI 记成「没检测到」 */
const withTimeout = (promise, fallback, timeoutMs) => Promise.race([
  promise.catch(() => fallback),
  new Promise((resolve) => { setTimeout(() => resolve(fallback), timeoutMs).unref?.(); }),
]);

/**
 * 检测全部注册的 agent。
 * @returns {Promise<Array<{id,label,kind,priority,supported,installed,version,path,status}>>}
 */
export const detectAllLocalAgents = async (overrides = {}) => {
  const deps = { ...defaultDeps(), ...overrides };
  const env = await deps.getEnv();
  // 找二进制 + 版本 + 登录最多三条命令，总时限放宽到三倍单项超时
  const itemTimeout = (overrides.timeoutMs ?? DETECT_TIMEOUT_MS) * 3;
  return Promise.all(LOCAL_AGENTS.map((agent) => withTimeout(
    agent.kind === LOCAL_AGENT_KINDS.MODEL_SERVER ? detectModelServer(agent, deps) : detectCli(agent, env, deps),
    baseResult(agent),
    itemTimeout,
  )));
};

let cachedDetection = null;

/** 带缓存的检测；refresh 时重读 shell 环境并重测 */
export const detectLocalAgents = ({ refresh = false } = {}) => {
  if (cachedDetection && !refresh) return cachedDetection;
  if (refresh) getAgentEnv({ refresh: true });
  cachedDetection = detectAllLocalAgents().catch((error) => {
    cachedDetection = null;
    throw error;
  });
  return cachedDetection;
};

/** 已检测到的某个 agent 的可执行文件路径（运行时用） */
export const getDetectedAgent = async (id) => {
  const list = await detectLocalAgents();
  return list.find((item) => item.id === id && item.installed) || null;
};
