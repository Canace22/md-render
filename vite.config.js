import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Infer base path for GitHub Pages project sites, e.g. /<repo>/
// If GITHUB_REPOSITORY exists (on Actions), extract repo name; locally stays '/'
const inferBaseFromRepo = () => {
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) return '/';
  const parts = repo.split('/');
  const repoName = parts[1] || '';
  return repoName ? `/${repoName}/` : '/';
};

export default defineConfig({
  base: inferBaseFromRepo(),
  plugins: [react()],
  server: {
    port: 3000,
    open: true,
    proxy: {
      // 将 /notion-api/* 代理到 https://api.notion.com/*，解决浏览器 CORS 限制
      // 仅在本地开发（npm run dev）时生效；生产部署（GitHub Pages）不支持 Notion 同步
      '/notion-api': {
        target: 'https://api.notion.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/notion-api/, ''),
      },
    },
  }
});

