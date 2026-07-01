/**
 * 预设 AI 服务商（OpenAI 兼容）。
 *
 * 只预设非敏感信息：服务商 id、显示名、完整 baseURL、默认模型。
 *
 * API key 策略：
 * - 内置服务商（minimax）：key 存在主进程 .env，renderer 不接触。
 * - 自定义服务商：用户在设置面板手填，存 localStorage。
 *
 * baseURL 存「完整基址」（含各家自己的路径），请求时统一拼 `${baseURL}/chat/completions`。
 */

export const AI_PROVIDERS = Object.freeze([
  {
    id: 'minimax',
    label: 'MiniMax',
    baseURL: 'https://api.minimax.io/v1',
    defaultModel: 'MiniMax-M3',
  },
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
    id: 'custom',
    label: '自定义（OpenAI 兼容）',
    baseURL: '',
    defaultModel: '',
  },
]);

export const DEFAULT_PROVIDER_ID = 'minimax';

export const getProvider = (id) =>
  AI_PROVIDERS.find((p) => p.id === id) || AI_PROVIDERS.find((p) => p.id === DEFAULT_PROVIDER_ID);
