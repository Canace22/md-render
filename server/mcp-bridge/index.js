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
 * 前提：MD Render 桌面版必须正在运行。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// main.js 会把 Electron userData 固定到 appData/md-render。
// 这里必须跟实际目录一致，不能按 electron-builder productName 推断。
const APP_DIR_NAME = 'md-render';

/** 各平台默认 userData 目录 */
const defaultUserDataDir = () => {
  const home = os.homedir();
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Application Support');
  if (process.platform === 'win32') return process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
  return process.env.XDG_CONFIG_HOME || path.join(home, '.config');
};

/** 读取控制桥连接信息 { url, token } */
const resolveBridge = () => {
  if (process.env.MD_RENDER_BRIDGE_URL && process.env.MD_RENDER_BRIDGE_TOKEN) {
    return { url: process.env.MD_RENDER_BRIDGE_URL, token: process.env.MD_RENDER_BRIDGE_TOKEN };
  }
  const file =
    process.env.MD_RENDER_BRIDGE_FILE ||
    path.join(defaultUserDataDir(), APP_DIR_NAME, 'agent-bridge.json');
  const raw = fs.readFileSync(file, 'utf8');
  const info = JSON.parse(raw);
  if (!info?.url || !info?.token) throw new Error(`握手文件缺少 url/token：${file}`);
  return { url: info.url, token: info.token };
};

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

async function main() {
  const bridge = resolveBridge();

  const server = new Server(
    { name: 'md-render-bridge', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const data = await bridgeFetch(bridge, '/tools');
    const tools = Array.isArray(data?.tools) ? data.tools : [];
    return { tools: tools.map(toMcpTool) };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      const data = await bridgeFetch(bridge, '/invoke', {
        method: 'POST',
        body: JSON.stringify({ name, args: args || {} }),
      });
      const result = typeof data.result === 'string' ? data.result : JSON.stringify(data.result);
      return {
        content: [{ type: 'text', text: result ?? '' }],
        isError: data.ok === false,
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `调用失败：${error.message}` }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[md-render-mcp] connected to bridge at', bridge.url);
}

main().catch((error) => {
  console.error('[md-render-mcp] fatal:', error.message);
  process.exit(1);
});
