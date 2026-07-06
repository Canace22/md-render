const {
  corsHeaders,
  isAuthorized,
  readRequestBody,
  sendError,
  sendJson,
} = require('./httpUtils');
const { readSnapshot, writeSnapshot } = require('./storage');

const normalizeWorkspaceId = (workspaceId) => String(workspaceId ?? '').trim();

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

const handleGetSnapshot = async (res, workspaceId, config) => {
  const snapshot = await readSnapshot(workspaceId, config);
  if (!snapshot) {
    sendError(res, 404, '云端工作区不存在，请先从本地上传一次。', {}, config);
    return;
  }

  sendJson(res, 200, createSnapshotResponse(snapshot), config);
};

const handlePutSnapshot = async (req, res, workspaceId, config) => {
  const body = await readRequestBody(req, config);
  const payload = body.payload;

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    sendError(res, 400, '缺少合法的 payload。', {}, config);
    return;
  }

  const current = await readSnapshot(workspaceId, config);
  const currentRevision = current?.revision ?? 0;
  const baseRevision = toRevision(body.baseRevision);

  if (baseRevision !== currentRevision) {
    sendError(res, 409, '云端工作区已有更新。', current
      ? { revision: currentRevision, snapshot: createSnapshotResponse(current) }
      : { revision: 0 }, config);
    return;
  }

  const nextSnapshot = {
    workspaceId,
    revision: currentRevision + 1,
    updatedAt: new Date().toISOString(),
    clientId: String(body.clientId ?? ''),
    payload,
  };

  await writeSnapshot(workspaceId, nextSnapshot, config);
  sendJson(res, 200, {
    revision: nextSnapshot.revision,
    updatedAt: nextSnapshot.updatedAt,
    snapshot: createSnapshotResponse(nextSnapshot),
  }, config);
};

const createCloudSyncRouter = ({ config, withWorkspaceLock }) => async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(config));
    res.end();
    return;
  }

  if (!isAuthorized(req, config)) {
    sendError(res, 401, 'Unauthorized', {}, config);
    return;
  }

  const route = parseSnapshotRoute(req.url);
  if (!route) {
    sendError(res, 404, 'Not found', {}, config);
    return;
  }

  if (req.method === 'GET') {
    await handleGetSnapshot(res, route.workspaceId, config);
    return;
  }

  if (req.method === 'PUT') {
    await withWorkspaceLock(route.workspaceId, () => (
      handlePutSnapshot(req, res, route.workspaceId, config)
    ));
    return;
  }

  sendError(res, 405, 'Method not allowed', {}, config);
};

module.exports = {
  createCloudSyncRouter,
  createSnapshotResponse,
  parseSnapshotRoute,
  toRevision,
};
