const PROVIDERS = {
  minimax: {
    label: 'MiniMax',
    baseURL: 'https://api.minimaxi.com/v1',
    defaultModel: 'MiniMax-M3',
    apiKeyEnv: 'MINIMAX_API_KEY',
  },
  deepseek: {
    label: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
  },
};

function resolveProvider(providerId) {
  const provider = PROVIDERS[providerId];
  if (!provider) return null;
  const apiKey = process.env[provider.apiKeyEnv] || '';
  if (!apiKey) return null;
  return { ...provider, apiKey };
}

function listProviders() {
  return Object.entries(PROVIDERS).map(([id, cfg]) => ({
    id,
    label: cfg.label,
    baseURL: cfg.baseURL,
    defaultModel: cfg.defaultModel,
    hasKey: Boolean(process.env[cfg.apiKeyEnv]),
  }));
}

module.exports = {
  PROVIDERS,
  listProviders,
  resolveProvider,
};
