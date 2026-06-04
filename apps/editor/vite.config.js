import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rendererRoot = path.join(__dirname, 'renderer');

// 是否以 Electron 模式运行（pnpm electron:dev / electron:build）
const isElectron = !!process.env.ELECTRON;

// GitHub Pages 部署时推断 base 路径
const inferBase = () => {
  if (isElectron) return './';
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) return '/';
  const repoName = repo.split('/')[1] || '';
  return repoName ? `/${repoName}/` : '/';
};

export default defineConfig({
  root: rendererRoot,
  base: inferBase(),
  build: {
    outDir: path.join(__dirname, 'dist'),
    emptyOutDir: true,
  },
  plugins: [
    react(),
    // 仅在 Electron 模式下启用插件
    isElectron && electron({
      main: {
        entry: path.join(__dirname, 'main/main.js'),
        vite: {
          root: __dirname,
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              // better-sqlite3 是原生模块，不能被 bundled，必须作为外部依赖
              external: ['better-sqlite3'],
            },
          },
        },
      },
      preload: {
        input: path.join(__dirname, 'main/preload.js'),
        vite: {
          root: __dirname,
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
    port: 3000,
    // Electron 模式下不自动打开浏览器
    open: !isElectron,
    proxy: {
      '/notion-api': {
        target: 'https://api.notion.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/notion-api/, ''),
      },
    },
  },
});
