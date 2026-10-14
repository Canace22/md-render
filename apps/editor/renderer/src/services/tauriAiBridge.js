import { getDesktopRuntimeKind } from './desktopBridge.js';

const CHAT_STREAM_EVENT = 'tauri-ai://chat-stream-event';
const PROXY_REQUIRED_MESSAGE = 'Tauri 版未配置 AI 代理地址，不会自动启动本地 Node 服务。请先在 AI 设置中填写可用的代理地址（生产环境应使用 HTTPS）。';

const normalizeBase = (value) => String(value ?? '').trim().replace(/\/+$/, '');

const requireAiProxy = (payload = {}) => {
  const aiProxyBase = normalizeBase(payload.aiProxyBase);
  if (!aiProxyBase) throw new Error(PROXY_REQUIRED_MESSAGE);
  return { ...payload, aiProxyBase };
};

const invokeTauriAi = async (command, payload = {}, { requireProxy = true } = {}) => {
  if (!isTauriAiBridgeAvailable()) {
    throw new Error('Tauri AI 通道不可用');
  }
  const { invoke } = await import('@tauri-apps/api/core');
  try {
    return await invoke(command, {
      payload: requireProxy ? requireAiProxy(payload) : payload,
    });
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error(String(error || 'Tauri AI 请求失败'));
  }
};

export const isTauriAiBridgeAvailable = () => getDesktopRuntimeKind() === 'tauri';

export const tauriAiChat = (payload) => invokeTauriAi('tauri_ai_chat', payload);

export const tauriAiChatStream = (payload) => (
  invokeTauriAi('tauri_ai_chat_stream', payload)
);

export const tauriAiAbortChatStream = (requestId) => (
  invokeTauriAi('tauri_ai_abort_chat_stream', { requestId }, { requireProxy: false })
);

export const tauriAiGetConfig = (payload) => (
  invokeTauriAi('tauri_ai_get_config', payload)
);

export const tauriAiExecTool = (payload) => (
  invokeTauriAi('tauri_ai_exec_tool', payload)
);

export const tauriAiListTools = (payload) => (
  invokeTauriAi('tauri_ai_list_tools', payload)
);

export const tauriAiSearchKnowledge = (payload) => (
  invokeTauriAi('tauri_ai_search_knowledge', payload)
);

export const tauriAiReadUrl = (payload) => (
  invokeTauriAi('tauri_ai_read_url', payload)
);

export const tauriAiExtractAttachmentText = (payload) => (
  invokeTauriAi('tauri_ai_extract_attachment_text', payload)
);

export const onTauriAiChatStreamEvent = async (callback) => {
  if (!isTauriAiBridgeAvailable()) return () => {};
  const { listen } = await import('@tauri-apps/api/event');
  return listen(CHAT_STREAM_EVENT, (event) => callback(event.payload));
};
