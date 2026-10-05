/**
 * MCP Bridge 的纯工具函数：定位握手文件、读取连接信息、缓存工具列表、识别「app 没开」。
 *
 * 单独成文件，方便单测（index.js 一导入就会启动 stdio server）。
 * 原则：任何一步失败都返回 null / 空，不抛到顶层，更不 process.exit——
 * MCP server 要能在 app 没开时活着，等 app 启动后继续工作。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// main.js 会把 Electron userData 固定到 appData/md-render。
// 这里必须跟实际目录一致，不能按 electron-builder productName 推断。
const APP_DIR_NAME = 'md-render';
const HANDSHAKE_FILE_NAME = 'agent-bridge.json';
const TOOL_CACHE_FILE_NAME = 'agent-bridge-tools.cache.json';
const INSTRUCTIONS_CACHE_FILE_NAME = 'agent-bridge-instructions.cache.txt';

export const NOT_RUNNING_MESSAGE =
  '调用失败：md-render 没在运行。请先打开 md-render 桌面版，再重试（不需要重启 MCP 客户端）。';

/** 各平台默认 appData 目录 */
const defaultAppDataDir = (platform = process.platform, env = process.env) => {
  const home = os.homedir();
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support');
  if (platform === 'win32') return env.APPDATA || path.join(home, 'AppData', 'Roaming');
  return env.XDG_CONFIG_HOME || path.join(home, '.config');
};

/** 握手文件路径 */
export const handshakeFilePath = (env = process.env) =>
  env.MD_RENDER_BRIDGE_FILE || path.join(defaultAppDataDir(process.platform, env), APP_DIR_NAME, HANDSHAKE_FILE_NAME);

/** 工具列表缓存文件：和握手文件放同一目录 */
export const toolCacheFilePath = (env = process.env) =>
  path.join(path.dirname(handshakeFilePath(env)), TOOL_CACHE_FILE_NAME);

/** instructions 缓存文件：MCP 握手时就要给 instructions，app 没开时用上次的 */
export const instructionsCacheFilePath = (env = process.env) =>
  path.join(path.dirname(handshakeFilePath(env)), INSTRUCTIONS_CACHE_FILE_NAME);

/** app 从没连上过时的兜底说明 */
export const DEFAULT_INSTRUCTIONS = [
  'md-render 是本地优先的内容创作工作台。这些工具直接操作用户打开的 md-render 桌面版。',
  '改正文、删除都会生成提案，需要用户在 app 里确认；用 get_proposal_status 查结果。',
  'md-render 没开时工具不可用，可先调用 md_render_status 查看。',
].join('\n');

export const readInstructionsCache = (file) => {
  try {
    const text = fs.readFileSync(file, 'utf8').trim();
    return text || DEFAULT_INSTRUCTIONS;
  } catch {
    return DEFAULT_INSTRUCTIONS;
  }
};

export const writeInstructionsCache = (file, text) => {
  if (!String(text ?? '').trim()) return;
  try {
    fs.writeFileSync(file, String(text), { mode: 0o600 });
  } catch {
    /* noop */
  }
};

/**
 * 读取控制桥连接信息。每次调用都重新读，app 重启后 url/token 会变。
 * @returns {{url:string,token:string}|null} 读不到 / 格式不对返回 null
 */
export const resolveBridge = (env = process.env) => {
  if (env.MD_RENDER_BRIDGE_URL && env.MD_RENDER_BRIDGE_TOKEN) {
    return { url: env.MD_RENDER_BRIDGE_URL, token: env.MD_RENDER_BRIDGE_TOKEN };
  }
  try {
    const info = JSON.parse(fs.readFileSync(handshakeFilePath(env), 'utf8'));
    return info?.url && info?.token ? { url: info.url, token: info.token } : null;
  } catch {
    return null;
  }
};

/** fetch 连不上（握手文件残留、app 已退出）时的错误 */
export const isConnectionError = (error) => {
  const code = error?.cause?.code || error?.code;
  return ['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EHOSTUNREACH'].includes(code)
    || /fetch failed/i.test(String(error?.message ?? ''));
};

/** 读上次成功拉到的工具列表（app 没开时先用它注册工具） */
export const readToolCache = (file) => {
  try {
    const tools = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(tools) ? tools : [];
  } catch {
    return [];
  }
};

/** 写工具列表缓存；失败不影响主流程 */
export const writeToolCache = (file, tools) => {
  try {
    fs.writeFileSync(file, JSON.stringify(tools), { mode: 0o600 });
  } catch {
    /* noop：目录不存在或无权限时放弃缓存 */
  }
};
