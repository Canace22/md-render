import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '..');
const aiProxyDir = path.join(workspaceRoot, 'server', 'ai-proxy');

const DEFAULT_AI_PROXY_BASE = 'http://127.0.0.1:8788';
const HEALTH_PATH = '/api/health';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

const aiProxyBase = String(process.env.AI_PROXY_BASE || DEFAULT_AI_PROXY_BASE).replace(/\/+$/, '');

const children = new Set();

const log = (message) => {
  process.stdout.write(`[electron:dev] ${message}\n`);
};

const parseProxyUrl = () => {
  try {
    return new URL(aiProxyBase);
  } catch {
    return null;
  }
};

const isLocalProxy = (url) => url && LOCAL_HOSTS.has(url.hostname);

const healthCheck = async () => {
  try {
    const res = await fetch(`${aiProxyBase}${HEALTH_PATH}`, { signal: AbortSignal.timeout(1000) });
    return res.ok;
  } catch {
    return false;
  }
};

const spawnChild = (label, command, args, options = {}) => {
  const child = spawn(command, args, {
    stdio: 'inherit',
    cwd: workspaceRoot,
    env: process.env,
    ...options,
  });

  children.add(child);
  child.on('exit', () => {
    children.delete(child);
  });
  child.on('error', (err) => {
    process.stderr.write(`[${label}] ${err.message}\n`);
  });
  return child;
};

const stopChildren = (signal = 'SIGTERM') => {
  for (const child of children) {
    if (!child.killed) child.kill(signal);
  }
};

const waitForExit = (child) => new Promise((resolve) => {
  child.on('exit', (code, signal) => {
    resolve({ code, signal });
  });
});

const startAiProxyIfNeeded = async () => {
  const proxyUrl = parseProxyUrl();
  if (!isLocalProxy(proxyUrl)) {
    log(`使用远程 AI_PROXY_BASE=${aiProxyBase}，跳过本地 ai-proxy。`);
    return null;
  }

  if (await healthCheck()) {
    log(`ai-proxy 已在 ${aiProxyBase} 运行。`);
    return null;
  }

  const port = proxyUrl.port || (proxyUrl.protocol === 'https:' ? '443' : '80');
  log(`启动本地 ai-proxy：${aiProxyBase}`);
  return spawnChild('ai-proxy', process.execPath, ['server.js'], {
    cwd: aiProxyDir,
    env: {
      ...process.env,
      PORT: process.env.PORT || port,
    },
  });
};

const startElectronDev = () => {
  log('启动 Electron/Vite。');
  return spawnChild('electron-vite', 'pnpm', [
    '--dir',
    workspaceRoot,
    '--filter',
    '@md-render/editor',
    'electron:dev:vite',
  ], {
    env: {
      ...process.env,
      ELECTRON: 'true',
    },
  });
};

process.on('SIGINT', () => {
  stopChildren('SIGINT');
});
process.on('SIGTERM', () => {
  stopChildren('SIGTERM');
});
process.on('exit', () => {
  stopChildren();
});

await startAiProxyIfNeeded();
const electron = startElectronDev();
const { code, signal } = await waitForExit(electron);
stopChildren();

process.exit(code ?? (signal ? 1 : 0));
