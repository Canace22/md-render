import { getDesktopRuntimeKind } from './desktopBridge.js';

const LOCAL_AGENT_EVENT = 'tauri-local-agent://event';

const invokeTauri = async (command, payload = {}) => {
  if (!isTauriLocalAgentBridgeAvailable()) {
    throw new Error('Tauri 本机 agent 通道不可用');
  }
  const { invoke } = await import('@tauri-apps/api/core');
  try {
    return await invoke(command, { payload });
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error(String(error || 'Tauri 本机 agent 请求失败'));
  }
};

const asResult = async (request) => {
  try {
    return { ok: true, ...(await request) };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
};

export const isTauriLocalAgentBridgeAvailable = () => getDesktopRuntimeKind() === 'tauri';

export const tauriLocalAgentDetect = (payload) => (
  asResult(invokeTauri('tauri_local_agent_detect', payload))
);

export const tauriLocalAgentModels = (payload) => (
  asResult(invokeTauri('tauri_local_agent_models', payload))
);

export const tauriLocalAgentRun = (payload) => (
  asResult(invokeTauri('tauri_local_agent_run', payload))
);

export const tauriLocalAgentCancel = (payload) => (
  asResult(invokeTauri('tauri_local_agent_cancel', payload))
);

export const onTauriLocalAgentEvent = async (callback) => {
  if (!isTauriLocalAgentBridgeAvailable()) return () => {};
  const { listen } = await import('@tauri-apps/api/event');
  return listen(LOCAL_AGENT_EVENT, (event) => callback(event.payload));
};
