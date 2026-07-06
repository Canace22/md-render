const path = require('path');

const DEFAULT_PORT = 8791;
const DEFAULT_DATA_DIR = path.join(__dirname, 'data');
const MAX_BODY_BYTES = 20 * 1024 * 1024;

const config = {
  port: Number(process.env.PORT || DEFAULT_PORT),
  dataDir: process.env.CLOUD_SYNC_DATA_DIR || DEFAULT_DATA_DIR,
  allowOrigin: process.env.ALLOW_ORIGIN || '*',
  token: String(process.env.CLOUD_SYNC_TOKEN || '').trim(),
  maxBodyBytes: MAX_BODY_BYTES,
};

module.exports = { config };
