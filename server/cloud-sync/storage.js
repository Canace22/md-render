const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const getWorkspaceFile = (workspaceId, config) => {
  const hash = crypto.createHash('sha256').update(workspaceId).digest('hex');
  return path.join(config.dataDir, `${hash}.json`);
};

const readSnapshot = async (workspaceId, config) => {
  const filePath = getWorkspaceFile(workspaceId, config);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
};

const writeSnapshot = async (workspaceId, snapshot, config) => {
  await fs.mkdir(config.dataDir, { recursive: true });
  const filePath = getWorkspaceFile(workspaceId, config);
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  await fs.rename(tmpPath, filePath);
};

module.exports = {
  readSnapshot,
  writeSnapshot,
};
