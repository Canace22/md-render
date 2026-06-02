import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';

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
  base: inferBase(),
  plugins: [
    react(),
    // 仅在 Electron 模式下启用插件
    isElectron && electron({
      main: {
        entry: 'electron/main.js',
      },
      preload: {
        input: 'electron/preload.js',
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
        rewrite: (path) => path.replace(/^\/notion-api/, ''),
      },
    },
  },
});
