/**
 * 本机 HTTP MCP（Streamable HTTP，无状态、只回 JSON，不开 SSE）。
 *
 * 作用：让 Claude Code / Codex / Cursor / Cherry Studio 这类支持 HTTP MCP 的客户端
 * 直接连 http://127.0.0.1:<port>/mcp，不用再装 node 脚本（打包版本来也不带 mcp-bridge）。
 *
 * 和 stdio 版 mcp-bridge 用同一套工具和风险分级：工具列表、执行都走 agentBridge 里的 renderer 调用。
 *
 * 安全：
 *   - 只监听 127.0.0.1；
 *   - 固定 token（首次启动生成，存 userData/mcp-http.json，0600），请求要带 Authorization: Bearer <token>；
 *   - 带 Origin 头且不是本机来源的请求一律拒绝（防 DNS rebinding / 网页偷调）。
 */
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';

export const MCP_HTTP_CONFIG_FILE = 'mcp-http.json';
export const MCP_PATH = '/mcp';
export const DEFAULT_MCP_PORT = 27183;
const HOST = '127.0.0.1';
const MAX_BODY_BYTES = 1_000_000;
const TOKEN_BYTES = 24;

/** 支持的协议版本，按新到旧；客户端要的不在列表里就回最新的 */
export const SUPPORTED_PROTOCOL_VERSIONS = Object.freeze(['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']);
const SERVER_INFO = Object.freeze({ name: 'md-render', version: '1.0.0' });

const RPC = Object.freeze({ PARSE_ERROR: -32700, INVALID_REQUEST: -32600, METHOD_NOT_FOUND: -32601, INVALID_PARAMS: -32602, INTERNAL: -32603 });

// ── 配置：固定端口 + 固定 token ─────────────────────────────

const isValidPort = (port) => Number.isInteger(port) && port > 0 && port < 65536;

/**
 * 读 mcp-http.json；没有或不完整就补齐并写回。端口可被环境变量 MD_RENDER_MCP_PORT 覆盖（不写回）。
 * @returns {{port:number, token:string}}
 */
export const loadOrCreateMcpConfig = (file, env = process.env) => {
  let saved = {};
  try {
    saved = JSON.parse(fs.readFileSync(file, 'utf8')) || {};
  } catch {
    /* 第一次启动 */
  }
  const config = {
    port: isValidPort(saved.port) ? saved.port : DEFAULT_MCP_PORT,
    token: typeof saved.token === 'string' && saved.token ? saved.token : crypto.randomBytes(TOKEN_BYTES).toString('hex'),
  };
  if (config.port !== saved.port || config.token !== saved.token) {
    try {
      fs.writeFileSync(file, JSON.stringify(config, null, 2), { mode: 0o600 });
    } catch (error) {
      console.warn('[mcp-http] failed to write config:', error.message);
    }
  }
  const envPort = Number(env.MD_RENDER_MCP_PORT);
  return isValidPort(envPort) ? { ...config, port: envPort } : config;
};

// ── 请求校验 ────────────────────────────────────────────────

/** 没带 Origin（命令行客户端）放行；带了就必须是本机 */
export const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  try {
    return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname);
  } catch {
    return false;
  }
};

/** 定长比较，避免按字节提前返回泄露 token */
export const isAuthorized = (header, token) => {
  const expected = Buffer.from(`Bearer ${token}`);
  const actual = Buffer.from(String(header ?? ''));
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
};

// ── JSON-RPC 处理（纯逻辑，便于单测）────────────────────────

const rpcResult = (id, result) => ({ jsonrpc: '2.0', id, result });
const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

export const pickProtocolVersion = (requested) => (
  SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : SUPPORTED_PROTOCOL_VERSIONS[0]
);

/** OpenAI 风格工具定义 → MCP 工具定义 */
export const toMcpTool = (def) => ({
  name: def.function.name,
  description: def.function.description || '',
  inputSchema: def.function.parameters || { type: 'object', properties: {} },
});

const toText = (value) => (typeof value === 'string' ? value : JSON.stringify(value ?? ''));

const callToolResult = async (params, callTool) => {
  const name = String(params?.name ?? '').trim();
  if (!name) return { error: [RPC.INVALID_PARAMS, '缺少工具名 name'] };
  const args = params?.arguments && typeof params.arguments === 'object' ? params.arguments : {};
  try {
    const reply = await callTool(name, args);
    return { result: { content: [{ type: 'text', text: toText(reply.result) }], isError: reply.ok === false } };
  } catch (error) {
    // 工具执行失败按 MCP 约定放进 result.isError，让模型能看到原因
    return { result: { content: [{ type: 'text', text: `调用失败：${error.message}` }], isError: true } };
  }
};

/**
 * 处理一条 JSON-RPC 消息。
 * @param {object} msg
 * @param {{listTools:()=>Promise<object[]>, callTool:(name:string,args:object)=>Promise<{ok:boolean,result:any}>, instructions?:string}} deps
 * @returns {Promise<object|null>} 通知 / 客户端回帖返回 null（不需要响应）
 */
export const handleMcpMessage = async (msg, { listTools, callTool, instructions = '' }) => {
  if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0') return rpcError(msg?.id, RPC.INVALID_REQUEST, 'invalid request');
  const isNotification = msg.id === undefined || msg.id === null;
  if (isNotification || !msg.method) return null;

  const { id, method, params } = msg;
  switch (method) {
    case 'initialize':
      return rpcResult(id, {
        protocolVersion: pickProtocolVersion(params?.protocolVersion),
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions,
      });
    case 'ping':
      return rpcResult(id, {});
    case 'tools/list': {
      try {
        return rpcResult(id, { tools: (await listTools()).map(toMcpTool) });
      } catch (error) {
        return rpcError(id, RPC.INTERNAL, error.message);
      }
    }
    case 'tools/call': {
      const { result, error } = await callToolResult(params, callTool);
      return error ? rpcError(id, ...error) : rpcResult(id, result);
    }
    default:
      return rpcError(id, RPC.METHOD_NOT_FOUND, `method not found: ${method}`);
  }
};

/** 单条或批量（旧版协议允许数组）都处理；全是通知时返回 null */
export const handleMcpBody = async (body, deps) => {
  if (!Array.isArray(body)) return handleMcpMessage(body, deps);
  const replies = (await Promise.all(body.map((msg) => handleMcpMessage(msg, deps)))).filter(Boolean);
  return replies.length ? replies : null;
};

// ── HTTP 层 ────────────────────────────────────────────────

const readBody = (req) => new Promise((resolve) => {
  let raw = '';
  req.on('data', (chunk) => {
    raw += chunk;
    if (raw.length > MAX_BODY_BYTES) req.destroy();
  });
  req.on('end', () => resolve(raw));
  req.on('error', () => resolve(null));
});

const sendJson = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
};

const sendEmpty = (res, code, headers = {}) => {
  res.writeHead(code, headers);
  res.end();
};

const parseJson = (raw) => {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false };
  }
};

/** 生成 http 请求处理函数（单测直接用它，不必真起端口也行） */
export const createMcpRequestHandler = ({ token, ...deps }) => async (req, res) => {
  const { pathname } = new URL(req.url, `http://${HOST}`);
  if (pathname !== MCP_PATH) return sendJson(res, 404, { error: 'not found' });
  if (!isAllowedOrigin(req.headers.origin)) return sendJson(res, 403, { error: 'forbidden origin' });
  if (!isAuthorized(req.headers.authorization, token)) {
    return sendJson(res, 401, rpcError(null, RPC.INVALID_REQUEST, 'unauthorized：请在 MCP 配置里带上 Authorization: Bearer <token>'));
  }
  // 不提供服务端推送流，按规范 GET / DELETE 回 405
  if (req.method !== 'POST') return sendEmpty(res, 405, { Allow: 'POST' });

  const raw = await readBody(req);
  const parsed = raw === null ? { ok: false } : parseJson(raw);
  if (!parsed.ok) return sendJson(res, 400, rpcError(null, RPC.PARSE_ERROR, 'parse error'));

  const reply = await handleMcpBody(parsed.value, deps);
  return reply ? sendJson(res, 200, reply) : sendEmpty(res, 202);
};

/**
 * 启动本机 HTTP MCP。端口被占用只打日志，不影响 app（URL 要稳定，所以不换随机端口）。
 * @returns {{server: http.Server, url: string, token: string}}
 */
export const startMcpHttpServer = ({ configFile, listTools, callTool, instructions }) => {
  const { port, token } = loadOrCreateMcpConfig(configFile);
  const server = http.createServer(createMcpRequestHandler({ token, listTools, callTool, instructions }));
  const url = `http://${HOST}:${port}${MCP_PATH}`;
  server.on('error', (error) => {
    console.warn(`[mcp-http] ${error.code === 'EADDRINUSE' ? `端口 ${port} 被占用，HTTP MCP 未启动` : error.message}`);
  });
  server.listen(port, HOST, () => console.log('[mcp-http] listening at', url));
  return { server, url, token };
};
