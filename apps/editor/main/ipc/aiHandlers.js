import {
  requestChatCompletion,
  requestChatCompletionStream,
  requestAttachmentText,
  requestKnowledgeSearch,
  requestProviders,
  requestToolExec,
  requestToolSchema,
  requestUrlRead,
} from '../aiRequest.js';

export const AI_CHAT_STREAM_EVENT_CHANNEL = 'ai:chatStream:event';

/** 在途流式请求：requestId → AbortController */
const activeStreams = new Map();

export function registerAiHandlers({ ipcMain, resolveAiProxyBase }) {
  // 流式聊天：正文片段走 ai:chatStream:event 推给发起的窗口，invoke 在整轮结束后返回完整 message
  ipcMain.handle('ai:chatStream', async (event, payload = {}) => {
    const { requestId } = payload;
    if (!requestId) return { ok: false, error: '缺少 requestId' };
    const controller = new AbortController();
    activeStreams.set(requestId, controller);
    const sender = event.sender;
    const onDelta = (text) => {
      if (!sender.isDestroyed()) sender.send(AI_CHAT_STREAM_EVENT_CHANNEL, { requestId, text });
    };
    try {
      const aiProxyBase = resolveAiProxyBase(payload.aiProxyBase);
      const message = await requestChatCompletionStream({
        ...payload,
        aiProxyBase,
        signal: controller.signal,
        onDelta,
      });
      return { ok: true, message };
    } catch (err) {
      return { ok: false, error: err.message, cancelled: controller.signal.aborted };
    } finally {
      activeStreams.delete(requestId);
    }
  });

  ipcMain.handle('ai:chatStream:abort', async (_event, { requestId } = {}) => {
    activeStreams.get(requestId)?.abort();
    return { ok: true };
  });

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

  ipcMain.handle('ai:readUrl', async (_event, payload = {}) => {
    try {
      const aiProxyBase = resolveAiProxyBase(payload.aiProxyBase);
      return await requestUrlRead({ ...payload, aiProxyBase });
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('ai:extractAttachmentText', async (_event, payload = {}) => {
    try {
      const aiProxyBase = resolveAiProxyBase(payload.aiProxyBase);
      return await requestAttachmentText({ ...payload, aiProxyBase });
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
}
