import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createMcpRequestHandler,
  handleMcpBody,
  handleMcpMessage,
  isAllowedOrigin,
  isAuthorized,
  loadOrCreateMcpConfig,
  DEFAULT_MCP_PORT,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '../main/mcpHttp.js';
import { buildClaudeCodeCommand, buildClaudeDesktopConfig, buildHttpMcpConfig } from '../renderer/src/utils/mcpConfig.js';

const TOOL_DEF = { type: 'function', function: { name: 'read_daily', description: '读速记', parameters: { type: 'object', properties: {} } } };
const deps = {
  instructions: '产品规则',
  listTools: async () => [TOOL_DEF],
  callTool: async (name, args) => ({ ok: name !== 'bad', result: name === 'bad' ? '失败' : { name, args } }),
};
const rpc = (method, params, id = 1) => ({ jsonrpc: '2.0', id, method, params });

describe('JSON-RPC 处理', () => {
  it('initialize 回协议版本、tools 能力和 instructions', async () => {
    const reply = await handleMcpMessage(rpc('initialize', { protocolVersion: '2025-06-18' }), deps);
    expect(reply.result.protocolVersion).toBe('2025-06-18');
    expect(reply.result.capabilities.tools).toBeTruthy();
    expect(reply.result.instructions).toBe('产品规则');
  });

  it('不认识的协议版本回最新支持的版本', async () => {
    const reply = await handleMcpMessage(rpc('initialize', { protocolVersion: '1999-01-01' }), deps);
    expect(reply.result.protocolVersion).toBe(SUPPORTED_PROTOCOL_VERSIONS[0]);
  });

  it('tools/list 转成 MCP 工具格式', async () => {
    const reply = await handleMcpMessage(rpc('tools/list'), deps);
    expect(reply.result.tools).toEqual([{ name: 'read_daily', description: '读速记', inputSchema: { type: 'object', properties: {} } }]);
  });

  it('tools/call 成功返回文本，失败标 isError', async () => {
    const ok = await handleMcpMessage(rpc('tools/call', { name: 'read_daily', arguments: { a: 1 } }), deps);
    expect(ok.result.isError).toBe(false);
    expect(JSON.parse(ok.result.content[0].text)).toEqual({ name: 'read_daily', args: { a: 1 } });
    const bad = await handleMcpMessage(rpc('tools/call', { name: 'bad' }), deps);
    expect(bad.result.isError).toBe(true);
  });

  it('工具抛异常也放进 isError，不变成协议错误', async () => {
    const reply = await handleMcpMessage(rpc('tools/call', { name: 'x' }), { ...deps, callTool: async () => { throw new Error('超时'); } });
    expect(reply.result.isError).toBe(true);
    expect(reply.result.content[0].text).toContain('超时');
  });

  it('通知不回包，未知方法回 -32601，缺工具名回 -32602', async () => {
    expect(await handleMcpMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }, deps)).toBeNull();
    expect((await handleMcpMessage(rpc('foo/bar'), deps)).error.code).toBe(-32601);
    expect((await handleMcpMessage(rpc('tools/call', {}), deps)).error.code).toBe(-32602);
  });

  it('批量请求过滤掉通知', async () => {
    const replies = await handleMcpBody([rpc('ping', {}, 7), { jsonrpc: '2.0', method: 'notifications/initialized' }], deps);
    expect(replies).toEqual([{ jsonrpc: '2.0', id: 7, result: {} }]);
  });
});

describe('鉴权与来源', () => {
  it('Origin 只放行本机或不带', () => {
    expect(isAllowedOrigin(undefined)).toBe(true);
    expect(isAllowedOrigin('http://localhost:5173')).toBe(true);
    expect(isAllowedOrigin('http://127.0.0.1')).toBe(true);
    expect(isAllowedOrigin('https://evil.com')).toBe(false);
    expect(isAllowedOrigin('not a url')).toBe(false);
  });

  it('token 必须完全一致', () => {
    expect(isAuthorized('Bearer abc', 'abc')).toBe(true);
    expect(isAuthorized('Bearer abd', 'abc')).toBe(false);
    expect(isAuthorized(undefined, 'abc')).toBe(false);
  });
});

describe('配置文件', () => {
  const dirs = [];
  afterEach(() => dirs.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));
  const tempFile = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-render-mcp-'));
    dirs.push(dir);
    return path.join(dir, 'mcp-http.json');
  };

  it('首次生成 token 并持久化，再读保持不变', () => {
    const file = tempFile();
    const first = loadOrCreateMcpConfig(file, {});
    expect(first.port).toBe(DEFAULT_MCP_PORT);
    expect(first.token).toMatch(/^[0-9a-f]{48}$/);
    expect(loadOrCreateMcpConfig(file, {})).toEqual(first);
  });

  it('环境变量覆盖端口但不写回', () => {
    const file = tempFile();
    expect(loadOrCreateMcpConfig(file, { MD_RENDER_MCP_PORT: '31000' }).port).toBe(31000);
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).port).toBe(DEFAULT_MCP_PORT);
  });
});

describe('HTTP 层', () => {
  let server;
  afterEach(() => server?.close());

  const start = () => new Promise((resolve) => {
    server = http.createServer(createMcpRequestHandler({ token: 't0k', ...deps }));
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
  });
  const post = (base, body, headers = {}) => fetch(`${base}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer t0k', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

  it('带 token 能 initialize + tools/list', async () => {
    const base = await start();
    const init = await (await post(base, rpc('initialize', {}))).json();
    expect(init.result.serverInfo.name).toBe('md-render');
    const list = await (await post(base, rpc('tools/list'))).json();
    expect(list.result.tools[0].name).toBe('read_daily');
  });

  it('缺 token 401，外部 Origin 403，GET 405，通知 202，坏 JSON 400', async () => {
    const base = await start();
    expect((await post(base, rpc('ping'), { Authorization: '' })).status).toBe(401);
    expect((await post(base, rpc('ping'), { Origin: 'https://evil.com' })).status).toBe(403);
    expect((await fetch(`${base}/mcp`, { headers: { Authorization: 'Bearer t0k' } })).status).toBe(405);
    expect((await post(base, { jsonrpc: '2.0', method: 'notifications/initialized' })).status).toBe(202);
    expect((await post(base, '{oops')).status).toBe(400);
  });
});

describe('设置页复制内容', () => {
  const info = { url: 'http://127.0.0.1:27183/mcp', token: 'abc' };
  it('HTTP 配置带 url 和 Authorization 头', () => {
    const server = JSON.parse(buildHttpMcpConfig(info)).mcpServers['md-render'];
    expect(server).toEqual({ type: 'http', url: info.url, headers: { Authorization: 'Bearer abc' } });
  });
  it('Claude Desktop：有 stdio 脚本用脚本，没有就走 mcp-remote', () => {
    const viaScript = JSON.parse(buildClaudeDesktopConfig({ mcpBridgeEntry: '/a/index.js', mcpHttp: info })).mcpServers['md-render'];
    expect(viaScript).toEqual({ command: 'node', args: ['/a/index.js'] });
    const viaRemote = JSON.parse(buildClaudeDesktopConfig({ mcpHttp: info })).mcpServers['md-render'];
    expect(viaRemote.args).toEqual(['-y', 'mcp-remote', info.url, '--header', 'Authorization:${AUTH_HEADER}']);
    expect(viaRemote.env.AUTH_HEADER).toBe('Bearer abc');
  });
  it('Claude Code 命令格式正确', () => {
    expect(buildClaudeCodeCommand(info)).toBe('claude mcp add --transport http md-render http://127.0.0.1:27183/mcp --header "Authorization: Bearer abc"');
  });
});
