/**
 * MD Render 云端工作区同步服务（零依赖，单文件）
 *
 * 作用：给前端提供最小可用的工作区快照同步 API。
 * - GET /workspaces/:workspaceId/snapshot
 * - PUT /workspaces/:workspaceId/snapshot
 *
 * 同步策略：乐观锁。客户端上传时带 baseRevision，服务端当前 revision
 * 不一致就返回 409 和云端快照，避免静默覆盖。
 */

const http = require('http');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs/promises');

const DEFAULT_PORT = 8791;
const DEFAULT_DATA_DIR = path.join(__dirname, 'data');
const MAX_BODY_BYTES = 20 * 1024 * 1024;

const PORT = Number(process.env.PORT || DEFAULT_PORT);
const DATA_DIR = process.env.CLOUD_SYNC_DATA_DIR || DEFAULT_DATA_DIR;
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || '*';
const CLOUD_SYNC_TOKEN = String(process.env.CLOUD_SYNC_TOKEN || '').trim();
const workspaceLocks = new Map();

const corsHeaders = () => ({
  'Access-Control-Allow-Origin': ALLOW_ORIGIN,
  'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Accept,Authorization,X-Cloud-Sync-Token',
  'Access-Control-Max-Age': '86400',
});

const jsonHeaders = () => ({
  ...corsHeaders(),
  'Content-Type': 'application/json; charset=utf-8',
});

const sendJson = (res, statusCode, body) => {
  res.writeHead(statusCode, jsonHeaders());
  res.end(JSON.stringify(body));
};

const sendError = (res, statusCode, message, extra = {}) => {
  sendJson(res, statusCode, { message, ...extra });
};

const normalizeWorkspaceId = (workspaceId) => String(workspaceId ?? '').trim();

const isAuthorized = (req) => {
  if (!CLOUD_SYNC_TOKEN) return true;
  const bearerToken = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  const headerToken = String(req.headers['x-cloud-sync-token'] || '').trim();
  return bearerToken === CLOUD_SYNC_TOKEN || headerToken === CLOUD_SYNC_TOKEN;
};

const getWorkspaceFile = (workspaceId) => {
  const hash = crypto.createHash('sha256').update(workspaceId).digest('hex');
  return path.join(DATA_DIR, `${hash}.json`);
};

const withWorkspaceLock = async (workspaceId, task) => {
  const previous = workspaceLocks.get(workspaceId) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  const next = previous.then(() => current);
  workspaceLocks.set(workspaceId, next);

  await previous;
  try {
    return await task();
  } finally {
    release();
    if (workspaceLocks.get(workspaceId) === next) {
      workspaceLocks.delete(workspaceId);
    }
  }
};

const readRequestBody = (req) => new Promise((resolve, reject) => {
  const chunks = [];
  let total = 0;

  req.on('data', (chunk) => {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) {
      reject(new Error('请求体过大。'));
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });

  req.on('end', () => {
    const raw = Buffer.concat(chunks).toString('utf8');
    if (!raw) {
      resolve({});
      return;
    }

    try {
      resolve(JSON.parse(raw));
    } catch (_error) {
      reject(new Error('请求体不是合法 JSON。'));
    }
  });

  req.on('error', reject);
});

const readSnapshot = async (workspaceId) => {
  const filePath = getWorkspaceFile(workspaceId);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
};

const writeSnapshot = async (workspaceId, snapshot) => {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const filePath = getWorkspaceFile(workspaceId);
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  await fs.rename(tmpPath, filePath);
};

const parseSnapshotRoute = (reqUrl) => {
  const url = new URL(reqUrl, 'http://localhost');
  const match = url.pathname.match(/^\/workspaces\/([^/]+)\/snapshot$/);
  if (!match) return null;

  const workspaceId = normalizeWorkspaceId(decodeURIComponent(match[1]));
  if (!workspaceId) return null;
  return { workspaceId };
};

const toRevision = (value) => {
  const revision = Number(value);
  return Number.isFinite(revision) && revision >= 0 ? Math.floor(revision) : 0;
};

const createSnapshotResponse = (snapshot) => ({
  workspaceId: snapshot.workspaceId,
  revision: snapshot.revision,
  updatedAt: snapshot.updatedAt,
  clientId: snapshot.clientId || '',
  payload: snapshot.payload,
});

const handleGetSnapshot = async (res, workspaceId) => {
  const snapshot = await readSnapshot(workspaceId);
  if (!snapshot) {
    sendError(res, 404, '云端工作区不存在，请先从本地上传一次。');
    return;
  }

  sendJson(res, 200, createSnapshotResponse(snapshot));
};

const handlePutSnapshot = async (req, res, workspaceId) => {
  const body = await readRequestBody(req);
  const payload = body.payload;

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    sendError(res, 400, '缺少合法的 payload。');
    return;
  }

  const current = await readSnapshot(workspaceId);
  const currentRevision = current?.revision ?? 0;
  const baseRevision = toRevision(body.baseRevision);

  if (baseRevision !== currentRevision) {
    sendError(res, 409, '云端工作区已有更新。', current
      ? { revision: currentRevision, snapshot: createSnapshotResponse(current) }
      : { revision: 0 });
    return;
  }

  const nextSnapshot = {
    workspaceId,
    revision: currentRevision + 1,
    updatedAt: new Date().toISOString(),
    clientId: String(body.clientId ?? ''),
    payload,
  };

  await writeSnapshot(workspaceId, nextSnapshot);
  sendJson(res, 200, {
    revision: nextSnapshot.revision,
    updatedAt: nextSnapshot.updatedAt,
    snapshot: createSnapshotResponse(nextSnapshot),
  });
};

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  try {
    if (!isAuthorized(req)) {
      sendError(res, 401, 'Unauthorized');
      return;
    }

    if (req.url === '/health') {
      sendJson(res, 200, { ok: true });
      return;
    }

    const route = parseSnapshotRoute(req.url);
    if (!route) {
      sendError(res, 404, 'Not Found');
      return;
    }

    if (req.method === 'GET') {
      await handleGetSnapshot(res, route.workspaceId);
      return;
    }

    if (req.method === 'PUT') {
      await withWorkspaceLock(route.workspaceId, () => handlePutSnapshot(req, res, route.workspaceId));
      return;
    }

    sendError(res, 405, 'Method Not Allowed');
  } catch (error) {
    const message = error?.message || '云同步服务异常。';
    sendError(res, message === '请求体过大。' ? 413 : 500, message);
  }
});

server.listen(PORT, () => {
  console.log(`MD Render 云同步服务已启动: http://0.0.0.0:${PORT}`);
  console.log(`数据目录: ${DATA_DIR}`);
});
