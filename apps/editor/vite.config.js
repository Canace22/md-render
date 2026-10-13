import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rendererRoot = path.join(__dirname, 'renderer');
// renderer / main 共用的纯函数目录，统一用 @shared/xxx 引用，避免 ../../../../shared 长链
const sharedAlias = { '@shared': path.join(__dirname, 'shared') };

// blocknote-core 仅消费 dist 构建产物（纯 JS），避免把包的 .ts 源码引入 renderer 构建链
const blocknoteCoreDist = path.join(
  __dirname,
  '..',
  '..',
  'packages',
  'blocknote-core',
  'dist',
  'index.js',
);

// 桌面壳只影响构建入口；Electron 与 Tauri 不能同时启用。
const isElectron = !!process.env.ELECTRON;
const isTauri = !!process.env.TAURI_ENV_PLATFORM;
const isDesktop = isElectron || isTauri;
const tauriDevHost = process.env.TAURI_DEV_HOST;
const WEB_DEV_PORT = 3000;
const TAURI_DEV_PORT = 1420;
const TAURI_HMR_PORT = 1421;

if (isElectron && isTauri) {
  throw new Error('Electron 与 Tauri 构建模式不能同时启用');
}

const normalizePlatform = (platform) => {
  if (platform === 'macos') return 'darwin';
  if (platform === 'windows') return 'win32';
  return platform || '';
};

// GitHub Pages 部署时推断 base 路径
const inferBase = () => {
  if (isDesktop) return './';
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) return '/';
  const repoName = repo.split('/')[1] || '';
  return repoName ? `/${repoName}/` : '/';
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');
  const aiProxyBase = env.VITE_AI_PROXY || env.AI_PROXY_BASE || '';

  return {
    root: rendererRoot,
    base: inferBase(),
    define: {
      __MD_RENDER_AI_PROXY_BASE__: JSON.stringify(aiProxyBase),
      __MD_RENDER_DESKTOP_RUNTIME__: JSON.stringify(
        isElectron ? 'electron' : isTauri ? 'tauri' : 'web',
      ),
      __MD_RENDER_TAURI_PLATFORM__: JSON.stringify(
        isTauri ? normalizePlatform(process.env.TAURI_ENV_PLATFORM) : '',
      ),
    },
    resolve: {
      alias: {
        ...sharedAlias,
        // 明确消费包的 dist 构建产物（ESM），不引入包的 .ts 源码
        '@narrative/blocknote-core': blocknoteCoreDist,
      },
    },
    build: {
      outDir: path.join(__dirname, 'dist'),
      emptyOutDir: true,
    },
    plugins: [
      react(),
      // 仅在 Electron 模式下启用插件
      isElectron && electron({
        main: {
          entry: {
            main: path.join(__dirname, 'main/main.js'),
            databaseSearchWorker: path.join(__dirname, 'main/databaseSearchWorker.js'),
          },
          vite: {
            root: __dirname,
            resolve: { alias: sharedAlias },
            build: {
              outDir: 'dist-electron',
              rollupOptions: {
                // better-sqlite3 是原生模块，不能被 bundled，必须作为外部依赖
                external: ['better-sqlite3', 'electron-updater'],
              },
            },
          },
        },
        preload: {
          input: path.join(__dirname, 'main/preload.js'),
          vite: {
            root: __dirname,
            resolve: { alias: sharedAlias },
            build: {
              outDir: 'dist-electron',
              rollupOptions: {
                output: {
                  // type:module 时插件默认产出 preload.mjs（CJS 内容），Electron 按 ESM 加载会导致 require 失败
                  entryFileNames: 'preload.cjs',
                  chunkFileNames: '[name].cjs',
                },
              },
            },
          },
        },
      }),
    ].filter(Boolean),
    server: {
      port: isTauri ? TAURI_DEV_PORT : WEB_DEV_PORT,
      strictPort: isTauri,
      // 桌面壳会自己打开窗口，不额外打开浏览器。
      open: !isDesktop,
      host: isTauri ? (tauriDevHost || '127.0.0.1') : undefined,
      hmr: isTauri && tauriDevHost
        ? {
            protocol: 'ws',
            host: tauriDevHost,
            port: TAURI_HMR_PORT,
          }
        : undefined,
      watch: {
        ignored: ['**/src-tauri/**'],
      },
    },
  };
});
