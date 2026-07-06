const corsHeaders = (config) => ({
  'Access-Control-Allow-Origin': config.allowOrigin,
  'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Accept,Authorization,X-Cloud-Sync-Token',
  'Access-Control-Max-Age': '86400',
});

const jsonHeaders = (config) => ({
  ...corsHeaders(config),
  'Content-Type': 'application/json; charset=utf-8',
});

const sendJson = (res, statusCode, body, config) => {
  res.writeHead(statusCode, jsonHeaders(config));
  res.end(JSON.stringify(body));
};

const sendError = (res, statusCode, message, extra = {}, config) => {
  sendJson(res, statusCode, { message, ...extra }, config);
};

const isAuthorized = (req, config) => {
  if (!config.token) return true;
  const bearerToken = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  const headerToken = String(req.headers['x-cloud-sync-token'] || '').trim();
  return bearerToken === config.token || headerToken === config.token;
};

const readRequestBody = (req, config) => new Promise((resolve, reject) => {
  const chunks = [];
  let total = 0;

  req.on('data', (chunk) => {
    total += chunk.length;
    if (total > config.maxBodyBytes) {
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

module.exports = {
  corsHeaders,
  isAuthorized,
  readRequestBody,
  sendError,
  sendJson,
};
