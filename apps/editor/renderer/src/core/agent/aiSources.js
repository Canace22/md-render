/**
 * AI 来源（L2）：本机 agent + API 服务商统一成一个列表，负责默认选中、记住选择、每个来源单独记模型、安全模式。
 *
 * 来源 id：本机 agent 是 `local:<agentId>`，API 服务商沿用服务商 id（兼容已存的 `md-renderer-ai-model:<providerId>`）。
 * 本文件不依赖 aiClient（避免循环引用），服务商可用性由调用方传入。
 */

import {
  LOCAL_AGENTS,
  LOCAL_AGENT_KINDS,
  LOCAL_AGENT_STATUS,
  getLocalAgent,
  isRunnableAgent,
} from '../../../../shared/localAgents.js';
import { AI_PROVIDERS, DEFAULT_PROVIDER_ID } from './aiProviders.js';

const ACTIVE_SOURCE_KEY = 'md-renderer-ai-source';
const SAFE_MODE_KEY = 'md-renderer-local-agent-safe-mode';
const DEFAULT_NOTICE_KEY = 'md-renderer-ai-source-default-notice';
const LOCAL_PREFIX = 'local:';
const sourceModelKey = (sourceId) => `md-renderer-ai-model:${sourceId}`;

export const SOURCE_KINDS = Object.freeze({ LOCAL: 'local', API: 'api' });

const readStorage = (key) => {
  try {
    return typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
  } catch {
    return null;
  }
};

const writeStorage = (key, value) => {
  try {
    if (typeof window === 'undefined') return;
    const next = String(value ?? '').trim();
    if (next) window.localStorage.setItem(key, next);
    else window.localStorage.removeItem(key);
  } catch { /* ignore */ }
};

export const toLocalSourceId = (agentId) => `${LOCAL_PREFIX}${agentId}`;

/** 'local:codex' → { kind: 'local', id: 'codex' }；'minimax' → { kind: 'api', id: 'minimax' } */
export const parseSourceId = (sourceId) => {
  const value = String(sourceId ?? '');
  return value.startsWith(LOCAL_PREFIX)
    ? { kind: SOURCE_KINDS.LOCAL, id: value.slice(LOCAL_PREFIX.length) }
    : { kind: SOURCE_KINDS.API, id: value };
};

const STATUS_REASONS = Object.freeze({
  [LOCAL_AGENT_STATUS.NEEDS_LOGIN]: '未登录',
  [LOCAL_AGENT_STATUS.UNSUPPORTED]: '即将支持',
  [LOCAL_AGENT_STATUS.MISSING]: '未安装',
});

/** 不可用的原因（可用时为空串） */
export const getUnavailableReason = (detected) => {
  if (isRunnableAgent(detected)) return '';
  if (detected && !getLocalAgent(detected.id)?.supported && detected.installed) return '即将支持';
  return STATUS_REASONS[detected?.status] || '未安装';
};

/**
 * 默认选中（纯函数）：上次的选择（仍可用）→ 优先级最高的可用本机 agent → 有内置 key 的服务商 → ''（打开设置）。
 * @param {Array} detected            local-agent:detect 的结果
 * @param {string} saved              上次选的来源 id
 * @param {string[]} builtinProviders 有内置 key 的服务商 id
 */
export const pickDefaultSource = (detected = [], saved = '', builtinProviders = []) => {
  const runnable = detected
    .filter((item) => item.kind !== LOCAL_AGENT_KINDS.MODEL_SERVER && isRunnableAgent(item))
    .sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999));
  if (saved) {
    const parsed = parseSourceId(saved);
    if (parsed.kind === SOURCE_KINDS.LOCAL && runnable.some((item) => item.id === parsed.id)) return saved;
    if (parsed.kind === SOURCE_KINDS.API && AI_PROVIDERS.some((provider) => provider.id === parsed.id)) return saved;
  }
  if (runnable.length) return toLocalSourceId(runnable[0].id);
  if (builtinProviders.includes(DEFAULT_PROVIDER_ID)) return DEFAULT_PROVIDER_ID;
  return builtinProviders[0] || '';
};

// ── 检测结果缓存（renderer 侧）────────────────────────────

let detectedAgents = [];
let detectPromise = null;

export const hasLocalAgentDetection = () =>
  typeof window !== 'undefined' && typeof window.electronAPI?.localAgent?.detect === 'function';

/** 检测本机 agent；refresh 时重新检测（主进程也会重读 shell 环境） */
export const loadLocalAgents = async ({ refresh = false } = {}) => {
  if (!hasLocalAgentDetection()) return [];
  if (detectPromise && !refresh) return detectPromise;
  detectPromise = window.electronAPI.localAgent.detect({ refresh })
    .then((res) => {
      detectedAgents = res?.ok && Array.isArray(res.agents) ? res.agents : [];
      return detectedAgents;
    })
    .catch(() => {
      detectPromise = null;
      return detectedAgents;
    });
  return detectPromise;
};

export const getDetectedLocalAgents = () => detectedAgents;

/** 测试用 */
export const setDetectedLocalAgentsForTest = (list) => {
  detectedAgents = list;
  detectPromise = Promise.resolve(list);
};

// ── 选择与配置（localStorage）──────────────────────────────

export const readSavedSourceId = () => String(readStorage(ACTIVE_SOURCE_KEY) ?? '').trim();
export const saveActiveSourceId = (sourceId) => writeStorage(ACTIVE_SOURCE_KEY, sourceId);

/** 某个来源选过的模型；本机 agent 空串 = 跟随默认（不传模型参数） */
export const readSourceModel = (sourceId) => String(readStorage(sourceModelKey(sourceId)) ?? '').trim();
export const saveSourceModel = (sourceId, model) => writeStorage(sourceModelKey(sourceId), model);

export const isLocalAgentSafeMode = () => readStorage(SAFE_MODE_KEY) === '1';
export const setLocalAgentSafeMode = (enabled) => writeStorage(SAFE_MODE_KEY, enabled ? '1' : '');

/** 首次自动选中本机 agent 时只提示一次（U3） */
export const consumeDefaultSourceNotice = (sourceId) => {
  if (!sourceId || readSavedSourceId() || readStorage(DEFAULT_NOTICE_KEY)) return false;
  writeStorage(DEFAULT_NOTICE_KEY, '1');
  return parseSourceId(sourceId).kind === SOURCE_KINDS.LOCAL;
};

/**
 * 统一来源列表（纯函数）：本机 agent 一组、API 服务商一组，带状态。
 * 本机 agent 只列已安装的；没装的不占位置（设置页另有安装指引）。
 */
export const buildAiSourceList = ({ detected = [], builtinProviders = [] } = {}) => {
  const byId = new Map(detected.map((item) => [item.id, item]));
  const local = LOCAL_AGENTS
    .map((agent) => byId.get(agent.id) ?? { id: agent.id, label: agent.label, status: LOCAL_AGENT_STATUS.MISSING, installed: false })
    .filter((item) => item.installed)
    .map((item) => ({
      id: toLocalSourceId(item.id),
      kind: SOURCE_KINDS.LOCAL,
      group: '本机 agent',
      label: item.label ?? getLocalAgent(item.id)?.label ?? item.id,
      agentId: item.id,
      version: item.version ?? '',
      path: item.path ?? '',
      status: item.status,
      available: isRunnableAgent(item),
      reason: getUnavailableReason(item),
    }));
  const api = AI_PROVIDERS.map((provider) => ({
    id: provider.id,
    kind: SOURCE_KINDS.API,
    group: 'API 服务商',
    label: provider.label,
    builtinKey: builtinProviders.includes(provider.id),
    available: true,
    reason: '',
  }));
  return [...local, ...api];
};

/**
 * 本机 agent 的模型选项：首项「跟随默认」（value 为空），之后是预设 / Cursor 的真实列表。
 * @returns {Promise<{ options: Array<{ value, label }>, error?: string }>}
 */
export const loadLocalAgentModelOptions = async (agentId) => {
  const agent = getLocalAgent(agentId);
  let models = (agent?.modelPresets ?? []).map((id) => ({ id, label: id }));
  let defaultModel = '';
  let error = '';
  if (typeof window !== 'undefined' && window.electronAPI?.localAgent?.models) {
    try {
      const res = await window.electronAPI.localAgent.models({ id: agentId });
      if (res?.ok) {
        models = res.models?.length ? res.models : models;
        defaultModel = res.defaultModel ?? '';
        error = res.error ?? '';
      }
    } catch { /* 用预设 */ }
  }
  const followLabel = defaultModel ? `跟随默认（${defaultModel}）` : '跟随默认';
  return {
    options: [{ value: '', label: followLabel }, ...models.map((model) => ({ value: model.id, label: model.label || model.id }))],
    ...(error ? { error } : {}),
  };
};
