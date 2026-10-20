/**
 * AI 客户端：通过 IPC 调用主进程，主进程再调 ai-proxy server。
 *
 * API Key 存在 ai-proxy server 的 .env 里。
 * Renderer 只传 providerId，永远不接触 key。
 *
 * 两条请求路径：
 * - Electron（默认）：IPC → 主进程 → ai-proxy server → LLM API
 * - Web 兜底：直接 fetch ai-proxy server 的 /api/chat
 */

import { AI_PROVIDERS, DEFAULT_PROVIDER_ID, getProvider } from './aiProviders.js';
import { readChatStream } from '@shared/sseChat.js';
import { getLocalAgent, isRunnableAgent } from '@shared/localAgents.js';
import {
  SOURCE_KINDS,
  buildAiSourceList,
  getDetectedLocalAgents,
  isLocalAgentSafeMode,
  parseSourceId,
  pickDefaultSource,
  readSavedSourceId,
  readSourceEffort,
  readSourceModel,
  saveActiveSourceId,
} from './aiSources.js';

const ACTIVE_PROVIDER_KEY = 'md-renderer-ai-provider';
const AI_SERVER_STORAGE_KEY = 'md-renderer-ai-server';
const LEGACY_PROVIDER_IDS = new Set(['xiaomi-mimo']);
const providerModelStorageKey = (id) => `md-renderer-ai-model:${id}`;
const BUILT_AI_PROXY_BASE = typeof __MD_RENDER_AI_PROXY_BASE__ !== 'undefined'
  ? __MD_RENDER_AI_PROXY_BASE__
  : '';

const normalizeBase = (value) => String(value ?? '').trim().replace(/\/+$/, '');

const readLocalStorage = (key) => {
  try {
    return typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
  } catch {
    return null;
  }
};

const writeLocalStorage = (key, value) => {
  try {
    if (typeof window === 'undefined') return;
    const next = String(value ?? '').trim();
    if (next) window.localStorage.setItem(key, next);
    else window.localStorage.removeItem(key);
  } catch { /* ignore */ }
};

/** 是否在 Electron 且主进程 AI 通道可用 */
export const hasAiBridge = () =>
  typeof window !== 'undefined' && typeof window.electronAPI?.ai?.chat === 'function';

/** ai-proxy server 地址（Electron IPC 透传 + Web 兜底用） */
export const resolveAiServerBase = () => {
  const runtime = normalizeBase(readLocalStorage(AI_SERVER_STORAGE_KEY));
  if (runtime) return runtime;
  const built = normalizeBase(BUILT_AI_PROXY_BASE);
  if (built) return built;
  return normalizeBase(import.meta.env?.VITE_AI_PROXY);
};

export const readAiServerBase = () => resolveAiServerBase();

/**
 * 返回可用于诊断的 AI 地址来源，不包含任何 API Key。
 * override 来自本机设置；builtDefault 来自打包时配置。
 */
export const getAiServerConfiguration = () => {
  const override = normalizeBase(readLocalStorage(AI_SERVER_STORAGE_KEY));
  const builtDefault = normalizeBase(BUILT_AI_PROXY_BASE)
    || normalizeBase(import.meta.env?.VITE_AI_PROXY);
  return {
    override,
    builtDefault,
    resolved: override || builtDefault,
    source: override ? 'override' : (builtDefault ? 'build' : 'main-default'),
  };
};

export const saveAiServerBase = (value) => {
  writeLocalStorage(AI_SERVER_STORAGE_KEY, normalizeBase(value));
};

export const clearAiServerOverride = () => {
  writeLocalStorage(AI_SERVER_STORAGE_KEY, '');
};

export const getActiveProviderId = () => {
  const savedProviderId = readLocalStorage(ACTIVE_PROVIDER_KEY);
  if (!savedProviderId || LEGACY_PROVIDER_IDS.has(savedProviderId)) return DEFAULT_PROVIDER_ID;
  return savedProviderId;
};

/**
 * 从主进程获取服务端可用的 provider 列表。
 */
let _serverProvidersCache = null;
export const fetchServerProviders = async () => {
  if (_serverProvidersCache) return _serverProvidersCache;
  if (!hasAiBridge()) return [];
  try {
    const list = await window.electronAPI.ai.getConfig();
    // 空列表通常意味着 ai-proxy 还没起来，不缓存，下次重试
    if (!Array.isArray(list) || list.length === 0) return [];
    _serverProvidersCache = list;
    return _serverProvidersCache;
  } catch {
    return [];
  }
};

/** 某个 provider 是否可用（走 server 的都可用） */
export const hasBuiltinKey = (providerId) => {
  if (!_serverProvidersCache) return false;
  return _serverProvidersCache.some((p) => p.id === providerId && p.hasBuiltinKey);
};

/** 读取某个服务商的配置 */
export const readProviderConfig = (providerId = getActiveProviderId()) => {
  const preset = getProvider(providerId);
  const savedModel = String(readLocalStorage(providerModelStorageKey(preset.id)) ?? '').trim();
  return {
    providerId: preset.id,
    label: preset.label,
    model: savedModel || preset.defaultModel,
    baseURL: preset.baseURL,
  };
};

/** 切换当前服务商 */
export const setActiveProvider = (providerId) => {
  writeLocalStorage(ACTIVE_PROVIDER_KEY, providerId);
};

/** 保存某个服务商的模型覆盖。 */
export const saveProviderConfig = (providerId, { model } = {}) => {
  if (model !== undefined) writeLocalStorage(providerModelStorageKey(providerId), model);
};

// ── AI 来源（本机 agent + API 服务商，L2）──────────────────

const builtinProviderIds = () => (_serverProvidersCache ?? [])
  .filter((provider) => provider.hasBuiltinKey)
  .map((provider) => provider.id);

/** 面板 / 设置页的来源列表（本机 agent 用最近一次检测结果） */
export const listAiSources = () => buildAiSourceList({
  detected: getDetectedLocalAgents(),
  builtinProviders: builtinProviderIds(),
});

/** 当前来源 id：默认选中规则见 pickDefaultSource；都没有时退回当前服务商 */
export const getActiveSourceId = () => (
  pickDefaultSource(getDetectedLocalAgents(), readSavedSourceId(), builtinProviderIds()) || getActiveProviderId()
);

/** 切换来源；API 服务商同时更新旧的 provider 选择，保持兼容 */
export const setActiveSource = (sourceId) => {
  saveActiveSourceId(sourceId);
  const parsed = parseSourceId(sourceId);
  if (parsed.kind === SOURCE_KINDS.API) setActiveProvider(parsed.id);
};

const findDetected = (agentId) => getDetectedLocalAgents().find((item) => item.id === agentId) || null;

/**
 * 当前来源的运行配置。
 * - 本机 agent：{ kind: 'local', sourceId, agentId, label, model, effort, safeMode }
 * - API 服务商：{ kind: 'api', sourceId, ...readProviderConfig() }
 */
export const getActiveSource = (sourceId = getActiveSourceId()) => {
  const parsed = parseSourceId(sourceId);
  if (parsed.kind === SOURCE_KINDS.LOCAL) {
    return {
      kind: SOURCE_KINDS.LOCAL,
      sourceId,
      agentId: parsed.id,
      label: getLocalAgent(parsed.id)?.label ?? parsed.id,
      model: readSourceModel(sourceId),
      effort: readSourceEffort(sourceId),
      safeMode: isLocalAgentSafeMode(),
      available: isRunnableAgent(findDetected(parsed.id)),
    };
  }
  return { kind: SOURCE_KINDS.API, sourceId, available: true, ...readProviderConfig(parsed.id) };
};

/**
 * 当前来源是否能直接用：本机 agent 要已检测到且可运行；
 * 走 server 的 provider 自动可用。
 */
export const isAiConfigured = () => {
  const source = getActiveSource();
  if (source.kind === SOURCE_KINDS.LOCAL) return source.available;
  const { providerId } = source;
  if (hasBuiltinKey(providerId)) return true;
  // 自定义 provider 或 Web 模式需要 server 地址
  return hasAiBridge() ? true : Boolean(resolveAiServerBase());
};

/** 供面板列出服务商选项 */
export const listProviders = () => AI_PROVIDERS;

/** Electron 路径：走 IPC → 主进程 → ai-proxy server */
const callViaBridge = async ({ messages, tools, config }) => {
  const aiProxyBase = resolveAiServerBase();
  const payload = {
    providerId: config.providerId,
    messages,
    tools,
  };
  if (config.model) payload.model = config.model;
  if (aiProxyBase) payload.aiProxyBase = aiProxyBase;

  const res = await window.electronAPI.ai.chat(payload);
  if (!res?.ok) throw new Error(res?.error || 'AI 请求失败');
  return res.message;
};

/** Electron 是否支持流式通道（旧 preload 没有时退回一次性请求） */
export const hasAiStreamBridge = () =>
  typeof window !== 'undefined' && typeof window.electronAPI?.ai?.chatStream === 'function';

let streamSeq = 0;
const nextStreamRequestId = () => `chat-${Date.now()}-${(streamSeq += 1)}`;

/** Electron 流式路径：invoke 等整轮结束，片段通过事件推过来；abort 时通知主进程掐断请求 */
const callViaBridgeStream = async ({ messages, tools, config, signal, onDelta }) => {
  const api = window.electronAPI.ai;
  const requestId = nextStreamRequestId();
  const aiProxyBase = resolveAiServerBase();
  const payload = { requestId, providerId: config.providerId, messages, tools };
  if (config.model) payload.model = config.model;
  if (aiProxyBase) payload.aiProxyBase = aiProxyBase;

  const unsubscribe = api.onChatStreamEvent?.((event) => {
    if (event?.requestId === requestId && event.text) onDelta(event.text);
  });
  const onAbort = () => { api.abortChatStream?.(requestId); };
  signal?.addEventListener?.('abort', onAbort);
  try {
    const res = await api.chatStream(payload);
    if (signal?.aborted || res?.cancelled) throw new Error('已取消');
    if (!res?.ok) throw new Error(res?.error || 'AI 请求失败');
    return res.message;
  } finally {
    unsubscribe?.();
    signal?.removeEventListener?.('abort', onAbort);
  }
};

const buildServerPayload = ({ messages, tools, config }) => ({
  providerId: config.providerId,
  messages,
  tools,
  model: config.model,
});

const postToServer = async ({ body, signal }) => {
  const serverBase = resolveAiServerBase();
  if (!serverBase) throw new Error('未配置 AI 服务器地址');
  const res = await fetch(`${serverBase}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`AI 请求失败 (${res.status}): ${text.slice(0, 300)}`);
  }
  return res;
};

/** Web 兜底路径：直接 fetch ai-proxy server */
const callViaServer = async ({ messages, tools, config, signal }) => {
  const res = await postToServer({ body: buildServerPayload({ messages, tools, config }), signal });
  const data = await res.json();
  const message = data?.choices?.[0]?.message;
  if (!message) throw new Error('AI 返回内容为空');
  return message;
};

/** Web 流式路径：fetch + ReadableStream 读 SSE */
const callViaServerStream = async ({ messages, tools, config, signal, onDelta }) => {
  const body = { ...buildServerPayload({ messages, tools, config }), stream: true };
  const res = await postToServer({ body, signal });
  return readChatStream(res, { onDelta });
};

/**
 * 调用一次 chat/completions。
 * 传了 onDelta 就走流式：每收到一段正文调用 onDelta(text)，返回值仍是完整 message（含 tool_calls）。
 */
export const callChatCompletion = async ({ messages, tools, config, signal, onDelta }) => {
  const resolved = config ?? readProviderConfig();
  const params = { messages, tools, config: resolved, signal, onDelta };
  if (hasAiBridge()) {
    return onDelta && hasAiStreamBridge() ? callViaBridgeStream(params) : callViaBridge(params);
  }
  return onDelta ? callViaServerStream(params) : callViaServer(params);
};
