import { getMdRenderRootPath } from '../localProject.js';
import {
  appendActivityEntry,
  getAgentDataDir,
  readActivityEntries,
  readProposalFiles,
  writeProposalFile,
} from '../capabilities/agentDataFiles.js';

const wrap = (fn) => async (_event, payload = {}) => {
  try {
    return { ok: true, ...(await fn(payload)) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
};

/** 内容库 .agent/ 下的提案和活动日志 */
export function registerAgentDataHandlers({ ipcMain, getAgentDir = () => getAgentDataDir(getMdRenderRootPath()) }) {
  ipcMain.handle('agent-data:write-proposal', wrap(async ({ proposal }) => ({
    filePath: await writeProposalFile(getAgentDir(), proposal),
  })));
  ipcMain.handle('agent-data:list-proposals', wrap(async () => ({
    proposals: await readProposalFiles(getAgentDir()),
  })));
  ipcMain.handle('agent-data:append-activity', wrap(async ({ entry }) => ({
    filePath: await appendActivityEntry(getAgentDir(), entry),
  })));
  ipcMain.handle('agent-data:read-activity', wrap(async ({ dateKey, limit }) => ({
    entries: await readActivityEntries(getAgentDir(), { dateKey, limit }),
  })));
}
