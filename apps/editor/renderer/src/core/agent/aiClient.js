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
    _serverProvidersCache = Array.isArray(list) ? list : [];
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

/** 保存某个服务商的配置（只保存 model 覆盖） */
export const saveProviderConfig = (providerId, { model } = {}) => {
  if (model !== undefined) writeLocalStorage(providerModelStorageKey(providerId), model);
};

/**
 * 当前选中服务商是否已配置好。
 * 走 server 的 provider 自动可用。
 */
export const isAiConfigured = () => {
  const { providerId } = readProviderConfig();
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

/** Web 兜底路径：直接 fetch ai-proxy server */
const callViaServer = async ({ messages, tools, config, signal }) => {
  const serverBase = resolveAiServerBase();
  if (!serverBase) throw new Error('未配置 AI 服务器地址');

  const payload = {
    providerId: config.providerId,
    messages,
    tools,
    model: config.model,
  };

  const res = await fetch(`${serverBase}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`AI 请求失败 (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const message = data?.choices?.[0]?.message;
  if (!message) throw new Error('AI 返回内容为空');
  return message;
};

/**
 * 调用一次 chat/completions。
 */
export const callChatCompletion = async ({ messages, tools, config, signal }) => {
  const resolved = config ?? readProviderConfig();
  return hasAiBridge()
    ? callViaBridge({ messages, tools, config: resolved })
    : callViaServer({ messages, tools, config: resolved, signal });
};
