import {
  aiSearchKnowledge,
  hasAiKnowledgeBridge,
} from './electronBridge.js';

const normalizeBase = (value) => String(value ?? '').trim().replace(/\/+$/, '');

export const searchExternalKnowledge = async ({ query, sources, aiProxyBase } = {}) => {
  const cleanQuery = String(query ?? '').trim();
  const enabledSources = (Array.isArray(sources) ? sources : [])
    .filter((source) => source?.enabled !== false)
    .map(({ id, name, url }) => ({ id, name, url }));

  if (!cleanQuery) return { ok: false, results: [], error: '搜索关键词为空' };
  if (!enabledSources.length) return { ok: false, results: [], error: '没有启用的外挂知识库' };

  const payload = {
    query: cleanQuery,
    sources: enabledSources,
    aiProxyBase: normalizeBase(aiProxyBase),
  };

  if (hasAiKnowledgeBridge()) {
    return aiSearchKnowledge(payload);
  }

  if (!payload.aiProxyBase) {
    return { ok: false, results: [], error: '未配置 AI 代理地址，无法查询外挂知识库' };
  }

  try {
    const response = await fetch(`${payload.aiProxyBase}/api/knowledge/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: payload.query, sources: payload.sources }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      return { ok: false, results: [], error: data?.error || `外挂知识库搜索失败 (${response.status})` };
    }
    return data;
  } catch (error) {
    return { ok: false, results: [], error: error?.message || '外挂知识库搜索失败' };
  }
};
