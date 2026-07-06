import { listAvailableProviders } from '../aiConfig.js';
import { requestChatCompletion, requestToolExec, requestToolSchema } from '../aiRequest.js';

export function registerAiHandlers({ ipcMain, resolveAiProxyBase }) {
  ipcMain.handle('ai:chat', async (_event, payload = {}) => {
    try {
      const aiProxyBase = resolveAiProxyBase(payload.aiProxyBase);
      const message = await requestChatCompletion({ ...payload, aiProxyBase });
      return { ok: true, message };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('ai:getConfig', () => {
    return listAvailableProviders();
  });

  ipcMain.handle('ai:execTool', async (_event, payload = {}) => {
    try {
      const aiProxyBase = resolveAiProxyBase(payload.aiProxyBase);
      return await requestToolExec({ ...payload, aiProxyBase });
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('ai:listTools', async (_event, payload = {}) => {
    try {
      const aiProxyBase = resolveAiProxyBase(payload.aiProxyBase);
      return await requestToolSchema({ aiProxyBase });
    } catch (err) {
      return { tools: [], error: err.message };
    }
  });
}
