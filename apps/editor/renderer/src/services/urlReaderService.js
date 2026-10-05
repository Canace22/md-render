import {
  aiReadUrl,
  hasAiUrlReaderBridge,
} from './electronBridge.js';

const normalizeBase = (value) => String(value ?? '').trim().replace(/\/+$/, '');

export const readUrl = async ({ url, aiProxyBase } = {}) => {
  const cleanUrl = String(url ?? '').trim();
  if (!cleanUrl) return { ok: false, error: '网页地址为空' };

  const payload = {
    url: cleanUrl,
    aiProxyBase: normalizeBase(aiProxyBase),
  };

  try {
    if (hasAiUrlReaderBridge()) {
      return await aiReadUrl(payload);
    }

    if (!payload.aiProxyBase) {
      return { ok: false, error: '未配置 AI 代理地址，无法读取网页' };
    }

    const response = await fetch(`${payload.aiProxyBase}/api/url/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: cleanUrl }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      return { ok: false, error: data?.error || `网页读取失败 (${response.status})` };
    }
    return data;
  } catch (error) {
    return { ok: false, error: error?.message || '网页读取失败' };
  }
};
