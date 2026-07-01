/**
 * AI Provider 元数据（renderer 展示用，不含 key）。
 *
 * API Key 存在 ai-proxy server 的 .env 里。
 * Electron 主进程通过调 server 的 /api/chat 接口来发起 AI 请求，
 * 源码中不包含任何 key。
 */

// 内置 provider 列表（与 server/ai-proxy/server.js 保持同步）
export const BUILTIN_PROVIDERS = {
  'minimax': {
    label: 'MiniMax',
    baseURL: 'https://api.minimaxi.com/v1',
    defaultModel: 'MiniMax-M3',
  },
};

/** 列出所有可用 provider（供前端展示，不含敏感信息） */
export function listAvailableProviders() {
  return Object.entries(BUILTIN_PROVIDERS).map(([id, cfg]) => ({
    id,
    label: cfg.label,
    baseURL: cfg.baseURL,
    defaultModel: cfg.defaultModel,
    hasBuiltinKey: true, // 都走 server，前端无需填 key
  }));
}
