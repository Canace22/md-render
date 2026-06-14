/**
 * 预设 AI 服务商（OpenAI 兼容）。
 *
 * 只预设非敏感信息：服务商 id、显示名、完整 baseURL、默认模型。
 * API key 绝不写在这里——由用户在设置面板手填，存 localStorage（不入库）。
 *
 * baseURL 存「完整基址」（含各家自己的路径），因为不是所有家都用 /v1：
 * 例如阿里百炼是 /compatible-mode/v1。请求时统一拼 `${baseURL}/chat/completions`。
 */

export const AI_PROVIDERS = Object.freeze([
  {
    id: 'deepseek',
    label: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
  },
  {
    id: 'aliyun',
    label: '阿里百炼（通义千问）',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-plus',
  },
  {
    id: 'xiaomi-mimo',
    label: '小米 MiMo',
    baseURL: 'https://token-plan-sgp.xiaomimimo.com/v1',
    defaultModel: 'mimo-v2.5-pro',
  },
  {
    id: 'minimax',
    label: 'MiniMax',
    baseURL: 'https://api.minimax.io/v1',
    defaultModel: 'MiniMax-M2',
  },
  {
    id: 'custom',
    label: '自定义（OpenAI 兼容）',
    baseURL: '',
    defaultModel: '',
  },
]);

export const DEFAULT_PROVIDER_ID = 'deepseek';

export const getProvider = (id) =>
  AI_PROVIDERS.find((p) => p.id === id) || AI_PROVIDERS.find((p) => p.id === DEFAULT_PROVIDER_ID);
