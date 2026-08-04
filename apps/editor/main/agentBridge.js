/**
 * Agent 控制桥（主进程）。
 *
 * 作用：给「别的 AI」开一个本地入口，让它能调用本 app 的工具。
 * 链路：MCP server → 本桥(HTTP 127.0.0.1 + token) → 反向 IPC → renderer 执行 → 原路返回。
 *
 * 安全设计：
 *   - 只监听 127.0.0.1，不对外网暴露；
 *   - 每次启动生成随机 token，写进 userData/agent-bridge.json（0600），MCP server 读它握手；
 *   - 只放行 shared/agentBridgeTools.js 的白名单工具（此处是安全网关，renderer 侧再做一次纵深防御）。
 *
 * 工具的真实执行逻辑不在这里，而是复用 renderer 里现成的 host + executeTool，桥本身不碰业务。
 */
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  filterSafeToolDefs,
  validateInvoke,
  LIST_TOOLS_NAME,
  INVOKE_TIMEOUT_MS,
} from '../shared/agentBridgeTools.js';

const HOST = '127.0.0.1';
const INVOKE_CHANNEL = 'agent-bridge:invoke';
const REPLY_CHANNEL = 'agent-bridge:reply';
const MAX_BODY_BYTES = 1_000_000;

/** 主进程 → renderer 的在途请求：id -> { resolve, reject, timer } */
const pending = new Map();
let idSeq = 0;
const nextId = () => `bridge-${Date.now()}-${++idSeq}`;

const readJsonBody = (req) =>
  new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > MAX_BODY_BYTES) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}'));
      } catch {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
  });

/** 发一次工具请求给 renderer，等它回帖（带超时） */
const callRenderer = (getMainWindow, name, args) =>
  new Promise((resolve, reject) => {
    const win = getMainWindow?.();
    if (!win || win.isDestroyed?.() || !win.webContents) {
      reject(new Error('主窗口未就绪，无法执行工具'));
      return;
    }
    const id = nextId();
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('工具执行超时'));
    }, INVOKE_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer });
    win.webContents.send(INVOKE_CHANNEL, { id, name, args });
  });

const sendJson = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
};

/**
 * 启动控制桥。
 * @param {object} deps
 * @param {() => import('electron').BrowserWindow|null} deps.getMainWindow
 * @param {import('electron').IpcMain} deps.ipcMain
 * @param {import('electron').App} deps.app
 * @param {number} [deps.port] 默认 0（由系统分配空闲端口）
 * @returns {{close:Function,getToken:Function,address:Function}}
 */
export function startAgentBridge({ getMainWindow, ipcMain, app, port = 0 } = {}) {
  // renderer 执行完的回帖
  ipcMain.on(REPLY_CHANNEL, (_event, payload) => {
    const { id, ok, result } = payload || {};
    const entry = pending.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.delete(id);
    entry.resolve({ ok: ok !== false, result });
  });

  const token = crypto.randomBytes(24).toString('hex');
  const isAuthed = (req) => req.headers.authorization === `Bearer ${token}`;

  const server = http.createServer(async (req, res) => {
    let url;
    try {
      url = new URL(req.url, `http://${HOST}`);
    } catch {
      return sendJson(res, 400, { ok: false, error: 'bad request' });
    }

    // 健康检查不需要鉴权，便于 MCP server 探活
    if (req.method === 'GET' && url.pathname === '/health') {
      return sendJson(res, 200, { ok: true });
    }
    if (!isAuthed(req)) return sendJson(res, 401, { ok: false, error: 'unauthorized' });

    if (req.method === 'GET' && url.pathname === '/tools') {
      try {
        const reply = await callRenderer(getMainWindow, LIST_TOOLS_NAME, {});
        const defs = Array.isArray(reply?.result) ? reply.result : [];
        return sendJson(res, 200, { ok: true, tools: filterSafeToolDefs(defs) });
      } catch (error) {
        return sendJson(res, 502, { ok: false, error: error.message });
      }
    }

    if (req.method === 'POST' && url.pathname === '/invoke') {
      const body = await readJsonBody(req);
      const checked = validateInvoke(body);
      if (!checked.ok) return sendJson(res, 400, { ok: false, error: checked.error });
      try {
        const reply = await callRenderer(getMainWindow, checked.name, checked.args);
        return sendJson(res, 200, { ok: reply.ok, result: reply.result });
      } catch (error) {
        return sendJson(res, 502, { ok: false, error: error.message });
      }
    }

    return sendJson(res, 404, { ok: false, error: 'not found' });
  });

  server.on('error', (error) => {
    console.error('[agent-bridge] server error:', error.message);
  });

  server.listen(port, HOST, () => {
    const actualPort = server.address().port;
    const info = { url: `http://${HOST}:${actualPort}`, token, pid: process.pid };
    try {
      const file = path.join(app.getPath('userData'), 'agent-bridge.json');
      fs.writeFileSync(file, JSON.stringify(info, null, 2), { mode: 0o600 });
      console.log('[agent-bridge] listening at', info.url, '→ handshake:', file);
    } catch (error) {
      console.warn('[agent-bridge] failed to write handshake file:', error.message);
    }
  });

  return {
    close: () => {
      try {
        server.close();
      } catch {
        /* noop */
      }
    },
    getToken: () => token,
    address: () => server.address(),
  };
}
