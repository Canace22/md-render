/**
 * MD Render 云端工作区同步服务
 *
 * - GET /workspaces/:workspaceId/snapshot
 * - PUT /workspaces/:workspaceId/snapshot
 *
 * 同步策略：全量快照 + revision 乐观锁。
 */

const http = require('http');
const { config } = require('./config');
const { createCloudSyncRouter } = require('./routes');
const { sendError } = require('./httpUtils');

const workspaceLocks = new Map();

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

const routeRequest = createCloudSyncRouter({ config, withWorkspaceLock });

const server = http.createServer(async (req, res) => {
  try {
    await routeRequest(req, res);
  } catch (error) {
    console.error('[cloud-sync] request failed:', error);
    if (!res.headersSent) {
      sendError(res, 500, error.message || 'Internal server error', {}, config);
    } else {
      res.end();
    }
  }
});

server.listen(config.port, () => {
  console.log(`[cloud-sync] listening on http://0.0.0.0:${config.port}`);
  console.log(`[cloud-sync] data dir: ${config.dataDir}`);
  if (config.token) {
    console.log('[cloud-sync] token auth enabled');
  }
});
