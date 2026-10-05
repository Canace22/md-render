#!/usr/bin/env node
/**
 * MD Render MCP Bridge
 *
 * 一个独立的 stdio MCP server，把 MD Render app 的「安全工具」暴露给别的 AI
 * （Claude Desktop / Cursor 等 MCP 客户端）。
 *
 * 工作方式：
 *   1. MD Render 桌面版启动时会在 userData 目录写一个握手文件 agent-bridge.json，
 *      内含本地控制桥的 { url, token }。
 *   2. 本 server 读握手文件，向控制桥拉工具列表（/tools），并把每个工具注册成 MCP 工具。
 *   3. MCP 客户端调用工具时，本 server POST /invoke，控制桥转发给 app 执行后原路返回。
 *
 * 握手文件位置（按优先级）：
 *   - 环境变量 MD_RENDER_BRIDGE_FILE 指定的路径
 *   - 或各平台默认 userData：<userData>/md-render/agent-bridge.json
 * 也可以直接用 MD_RENDER_BRIDGE_URL + MD_RENDER_BRIDGE_TOKEN 两个环境变量跳过握手文件。
 *
 * app 没开时本 server 照常存活：每次调用都重新读握手文件，读不到就返回「md-render 没在运行」；
 * 并定期探测，app 启动后发 tools/list_changed 通知客户端刷新工具列表。
 */
import process from 'node:process';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import {
  NOT_RUNNING_MESSAGE,
  isConnectionError,
  readToolCache,
  resolveBridge,
  toolCacheFilePath,
  writeToolCache,
} from './bridgeClient.js';

/** 探测 app 是否启动 / 重启的间隔 */
const WATCH_INTERVAL_MS = 5000;

/** app 没开且没有缓存时，至少给客户端一个能解释现状的工具 */
const STATUS_TOOL = Object.freeze({
  name: 'md_render_status',
  description: '查看 md-render 桌面版是否在运行。md-render 没开时其它工具不可用。',
  inputSchema: { type: 'object', properties: {} },
});

const bridgeFetch = async (bridge, pathname, options = {}) => {
  const res = await fetch(`${bridge.url}${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${bridge.token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { ok: false, error: `非 JSON 响应：${text.slice(0, 200)}` };
  }
  if (!res.ok) throw new Error(json?.error || `控制桥返回 ${res.status}`);
  return json;
};

/** 从 OpenAI 工具定义转成 MCP 工具定义 */
const toMcpTool = (def) => ({
  name: def.function.name,
  description: def.function.description || '',
  inputSchema: def.function.parameters || { type: 'object', properties: {} },
});

const textResult = (text, isError = false) => ({
  content: [{ type: 'text', text: text ?? '' }],
  isError,
});

/** 拉工具列表：app 在线就拉最新并缓存；不在线用缓存；都没有就只给状态工具 */
const listTools = async (cacheFile) => {
  const bridge = resolveBridge();
  if (bridge) {
    try {
      const data = await bridgeFetch(bridge, '/tools');
      const tools = (Array.isArray(data?.tools) ? data.tools : []).map(toMcpTool);
      if (tools.length) writeToolCache(cacheFile, tools);
      return tools;
    } catch {
      /* 握手文件残留或 app 正在启动：退回缓存 */
    }
  }
  const cached = readToolCache(cacheFile);
  return cached.length ? cached : [STATUS_TOOL];
};

/** 调用一次工具：每次都重新读握手文件，app 重启后不用重启 MCP 客户端 */
const callTool = async (name, args) => {
  const bridge = resolveBridge();
  if (name === STATUS_TOOL.name) {
    return textResult(bridge ? 'md-render 正在运行。' : NOT_RUNNING_MESSAGE, !bridge);
  }
  if (!bridge) return textResult(NOT_RUNNING_MESSAGE, true);
  try {
    const data = await bridgeFetch(bridge, '/invoke', {
      method: 'POST',
      body: JSON.stringify({ name, args: args || {} }),
    });
    const result = typeof data.result === 'string' ? data.result : JSON.stringify(data.result);
    return textResult(result, data.ok === false);
  } catch (error) {
    return textResult(isConnectionError(error) ? NOT_RUNNING_MESSAGE : `调用失败：${error.message}`, true);
  }
};

/** 定期看握手文件：app 启动 / 重启（url 变化）后通知客户端刷新工具列表 */
const watchBridge = (server) => {
  let lastUrl = resolveBridge()?.url ?? null;
  const timer = setInterval(() => {
    const url = resolveBridge()?.url ?? null;
    if (url === lastUrl) return;
    lastUrl = url;
    if (url) server.sendToolListChanged().catch(() => {});
  }, WATCH_INTERVAL_MS);
  timer.unref?.();
};

async function main() {
  const cacheFile = toolCacheFilePath();
  const server = new Server(
    { name: 'md-render-bridge', version: '0.2.0' },
    { capabilities: { tools: { listChanged: true } } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: await listTools(cacheFile) }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return callTool(name, args);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  watchBridge(server);
  const bridge = resolveBridge();
  console.error('[md-render-mcp] started;', bridge ? `bridge at ${bridge.url}` : 'md-render 未运行，等待启动');
}

main().catch((error) => {
  // 只有 stdio 本身起不来才退出；app 没开不算致命错误
  console.error('[md-render-mcp] fatal:', error.message);
  process.exit(1);
});
