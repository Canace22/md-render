/**
 * AI 客户端：调用 OpenAI 兼容的 chat/completions 接口（带 tools）。
 *
 * 配置模型（参考 Cursor 设置页）：
 * - 预设多个服务商（见 aiProviders.js），每个服务商独立存自己的 API key 和模型覆盖。
 * - 记住「当前选中的服务商」，切换服务商不用重填 key。
 * - key 只存 localStorage（不入库、不写进代码、不打印）。
 *
 * 两条请求路径：
 * - Electron（默认）：走主进程 IPC（window.electronAPI.ai.chat），Node 直连无 CORS，无需代理。
 * - Web 兜底：没有 IPC 时回退到代理 fetch（需配 VITE_AI_PROXY / 运行时代理地址）。
 */

import { AI_PROVIDERS, DEFAULT_PROVIDER_ID, getProvider } from './aiProviders.js';

const ACTIVE_PROVIDER_KEY = 'md-renderer-ai-provider';
const AI_PROXY_STORAGE_KEY = 'md-renderer-ai-proxy';
// 每个服务商的 key / 模型 / 自定义 baseURL 按 id 存：md-renderer-ai-key:<id>
const providerKeyStorageKey = (id) => `md-renderer-ai-key:${id}`;
const providerModelStorageKey = (id) => `md-renderer-ai-model:${id}`;
const providerBaseStorageKey = (id) => `md-renderer-ai-base:${id}`;

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
  } catch {
    /* localStorage 不可用时忽略 */
  }
};

/** 是否在 Electron 且主进程 AI 通道可用（主路径） */
export const hasAiBridge = () =>
  typeof window !== 'undefined' && typeof window.electronAPI?.ai?.chat === 'function';

/** Web 兜底用的代理基址：运行时配置优先，构建期 VITE_AI_PROXY 兜底 */
export const resolveAiProxyBase = () => {
  const runtime = normalizeBase(readLocalStorage(AI_PROXY_STORAGE_KEY));
  if (runtime) return runtime;
  return normalizeBase(import.meta.env?.VITE_AI_PROXY);
};

export const getActiveProviderId = () =>
  readLocalStorage(ACTIVE_PROVIDER_KEY) || DEFAULT_PROVIDER_ID;

/** 读取某个服务商的已存配置（key / 模型 / baseURL），未填则用预设默认值 */
export const readProviderConfig = (providerId = getActiveProviderId()) => {
  const preset = getProvider(providerId);
  const savedModel = String(readLocalStorage(providerModelStorageKey(preset.id)) ?? '').trim();
  const savedBase = normalizeBase(readLocalStorage(providerBaseStorageKey(preset.id)));
  return {
    providerId: preset.id,
    label: preset.label,
    apiKey: String(readLocalStorage(providerKeyStorageKey(preset.id)) ?? '').trim(),
    model: savedModel || preset.defaultModel,
    baseURL: savedBase || preset.baseURL, // 自定义服务商靠这个填
  };
};

/** 切换当前服务商 */
export const setActiveProvider = (providerId) => {
  writeLocalStorage(ACTIVE_PROVIDER_KEY, providerId);
};

/** 保存某个服务商的配置（只写传入的字段） */
export const saveProviderConfig = (providerId, { apiKey, model, baseURL } = {}) => {
  if (apiKey !== undefined) writeLocalStorage(providerKeyStorageKey(providerId), apiKey);
  if (model !== undefined) writeLocalStorage(providerModelStorageKey(providerId), model);
  if (baseURL !== undefined) writeLocalStorage(providerBaseStorageKey(providerId), normalizeBase(baseURL));
};

/** 当前选中服务商是否已配置好（有 key + 有 baseURL） */
export const isAiConfigured = () => {
  const { apiKey, baseURL } = readProviderConfig();
  if (!apiKey || !baseURL) return false;
  // Web 端还需要代理地址才能绕过 CORS
  return hasAiBridge() ? true : Boolean(resolveAiProxyBase());
};

/** 供面板列出服务商选项 */
export const listProviders = () => AI_PROVIDERS;

/** Electron 路径：走主进程 IPC */
const callViaBridge = async ({ messages, tools, config }) => {
  const res = await window.electronAPI.ai.chat({
    messages,
    tools,
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    model: config.model,
  });
  if (!res?.ok) throw new Error(res?.error || 'AI 请求失败');
  return res.message;
};

/** Web 兜底路径：走代理 fetch（代理按 baseURL 决定上游） */
const callViaProxy = async ({ messages, tools, config, signal }) => {
  const proxyBase = resolveAiProxyBase();
  if (!proxyBase) throw new Error('未配置 AI 代理地址，请先在设置里填写');

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.apiKey}`,
  };
  // 让代理知道上游完整基址
  if (config.baseURL) headers['X-AI-Base-Url'] = config.baseURL;

  const payload = { model: config.model, messages, temperature: 0.3 };
  if (Array.isArray(tools) && tools.length) {
    payload.tools = tools;
    payload.tool_choice = 'auto';
  }

  const res = await fetch(`${proxyBase}/chat/completions`, {
    method: 'POST',
    headers,
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
 * 调用一次 chat/completions（非流式，带 tools）。
 * config 默认取当前选中服务商；也可显式传入。
 */
export const callChatCompletion = async ({ messages, tools, config, signal }) => {
  const resolved = config ?? readProviderConfig();
  if (!resolved.apiKey) throw new Error('未配置 API key，请先在设置里填写');
  if (!resolved.baseURL) throw new Error('未配置 Base URL，请先在设置里选择或填写服务商');
  return hasAiBridge()
    ? callViaBridge({ messages, tools, config: resolved })
    : callViaProxy({ messages, tools, config: resolved, signal });
};
