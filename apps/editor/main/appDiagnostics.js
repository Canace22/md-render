const AI_PROXY_HEALTH_TIMEOUT_MS = 1500;
const AI_PROXY_HEALTH_PATH = '/api/health';
const UPDATER_SUPPORTED_PLATFORMS = new Set(['darwin', 'win32']);
const RUNTIME_VERSION_KEYS = ['electron', 'chrome', 'node', 'v8'];

const normalizeBaseUrl = (value) => String(value ?? '').trim().replace(/\/+$/, '');

const getAiProxySource = (requestedBase) => {
  if (normalizeBaseUrl(requestedBase)) return 'renderer';
  if (normalizeBaseUrl(process.env.AI_PROXY_BASE)) return 'environment';
  return 'default';
};

const getRedactedOrigin = (value) => {
  try {
    return new URL(value).origin;
  } catch {
    return '';
  }
};

const countProviders = (providers) => {
  if (Array.isArray(providers)) return providers.length;
  if (providers && typeof providers === 'object') return Object.keys(providers).length;
  return 0;
};

const probeAiProxy = async ({ aiProxyBase, resolveAiProxyBase, fetchFn }) => {
  const source = getAiProxySource(aiProxyBase);
  let resolvedBase = '';

  try {
    resolvedBase = normalizeBaseUrl(resolveAiProxyBase(aiProxyBase));
  } catch {
    return { origin: '', source, reachable: false, providerCount: 0 };
  }

  const origin = getRedactedOrigin(resolvedBase);
  if (!resolvedBase || !origin) {
    return { origin, source, reachable: false, providerCount: 0 };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_PROXY_HEALTH_TIMEOUT_MS);

  try {
    const response = await fetchFn(`${resolvedBase}${AI_PROXY_HEALTH_PATH}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      return { origin, source, reachable: false, providerCount: 0 };
    }

    const body = await response.json();
    return {
      origin,
      source,
      reachable: body?.ok !== false,
      providerCount: countProviders(body?.providers),
    };
  } catch {
    return { origin, source, reachable: false, providerCount: 0 };
  } finally {
    clearTimeout(timer);
  }
};

const getRuntimeVersions = () => Object.fromEntries(
  RUNTIME_VERSION_KEYS.map((key) => [key, process.versions[key] ?? '']),
);

const getUpdaterDiagnostics = (autoUpdater) => {
  const capabilities = {
    check: typeof autoUpdater?.checkForUpdates === 'function',
    download: typeof autoUpdater?.downloadUpdate === 'function',
    install: typeof autoUpdater?.quitAndInstall === 'function',
  };

  return {
    supported: UPDATER_SUPPORTED_PLATFORMS.has(process.platform),
    available: Object.values(capabilities).every(Boolean),
    capabilities,
  };
};

export function createAppDiagnostics({
  app,
  autoUpdater,
  resolveAiProxyBase,
  getDatabaseDiagnostics,
  fetchFn = globalThis.fetch,
}) {
  return {
    async getSnapshot({ aiProxyBase } = {}) {
      const [aiProxy, database] = await Promise.all([
        probeAiProxy({ aiProxyBase, resolveAiProxyBase, fetchFn }),
        Promise.resolve().then(() => getDatabaseDiagnostics()),
      ]);

      return {
        ok: true,
        capturedAt: new Date().toISOString(),
        app: {
          version: app.getVersion(),
          isPackaged: app.isPackaged,
          platform: process.platform,
          arch: process.arch,
          runtimeVersions: getRuntimeVersions(),
        },
        aiProxy,
        database,
        updater: getUpdaterDiagnostics(autoUpdater),
      };
    },
  };
}
