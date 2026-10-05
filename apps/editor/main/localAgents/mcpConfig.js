/**
 * 把 md-render 的工具（mcp-bridge）借给本地 agent（L1-6 / L1-5 / L1-8）。
 *
 * - 用 Electron 自身（process.execPath + ELECTRON_RUN_AS_NODE=1）跑 mcp-bridge：用户机器不一定装了 node。
 * - 打包后 mcp-bridge 是 resources/mcp-bridge/index.mjs（打包脚本用 esbuild 打成单文件）；开发时直接跑仓库里的源码。
 * - skill 工具白名单通过 MD_RENDER_ALLOWED_TOOLS 交给 mcp-bridge 过滤，三家 agent 通用。
 * 生成配置的函数都是纯函数，方便单测。
 */
import fs from 'node:fs';
import path from 'node:path';

export const MD_RENDER_MCP_NAME = 'md-render';
export const ALLOWED_TOOLS_ENV = 'MD_RENDER_ALLOWED_TOOLS';
const PACKAGED_BRIDGE_RELATIVE = path.join('mcp-bridge', 'index.mjs');
const CURSOR_MCP_RELATIVE = path.join('.cursor', 'mcp.json');

/** mcp-bridge 脚本位置：打包后在 resources，开发时在仓库 server/mcp-bridge */
export const findMcpBridgeScript = ({
  isPackaged = false,
  resourcesPath = process.resourcesPath,
  mainDir,
  exists = fs.existsSync,
} = {}) => {
  const candidates = isPackaged
    ? [path.join(resourcesPath ?? '', PACKAGED_BRIDGE_RELATIVE)]
    : [
      path.resolve(mainDir, '../../../server/mcp-bridge/index.js'),
      path.resolve(mainDir, '../../../../server/mcp-bridge/index.js'),
    ];
  return candidates.find((candidate) => exists(candidate)) || '';
};

/**
 * mcp-bridge 的启动配置。
 * @param {{ execPath: string, scriptPath: string, bridgeFile: string, allowedTools?: string[]|null }} params
 * @returns {{ command: string, args: string[], env: Record<string,string> } | null}
 */
export const buildMcpLaunchConfig = ({ execPath, scriptPath, bridgeFile, allowedTools = null }) => {
  if (!execPath || !scriptPath) return null;
  const env = { ELECTRON_RUN_AS_NODE: '1' };
  if (bridgeFile) env.MD_RENDER_BRIDGE_FILE = bridgeFile;
  // null = 放行全部 md-render 工具；[] = 一个都不给
  if (Array.isArray(allowedTools)) env[ALLOWED_TOOLS_ENV] = allowedTools.join(',');
  return { command: execPath, args: [scriptPath], env };
};

/** Claude Code：--mcp-config 接受 JSON 字符串 */
export const toClaudeMcpConfig = (launch) => JSON.stringify({ mcpServers: { [MD_RENDER_MCP_NAME]: launch } });

const tomlString = (value) => JSON.stringify(String(value));
const tomlArray = (items) => `[${items.map(tomlString).join(', ')}]`;
const tomlInlineTable = (obj) => `{ ${Object.entries(obj).map(([key, value]) => `${key} = ${tomlString(value)}`).join(', ')} }`;

/** Codex：-c 覆盖配置，值按 TOML 解析 */
export const toCodexConfigArgs = (launch) => {
  const prefix = `mcp_servers.${MD_RENDER_MCP_NAME}`;
  return [
    '-c', `${prefix}.command=${tomlString(launch.command)}`,
    '-c', `${prefix}.args=${tomlArray(launch.args)}`,
    '-c', `${prefix}.env=${tomlInlineTable(launch.env)}`,
  ];
};

/**
 * Cursor：往工作目录的 .cursor/mcp.json 合并 md-render 一项，其余配置原样保留。
 * @returns {{ text: string, changed: boolean } | { error: string }}
 */
export const mergeCursorMcpJson = (existingText, launch) => {
  let config = {};
  if (String(existingText ?? '').trim()) {
    try {
      config = JSON.parse(existingText);
    } catch {
      return { error: '.cursor/mcp.json 不是合法 JSON，未注入 md-render 工具' };
    }
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      return { error: '.cursor/mcp.json 格式不对，未注入 md-render 工具' };
    }
  }
  const servers = config.mcpServers && typeof config.mcpServers === 'object' ? config.mcpServers : {};
  const nextConfig = { ...config, mcpServers: { ...servers, [MD_RENDER_MCP_NAME]: launch } };
  const changed = JSON.stringify(servers[MD_RENDER_MCP_NAME] ?? null) !== JSON.stringify(launch);
  return { text: `${JSON.stringify(nextConfig, null, 2)}\n`, changed };
};

/** 写 Cursor 的 mcp.json；没变化不写，失败返回错误文案（不阻断本轮） */
export const writeCursorMcpConfig = async (cwd, launch) => {
  const file = path.join(cwd, CURSOR_MCP_RELATIVE);
  let existing = '';
  try {
    existing = await fs.promises.readFile(file, 'utf8');
  } catch {
    /* 文件不存在：新建 */
  }
  const merged = mergeCursorMcpJson(existing, launch);
  if (merged.error) return { ok: false, error: merged.error };
  if (!merged.changed) return { ok: true, changed: false };
  try {
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    await fs.promises.writeFile(file, merged.text, 'utf8');
    return { ok: true, changed: true };
  } catch (error) {
    return { ok: false, error: `写入 .cursor/mcp.json 失败：${error.message}` };
  }
};
