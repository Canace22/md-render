import {
  requestChatCompletion,
  requestKnowledgeSearch,
  requestProviders,
  requestToolExec,
  requestToolSchema,
} from '../aiRequest.js';

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

  // provider 列表由 ai-proxy server 提供，主进程只做转发和字段映射。
  ipcMain.handle('ai:getConfig', async (_event, payload = {}) => {
    try {
      const aiProxyBase = resolveAiProxyBase(payload.aiProxyBase);
      const providers = await requestProviders({ aiProxyBase });
      return providers.map(({ id, label, baseURL, defaultModel, hasKey }) => ({
        id,
        label,
        baseURL,
        defaultModel,
        hasBuiltinKey: Boolean(hasKey),
      }));
    } catch {
      // server 没起来时返回空列表，前端会回落到「需手填 key」的自定义流程
      return [];
    }
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

  ipcMain.handle('ai:searchKnowledge', async (_event, payload = {}) => {
    try {
      const aiProxyBase = resolveAiProxyBase(payload.aiProxyBase);
      return await requestKnowledgeSearch({ ...payload, aiProxyBase });
    } catch (err) {
      return { ok: false, results: [], error: err.message };
    }
  });
}
